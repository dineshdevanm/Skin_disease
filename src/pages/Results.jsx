import { Link, useLocation, useNavigate } from 'react-router-dom'

const severityStyles = {
  none: { badge: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' },
  low: { badge: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' },
  medium: { badge: 'bg-amber-100 text-amber-700', bar: 'bg-amber-500' },
  high: { badge: 'bg-red-100 text-red-700', bar: 'bg-red-500' },
}

export default function Results() {
  const location = useLocation()
  const navigate = useNavigate()
  const { image, results, explanation, clear, highlight, analysis, noLesionFound } =
    location.state || {}

  if (!results || !results.length) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <h1 className="text-2xl font-bold text-ink-900">No results to show</h1>
        <p className="mt-2 text-ink-700/80">Upload a photo first to see an analysis.</p>
        <Link
          to="/upload"
          className="mt-6 inline-block rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Go to upload
        </Link>
      </div>
    )
  }

  const top = results[0]
  const topStyle = severityStyles[top.severity] ?? severityStyles.low

  // Nothing stood out in the photo — show a plain all-clear instead of dressing
  // a non-finding up as a diagnosis with a confidence bar and runner-up list.
  if (clear) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-20 sm:px-6 sm:pt-28">
        <span className="eyebrow text-clay-600">Your result</span>
        <h1 className="text-balance mt-4 text-5xl font-bold leading-[1.05] tracking-tight text-ink-900 sm:text-6xl">
          Analysis results
        </h1>

        <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-8">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="h-6 w-6"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
              </svg>
            </span>
            <div>
              <h2 className="text-xl font-bold text-emerald-900">No problem found with your skin</h2>
              <p className="mt-2 text-sm text-emerald-800">{top.summary}</p>
              <p className="mt-3 text-sm font-medium text-emerald-900">{top.advice}</p>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {image && (
            <div>
              <img
                src={image}
                alt="Analyzed skin area"
                className="w-full rounded-xl object-cover shadow-sm"
              />
              <p className="mt-2 text-center text-xs font-medium text-ink-700/80">Your photo</p>
            </div>
          )}
          <div className="rounded-xl border border-ink-900/10 p-5">
            <h3 className="text-sm font-semibold text-ink-900">How this was checked</h3>
            <p className="mt-2 text-sm text-ink-700/80">{top.reasoning}</p>
          </div>
        </div>

        <div className="mt-8 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Important:</strong> this only covers what was visible in the photo, and it is not
          a medical clearance. If something looks or feels wrong to you, see a dermatologist even
          when this screen says nothing was found.
        </div>

        <div className="mt-8 flex flex-wrap gap-4">
          <button
            type="button"
            onClick={() => navigate('/upload')}
            className="rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Check another photo
          </button>
          <Link
            to="/"
            className="rounded-lg border border-ink-900/15 px-6 py-3 text-sm font-semibold text-ink-800 hover:bg-white"
          >
            Back to home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-20 sm:px-6 sm:pt-28">
      <span className="eyebrow text-clay-600">Your result</span>
      <h1 className="text-balance mt-4 text-5xl font-bold leading-[1.05] tracking-tight text-ink-900 sm:text-6xl">
        Analysis results
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-700/80">
        Here&rsquo;s what our AI-assisted model estimated from your photo.
      </p>

      {noLesionFound && (
        <div className="mt-6 rounded-2xl border border-clay-300/60 bg-clay-50/70 p-5 text-sm leading-relaxed text-clay-900">
          <strong className="font-semibold">Worth knowing:</strong> on-device detection did not
          find a distinct lesion in this photo, but the model still returned a result worth
          taking seriously. That can happen when the concern is diffuse, low-contrast, or fills
          the frame. Retake the photo with some normal skin around the area, and treat the result
          below as the one that matters.
        </div>
      )}

      {analysis?.hasLesion && (
        <p className="mt-3 inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
          {analysis.lesions.length} lesion area
          {analysis.lesions.length > 1 ? 's' : ''} highlighted
        </p>
      )}

      <div className="mt-10 grid gap-8 sm:grid-cols-[220px_1fr]">
        {image && (
          <img
            src={image}
            alt="Analyzed skin area"
            className="h-56 w-full rounded-xl object-cover shadow-sm sm:h-full"
          />
        )}

        <div>
          <div className="rounded-2xl border border-ink-900/10 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-ink-900">{top.name}</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${topStyle.badge}`}>
                {top.severity} concern
              </span>
            </div>
            <p className="mt-3 text-sm text-ink-700/80">{top.summary}</p>
            <p className="mt-3 text-sm font-medium text-ink-800">Suggested next step: {top.advice}</p>
            <div className="mt-4">
              <div className="flex justify-between text-xs text-ink-500">
                <span>Confidence</span>
                <span>{top.confidence}%</span>
              </div>
              <div className="mt-1 h-2 w-full rounded-full bg-ink-900/10">
                <div
                  className={`h-2 rounded-full ${topStyle.bar}`}
                  style={{ width: `${top.confidence}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Generated views */}
      <div className="mt-10 rounded-2xl border border-ink-900/10 p-6">
        <h3 className="text-lg font-semibold text-ink-900">Generated views</h3>

        {!explanation?.available && (
          <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            {explanation?.note ||
              'The server could not produce the explainability views for this photo, so the images below may be incomplete.'}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Original', src: image },
            { label: 'Lesion highlight', src: highlight },
            { label: 'Segmentation mask', src: explanation?.maskUrl },
            { label: 'Lesion (background removed)', src: explanation?.lesionUrl },
            { label: 'Mask over photo', src: explanation?.overlayUrl },
            { label: 'Grad-CAM', src: explanation?.gradcamUrl },
          ]
            .filter((v) => v.src)
            .map((v) => (
              <div key={v.label}>
                <div className="aspect-square overflow-hidden rounded-xl border border-ink-900/10 bg-white/60">
                  <img src={v.src} alt={v.label} className="h-full w-full object-cover" />
                </div>
                <p className="mt-2 text-center text-xs font-medium text-ink-700/80">{v.label}</p>
              </div>
            ))}
        </div>

        <p className="mt-4 text-sm text-ink-700/80">
          <span className="font-medium text-ink-800">Reasoning: </span>
          {top.reasoning || 'Detailed model reasoning will appear here once XAI is integrated.'}
        </p>
      </div>

      <h3 className="mt-10 text-lg font-semibold text-ink-900">Other possibilities considered</h3>
      <div className="mt-4 space-y-3">
        {results.slice(1).map((r) => {
          const style = severityStyles[r.severity]
          return (
            <div key={r.id} className="rounded-xl border border-ink-900/10 p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink-800">{r.name}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.badge}`}>
                  {r.confidence}%
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-ink-900/10">
                <div className={`h-1.5 rounded-full ${style.bar}`} style={{ width: `${r.confidence}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-10 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
        <strong>Important:</strong> This is an AI-generated estimate, not a medical diagnosis.
        Please consult a licensed dermatologist to confirm any result, especially for
        medium or high concern findings.
      </div>

      <div className="mt-8 flex flex-wrap gap-4">
        <button
          type="button"
          onClick={() => navigate('/upload')}
          className="rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Analyze another photo
        </button>
        <Link
          to="/"
          className="rounded-lg border border-ink-900/15 px-6 py-3 text-sm font-semibold text-ink-800 hover:bg-white"
        >
          Back to home
        </Link>
      </div>
    </div>
  )
}
