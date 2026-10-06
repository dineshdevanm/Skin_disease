import { Link } from 'react-router-dom'

const columns = [
  {
    title: 'Product',
    links: [
      { to: '/upload', label: 'Check your skin' },
      { to: '/diseases', label: 'Disease library' },
      { to: '/about', label: 'How it works' },
    ],
  },
  {
    title: 'Conditions covered',
    links: [
      { to: '/diseases', label: 'Melanoma' },
      { to: '/diseases', label: 'Basal cell carcinoma' },
      { to: '/diseases', label: 'Benign keratosis' },
    ],
  },
]

export default function Footer() {
  return (
    <footer className="relative mt-24 overflow-hidden bg-ink-950 text-ink-200">
      {/* Layered light and grid, so the dark band has depth instead of being a slab */}
      <div className="pointer-events-none absolute inset-0 bg-grid-light bg-grid opacity-40" />
      <div className="glow-teal pointer-events-none absolute -left-32 -top-40 h-96 w-96 opacity-60" />
      <div className="glow-clay pointer-events-none absolute -bottom-40 right-0 h-96 w-96 opacity-50" />

      <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-white ring-1 ring-inset ring-white/25">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-5 w-5"
                >
                  <path d="M12 2C8 6 4 10.5 4 15a8 8 0 0 0 16 0c0-4.5-4-9-8-13z" />
                </svg>
              </span>
              <span className="text-xl font-bold tracking-tight text-cream">DermaScan</span>
            </div>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-ink-300">
              An AI-assisted skin screening tool built as a college project — designed to help
              people decide when a skin concern is worth a dermatologist&apos;s time.
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="eyebrow text-clay-400">{col.title}</h3>
              <ul className="mt-5 space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="text-sm text-ink-300 transition-colors hover:text-cream"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 rounded-2xl border border-clay-500/25 bg-clay-500/10 p-5">
          <p className="text-sm leading-relaxed text-clay-100">
            <strong className="font-semibold text-clay-300">Disclaimer:</strong> DermaScan
            provides an AI-assisted estimate for educational purposes only. It is not a medical
            diagnosis. Always consult a qualified dermatologist for any skin concern.
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-8 text-xs text-ink-400 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} DermaScan. Built as a college project.</p>
          <p>Categories based on the ISIC 2019 Challenge dataset.</p>
        </div>
      </div>
    </footer>
  )
}
