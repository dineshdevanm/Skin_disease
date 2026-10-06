import { useEffect, useMemo, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_URL

const ISIC_LINKS = [
  { label: 'ISIC 2019 Challenge (official)', url: 'https://challenge2019.isic-archive.com/' },
  { label: 'ISIC Archive', url: 'https://www.isic-archive.com/' },
]

const categoryStyles = {
  Benign: 'bg-emerald-100 text-emerald-700',
  'Pre-cancerous': 'bg-amber-100 text-amber-700',
  Malignant: 'bg-red-100 text-red-700',
}

export default function DiseaseLibrary() {
  const [query, setQuery] = useState('')
  const [diseases, setDiseases] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error

  useEffect(() => {
    if (!API_BASE) {
      setStatus('error')
      return
    }

    fetch(`${API_BASE}/diseases`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        return res.json()
      })
      .then((data) => {
        setDiseases(data)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }, [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return diseases
    return diseases.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.abbr.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q) ||
        (d.keywords || []).some((k) => k.includes(q))
    )
  }, [diseases, query])

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-20 sm:px-6 sm:pt-28">
      <span className="eyebrow text-clay-600">Reference</span>
      <h1 className="text-balance mt-4 text-5xl font-bold leading-[1.05] tracking-tight text-ink-900 sm:text-6xl">
        Disease <span className="italic text-brand-700">library</span>
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-700/80">
        The diagnostic categories from the{' '}
        <a
          href="https://challenge2019.isic-archive.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
        >
          ISIC 2019 Challenge
        </a>{' '}
        dataset — the same categories our model is built around. Each entry links to independent,
        professionally maintained dermatology references for further reading.
      </p>

      <div className="mt-8 relative">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400"
        >
          <circle cx="11" cy="11" r="7" />
          <path strokeLinecap="round" d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, abbreviation, or category (e.g. melanoma, BCC, benign)"
          className="w-full rounded-lg border border-ink-900/15 py-3 pl-11 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {status === 'loading' && (
        <p className="mt-6 text-sm text-ink-500">Loading the disease library…</p>
      )}

      {status === 'error' && (
        <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          Couldn&rsquo;t load the disease library from the backend. Make sure the API is running and
          VITE_API_URL is set (see backend/README.md).
        </div>
      )}

      {status === 'ready' && (
        <>
          <p className="mt-3 text-sm text-ink-500">
            {results.length} of {diseases.length} condition{diseases.length === 1 ? '' : 's'}
          </p>

          <div className="mt-4 space-y-4">
            {results.map((d) => (
              <div key={d.id} className="rounded-2xl border border-ink-900/10 p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-semibold text-ink-900">{d.name}</h2>
                  <span className="rounded-full bg-ink-900/10 px-2.5 py-0.5 text-xs font-semibold text-ink-700/80">
                    {d.abbr}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${categoryStyles[d.category]}`}>
                    {d.category}
                  </span>
                </div>

                <p className="mt-3 text-sm text-ink-700/80">{d.summary}</p>

                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-700/80">
                  {d.keyPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>

                <div className="mt-4 flex flex-wrap gap-3">
                  {d.references.map((ref) => (
                    <a
                      key={ref.url}
                      href={ref.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
                    >
                      {ref.label}
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                        <path d="M14 3a1 1 0 1 0 0 2h3.586l-9.293 9.293a1 1 0 0 0 1.414 1.414L19 6.414V10a1 1 0 1 0 2 0V4a1 1 0 0 0-1-1h-6zM5 5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a1 1 0 1 0-2 0v5H5V7h5a1 1 0 1 0 0-2H5z" />
                      </svg>
                    </a>
                  ))}
                </div>
              </div>
            ))}

            {results.length === 0 && (
              <div className="rounded-2xl border border-dashed border-ink-900/15 p-10 text-center text-sm text-ink-500">
                No conditions match &ldquo;{query}&rdquo;. Try a different search term.
              </div>
            )}
          </div>
        </>
      )}

      <div className="mt-10 rounded-xl bg-white/60 p-5 text-sm text-ink-700/80">
        <p className="font-medium text-ink-800">About this list</p>
        <p className="mt-1">
          These categories are sourced from the backend&rsquo;s disease library, seeded from the ISIC
          2019 Challenge training set. Learn more about the dataset itself:{' '}
          {ISIC_LINKS.map((l, i) => (
            <span key={l.url}>
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
              >
                {l.label}
              </a>
              {i < ISIC_LINKS.length - 1 ? ', ' : '.'}
            </span>
          ))}
        </p>
        <p className="mt-2">
          This page is for educational reference only and is not a diagnostic tool. Always consult
          a licensed dermatologist for any skin concern.
        </p>
      </div>
    </div>
  )
}
