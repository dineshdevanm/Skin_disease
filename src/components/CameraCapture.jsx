import { useEffect, useRef, useState } from 'react'
import { analyzeSource, drawLesionOverlay } from '../lib/skinAnalysis'

// How much average luminance difference (0-255 scale) counts as "steady"
const STABILITY_THRESHOLD = 6
// Consecutive steady samples required before auto-capture fires
const STABLE_SAMPLES_NEEDED = 6
const SAMPLE_INTERVAL_MS = 220
// The preview box is 4:3 and the video sits in it with object-cover. Analysing
// that same crop keeps the overlay lined up with what the user actually sees.
const PREVIEW_ASPECT = 4 / 3
// Matches the on-screen framing ring below.
const ROI_SCALE = 0.7
const OVERLAY_W = 480
const OVERLAY_H = 360

export default function CameraCapture({ onCapture }) {
  const videoRef = useRef(null)
  const overlayRef = useRef(null)
  const captureCanvasRef = useRef(null)
  const prevSignatureRef = useRef(null)
  const stableCountRef = useRef(0)
  const streamRef = useRef(null)
  const intervalRef = useRef(null)
  // Read from inside the sampling loop, so refs rather than state.
  const analysisRef = useRef(null)
  const autoRef = useRef(true)

  const [status, setStatus] = useState('requesting') // requesting | live | denied | unsupported
  const [progress, setProgress] = useState(0)
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(true)
  const [detection, setDetection] = useState('idle') // idle | no-skin | object | lesion | clear

  useEffect(() => {
    autoRef.current = autoCaptureEnabled
  }, [autoCaptureEnabled])

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported')
      return
    }

    let cancelled = false

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
        setStatus('live')
      })
      .catch(() => setStatus('denied'))

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      clearInterval(intervalRef.current)
    }
  }, [])

  useEffect(() => {
    if (status !== 'live') return

    intervalRef.current = setInterval(() => {
      const video = videoRef.current
      if (!video || video.readyState < 2) return

      const analysis = analyzeSource(video, {
        roiScale: ROI_SCALE,
        cropAspect: PREVIEW_ASPECT,
      })
      if (!analysis) return
      analysisRef.current = analysis
      paintOverlay(analysis)

      // Anything that isn't skin never counts towards an automatic capture.
      if (!analysis.isSkin) {
        stableCountRef.current = 0
        prevSignatureRef.current = null
        setProgress(0)
        // 'object' means skin was found, but only around the edge of the frame
        // with something else in the middle — a different mistake to correct
        // than pointing the camera at a desk, so it gets its own advice.
        setDetection(analysis.reason === 'object' ? 'object' : 'no-skin')
        return
      }

      setDetection(analysis.hasLesion ? 'lesion' : 'clear')

      const signature = analysis.signature
      const prev = prevSignatureRef.current
      if (prev && prev.length === signature.length) {
        let diffSum = 0
        for (let i = 0; i < signature.length; i++) {
          diffSum += Math.abs(signature[i] - prev[i])
        }
        const avgDiff = diffSum / signature.length

        if (avgDiff < STABILITY_THRESHOLD) {
          stableCountRef.current += 1
        } else {
          stableCountRef.current = 0
        }

        setProgress(
          Math.min(100, Math.round((stableCountRef.current / STABLE_SAMPLES_NEEDED) * 100)),
        )

        if (autoRef.current && stableCountRef.current >= STABLE_SAMPLES_NEEDED) {
          stableCountRef.current = 0
          setProgress(0)
          capture()
          return
        }
      }

      prevSignatureRef.current = signature
    }, SAMPLE_INTERVAL_MS)

    return () => clearInterval(intervalRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const paintOverlay = (analysis) => {
    const canvas = overlayRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, OVERLAY_W, OVERLAY_H)
    if (analysis.isSkin) {
      drawLesionOverlay(ctx, analysis, OVERLAY_W, OVERLAY_H)
    }
  }

  const capture = () => {
    const video = videoRef.current
    if (!video) return

    const analysis =
      analysisRef.current ||
      analyzeSource(video, { roiScale: ROI_SCALE, cropAspect: PREVIEW_ASPECT })

    // Crop to the previewed 4:3 area, so the saved photo matches what was framed
    // and the lesion coordinates stay valid against it.
    const crop = analysis?.crop ?? {
      sx: 0,
      sy: 0,
      sw: video.videoWidth,
      sh: video.videoHeight,
    }
    const canvas = captureCanvasRef.current || document.createElement('canvas')
    captureCanvasRef.current = canvas
    canvas.width = crop.sw
    canvas.height = crop.sh
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)

    streamRef.current?.getTracks().forEach((t) => t.stop())
    clearInterval(intervalRef.current)
    onCapture(dataUrl, analysis)
  }

  if (status === 'unsupported') {
    return (
      <div className="rounded-2xl border-2 border-dashed border-ink-900/15 bg-white/60 p-10 text-center">
        <p className="font-medium text-ink-800">Camera not supported on this browser.</p>
        <p className="mt-1 text-sm text-ink-500">Please use the file upload option instead.</p>
      </div>
    )
  }

  if (status === 'denied') {
    return (
      <div className="rounded-2xl border-2 border-dashed border-red-200 bg-red-50 p-10 text-center">
        <p className="font-medium text-red-700">Camera access was denied.</p>
        <p className="mt-1 text-sm text-red-600">
          Allow camera access in your browser settings, or use the file upload option instead.
        </p>
      </div>
    )
  }

  const ringColor = {
    'no-skin': 'rgba(248, 113, 113, 0.9)',
    object: 'rgba(251, 146, 60, 0.95)',
    lesion: '#0d9488',
    clear: 'rgba(52, 211, 153, 0.9)',
    idle: 'rgba(214, 140, 86, 0.5)',
  }[detection]

  // Both refusals mean the same thing to the rest of the UI: do not capture.
  const blocked = detection === 'no-skin' || detection === 'object'

  let hint = 'Center the area and hold steady'
  if (detection === 'no-skin') {
    hint = "That doesn't look like skin — point the camera at the area you want checked"
  } else if (detection === 'object') {
    hint = "There's something other than skin in the middle — fill the circle with skin"
  } else if (progress >= 100) {
    hint = 'Capturing…'
  } else if (detection === 'lesion') {
    hint = 'Lesion detected — hold steady'
  } else if (detection === 'clear') {
    hint = 'Skin detected, nothing unusual — hold steady'
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-ink-950">
      <div className="relative aspect-[4/3] w-full">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />

        <canvas
          ref={overlayRef}
          width={OVERLAY_W}
          height={OVERLAY_H}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />

        {status === 'requesting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink-950 text-sm text-ink-300">
            Requesting camera access…
          </div>
        )}

        {status === 'live' && (
          <>
            {/* Framing guide — sized to ROI_SCALE, recoloured by what we detect */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className="h-[70%] w-[70%] rounded-full border-4 transition-colors"
                style={{ borderColor: ringColor }}
              />
            </div>

            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4">
              <div className="mx-auto max-w-sm">
                <div className="flex items-center justify-between gap-3 text-xs text-white">
                  <span>
                    {autoCaptureEnabled ? hint : 'Auto-capture off — use the button below'}
                  </span>
                  {autoCaptureEnabled && !blocked && detection !== 'idle' && (
                    <span className="shrink-0">{progress}%</span>
                  )}
                </div>
                {autoCaptureEnabled && (
                  <div className="mt-1 h-1.5 w-full rounded-full bg-white/20">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        blocked ? 'bg-red-400' : 'bg-brand-400'
                      }`}
                      style={{ width: `${blocked ? 100 : progress}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 bg-ink-900 px-4 py-3">
        <label className="flex items-center gap-2 text-xs font-medium text-ink-200">
          <input
            type="checkbox"
            checked={autoCaptureEnabled}
            onChange={(e) => setAutoCaptureEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-ink-600 text-brand-500 focus:ring-brand-500"
          />
          Auto-capture skin only
        </label>
        {/* Deliberately always enabled. The skin gate only holds back *automatic*
            capture — the user can still override it if detection is being
            stubborn on their skin tone or lighting. */}
        <button
          type="button"
          onClick={capture}
          disabled={status !== 'live'}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-ink-700"
        >
          Capture now
        </button>
      </div>
    </div>
  )
}
