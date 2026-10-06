import { useEffect, useState } from 'react'

const STAGES = [
  'Detecting lesion boundaries…',
  'Analyzing texture and color…',
  'Comparing with known patterns…',
  'Preparing your report…',
]

const STAGE_INTERVAL_MS = 1400

export default function ScanningLoader({ image }) {
  const [stageIndex, setStageIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, STAGES.length - 1))
    }, STAGE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  const progress = Math.round(((stageIndex + 1) / STAGES.length) * 100)

  return (
    <div className="flex flex-col items-center gap-6 rounded-2xl border-2 border-dashed border-ink-900/15 bg-white/60 p-10">
      <div className="relative w-full max-w-sm overflow-hidden rounded-xl shadow-sm">
        <img src={image} alt="Analyzing" className="max-h-80 w-full object-contain" />

        <div className="pointer-events-none absolute inset-0 bg-brand-900/10" />

        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-x-0 h-1/4 animate-scan bg-gradient-to-b from-transparent via-brand-300/70 to-transparent" />
        </div>

        <div className="pointer-events-none absolute inset-3 rounded-lg border border-brand-200/80" />
      </div>

      <div className="w-full max-w-sm">
        <p className="text-center text-sm font-medium text-ink-800">{STAGES[stageIndex]}</p>
        <div className="mt-3 h-1.5 w-full rounded-full bg-ink-900/10">
          <div
            className="h-1.5 rounded-full bg-brand-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-3 flex justify-center gap-1.5">
          {STAGES.map((stage, i) => (
            <span
              key={stage}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${
                i <= stageIndex ? 'bg-brand-500' : 'bg-ink-900/20'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
