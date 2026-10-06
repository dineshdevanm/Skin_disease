import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { predictImage } from '../lib/api'
import { analyzeSource, buildHighlightDataUrl } from '../lib/skinAnalysis'
import CameraCapture from '../components/CameraCapture'
import ScanningLoader from '../components/ScanningLoader'

// Uploaded photos are already framed by the user, so look at nearly the whole
// image rather than the tighter ring the live camera uses.
const UPLOAD_ROI_SCALE = 0.95

// The two ways a photo can fail the skin check need different advice.
function warningFor(result) {
  return result.reason === 'object'
    ? "The middle of this photo isn't skin — there's an object in the frame. Analyzing it would produce a meaningless result."
    : "This doesn't look like a close-up of skin. Analyzing it would produce a meaningless result."
}

function analyzeDataUrl(dataUrl, roiScale) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(analyzeSource(img, { roiScale }))
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

export default function Upload() {
  const [mode, setMode] = useState('camera') // 'camera' | 'file'
  const [preview, setPreview] = useState(null)
  const [image, setImage] = useState(null) // File or data URL, passed straight to predictImage
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [warning, setWarning] = useState('')
  // Explicit opt-in to analyse a photo that failed the skin check. Kept as an
  // override rather than a hard block: the detector can be wrong, and the user
  // knows what they photographed better than it does.
  const [override, setOverride] = useState(false)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  const handleFile = useCallback((f) => {
    if (!f) return
    if (!f.type.startsWith('image/')) {
      setError('Please upload an image file (JPG, PNG, etc).')
      return
    }
    setError('')
    setWarning('')
    setImage(f)
    setOverride(false)
    const reader = new FileReader()
    reader.onload = async () => {
      setPreview(reader.result)
      // Run the same skin check the camera runs, so an uploaded photo of
      // something that isn't skin gets flagged before it reaches the model.
      const result = await analyzeDataUrl(reader.result, UPLOAD_ROI_SCALE)
      setAnalysis(result)
      if (result && !result.isSkin) setWarning(warningFor(result))
    }
    reader.readAsDataURL(f)
  }, [])

  const handleCameraCapture = useCallback((dataUrl, cameraAnalysis) => {
    setError('')
    setImage(dataUrl)
    setPreview(dataUrl)
    setAnalysis(cameraAnalysis || null)
    setOverride(false)
    // "Capture now" deliberately ignores the skin gate, so it was possible to
    // photograph a keyboard and have it analysed with no warning at all. The
    // same check the upload path runs has to apply here too.
    setWarning(cameraAnalysis && !cameraAnalysis.isSkin ? warningFor(cameraAnalysis) : '')
  }, [])

  const onDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  const onAnalyze = async () => {
    if (!image) return
    setLoading(true)
    setError('')
    try {
      const prediction = await predictImage(image, analysis)
      // Burn the lesion outline into a copy of the photo for the results page.
      let highlight = null
      if (analysis?.hasLesion && preview) {
        highlight = await new Promise((resolve) => {
          const img = new Image()
          img.onload = () => resolve(buildHighlightDataUrl(img, analysis))
          img.onerror = () => resolve(null)
          img.src = preview
        })
      }
      navigate('/results', {
        state: {
          image: preview,
          analysis: analysis
            ? { isSkin: analysis.isSkin, hasLesion: analysis.hasLesion, lesions: analysis.lesions }
            : null,
          highlight,
          ...prediction,
        },
      })
    } catch (err) {
      setError(err.message || 'Something went wrong while analyzing the photo.')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setImage(null)
    setPreview(null)
    setError('')
    setWarning('')
    setAnalysis(null)
    setOverride(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const switchMode = (next) => {
    reset()
    setMode(next)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-20 sm:px-6 sm:pt-28">
      <div className="text-center">
        <span className="eyebrow text-clay-600">Step one</span>
        <h1 className="text-balance mt-4 text-5xl font-bold leading-[1.05] tracking-tight text-ink-900 sm:text-6xl">
          Check your <span className="italic text-brand-700">skin</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-ink-700/80">
          Use your camera for an automatic capture, or upload an existing photo. Finding the
          lesion happens in your browser; the photo is then sent for analysis and never stored.
        </p>
      </div>

      <div className="mt-8 flex justify-center gap-2">
        <button
          type="button"
          onClick={() => switchMode('camera')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            mode === 'camera' ? 'bg-brand-600 text-white' : 'bg-ink-900/10 text-ink-700/80 hover:bg-ink-900/10'
          }`}
        >
          Use camera
        </button>
        <button
          type="button"
          onClick={() => switchMode('file')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            mode === 'file' ? 'bg-brand-600 text-white' : 'bg-ink-900/10 text-ink-700/80 hover:bg-ink-900/10'
          }`}
        >
          Upload photo
        </button>
      </div>

      <div className="mt-6">
        {loading && preview ? (
          <ScanningLoader image={preview} />
        ) : preview ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-ink-900/15 bg-white/60 p-10">
            <img
              src={preview}
              alt="Selected skin area preview"
              className="max-h-80 rounded-xl object-contain shadow-sm"
            />
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-ink-900/15 px-4 py-2 text-sm font-medium text-ink-800 hover:bg-white"
            >
              Retake / choose a different photo
            </button>
          </div>
        ) : mode === 'camera' ? (
          <CameraCapture onCapture={handleCameraCapture} />
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
              isDragging ? 'border-brand-500 bg-brand-50' : 'border-ink-900/15 bg-white/60'
            }`}
          >
            <div className="flex flex-col items-center gap-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="h-14 w-14 text-ink-400"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 16a1 1 0 0 1-1-1V6.41l-2.3 2.3a1 1 0 1 1-1.4-1.42l4-4a1 1 0 0 1 1.4 0l4 4a1 1 0 0 1-1.4 1.42L13 6.41V15a1 1 0 0 1-1 1zM5 20h14"
                />
              </svg>
              <div>
                <p className="font-medium text-ink-800">Drag and drop an image here</p>
                <p className="text-sm text-ink-500">or</p>
              </div>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Browse files
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <p className="text-xs text-ink-400">Supports JPG, PNG. Max 10MB.</p>
            </div>
          </div>
        )}
      </div>

      {warning && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>{warning}</p>
          <label className="mt-3 flex cursor-pointer items-start gap-2 font-medium">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
            />
            Analyze it anyway — I know what I photographed
          </label>
        </div>
      )}

      {analysis?.isSkin && (
        <div
          className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
            analysis.hasLesion
              ? 'border-brand-200 bg-brand-50 text-brand-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {analysis.hasLesion
            ? `Skin detected. ${analysis.lesions.length} area${
                analysis.lesions.length > 1 ? 's' : ''
              } highlighted for analysis.`
            : 'Skin detected, and no distinct lesion stood out in this photo.'}
        </div>
      )}

      {error && <p className="mt-4 text-sm font-medium text-red-600">{error}</p>}

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          disabled={!image || loading || (Boolean(warning) && !override)}
          onClick={onAnalyze}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-8 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-ink-900/20"
        >
          {loading && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
            </svg>
          )}
          {loading ? 'Analyzing...' : 'Analyze photo'}
        </button>
      </div>

      <p className="mt-6 text-center text-xs text-ink-400">
        {import.meta.env.VITE_API_URL
          ? 'Lesion detection runs on this device; segmentation and classification run on the server using trained models. Your photo is never stored.'
          : 'Note: the model backend is not connected — this returns a simulated result for demonstration purposes.'}
      </p>
    </div>
  )
}
