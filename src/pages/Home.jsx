import { Link } from 'react-router-dom'

const steps = [
  {
    title: 'Frame the area',
    desc: 'Point your camera at the concern. It checks every frame for skin and captures on its own once the shot is steady.',
    icon: (
      <path d="M12 16a1 1 0 0 1-1-1V6.41l-2.3 2.3a1 1 0 1 1-1.4-1.42l4-4a1 1 0 0 1 1.4 0l4 4a1 1 0 0 1-1.4 1.42L13 6.41V15a1 1 0 0 1-1 1zM5 20a1 1 0 0 1-1-1v-3a1 1 0 1 1 2 0v2h12v-2a1 1 0 1 1 2 0v3a1 1 0 0 1-1 1H5z" />
    ),
  },
  {
    title: 'Model analysis',
    desc: 'The lesion is isolated from surrounding skin, then compared against the conditions the model was trained on.',
    icon: (
      <path d="M12 2a5 5 0 0 1 5 5v1.1a4.5 4.5 0 0 1 2 3.9v3a4.5 4.5 0 0 1-4.5 4.5h-.6a2.5 2.5 0 0 1-4.8 0H9a4.5 4.5 0 0 1-4.5-4.5v-3a4.5 4.5 0 0 1 2-3.9V7a5 5 0 0 1 5-5z" />
    ),
  },
  {
    title: 'See the reasoning',
    desc: 'You get a ranked breakdown, the region that drove the result, and a plain-language next step.',
    icon: (
      <path d="M11 2a1 1 0 0 1 2 0v2a1 1 0 1 1-2 0V2zm0 18a1 1 0 1 1 2 0v2a1 1 0 1 1-2 0v-2zM2 11a1 1 0 1 1 0 2H0a1 1 0 1 1 0-2h2zm22 0a1 1 0 1 1 0 2h-2a1 1 0 1 1 0-2h2zM6.34 4.93a1 1 0 0 1 1.41 1.41l-1.41 1.42a1 1 0 1 1-1.42-1.42l1.42-1.41zm12.73 12.73a1 1 0 0 1 1.41 1.41l-1.41 1.42a1 1 0 1 1-1.42-1.42l1.42-1.41zM19.07 4.93l1.42 1.41a1 1 0 1 1-1.42 1.42l-1.41-1.42a1 1 0 0 1 1.41-1.41zM6.34 19.07a1 1 0 0 1 1.41-1.41l1.42 1.41a1 1 0 1 1-1.42 1.42l-1.41-1.42zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10z" />
    ),
  },
]

const features = [
  {
    title: 'Knows skin from everything else',
    desc: 'Point it at a desk and nothing happens. Auto-capture only fires on skin, so the model never scores a photo of your keyboard.',
    accent: 'from-brand-400 to-brand-600',
  },
  {
    title: 'Shows you what it looked at',
    desc: 'The lesion is outlined on your own photo, so the result is something you can check rather than just trust.',
    accent: 'from-clay-400 to-clay-600',
  },
  {
    title: 'Says when nothing is wrong',
    desc: 'If no lesion stands out against the surrounding skin, you get a straight answer instead of an invented diagnosis.',
    accent: 'from-brand-500 to-ink-700',
  },
  {
    title: 'Analysed, never stored',
    desc: 'Your photo is analysed in memory and discarded when the response is sent. It is never written to disk or saved in any database.',
    accent: 'from-clay-500 to-brand-600',
  },
]

const conditions = [
  { name: 'Melanocytic nevus', tag: 'Benign', tone: 'brand' },
  { name: 'Melanoma', tag: 'Urgent', tone: 'clay' },
  { name: 'Basal cell carcinoma', tag: 'See a doctor', tone: 'clay' },
  { name: 'Actinic keratosis', tag: 'Monitor', tone: 'brand' },
  { name: 'Benign keratosis', tag: 'Benign', tone: 'brand' },
]

const stats = [
  { value: '5', label: 'Condition classes' },
  { value: '<2s', label: 'Time to a result' },
  { value: '100%', label: 'On-device detection' },
]

export default function Home() {
  return (
    <div>
      {/* ---------------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden">
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24">
          <div className="grid items-center gap-16 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="animate-fade-up">
              <span className="inline-flex items-center gap-2.5 rounded-full border border-clay-300/60 bg-clay-50/80 px-4 py-1.5 text-clay-700 backdrop-blur">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-clay-500" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-clay-600" />
                </span>
                <span className="eyebrow">AI-assisted screening</span>
              </span>

              <h1 className="text-balance mt-7 text-5xl font-bold leading-[1.02] tracking-tight text-ink-900 sm:text-6xl lg:text-7xl">
                Understand your skin,{' '}
                <span className="relative inline-block italic text-brand-700">
                  in seconds
                  {/* Hand-drawn-feeling underline instead of a flat highlight */}
                  <svg
                    className="absolute -bottom-2 left-0 h-3 w-full text-clay-400"
                    viewBox="0 0 200 12"
                    preserveAspectRatio="none"
                    fill="none"
                  >
                    <path
                      d="M2 8.5C40 3.5 90 2.5 198 5.5"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                .
              </h1>

              <p className="mt-8 max-w-xl text-lg leading-relaxed text-ink-700/80">
                Point your camera at a skin concern. DermaScan finds the lesion, outlines it on
                your photo, and gives you an estimate of what it might be — so you know whether
                it is worth a dermatologist&apos;s time.
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link to="/upload" className="btn-primary">
                  Check your skin now
                  <svg
                    className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
                  </svg>
                </Link>
                <Link to="/about" className="btn-secondary">
                  Learn how it works
                </Link>
              </div>

              <div className="mt-12 grid max-w-lg grid-cols-3 gap-4 border-t border-ink-900/10 pt-8">
                {stats.map((s) => (
                  <div key={s.label}>
                    <div className="text-3xl font-bold tracking-tight text-ink-900">{s.value}</div>
                    <div className="eyebrow mt-1 text-ink-500">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Scanner mock — carries the visual weight on the right */}
            <div className="relative animate-fade-up [animation-delay:150ms]">
              <div className="glow-teal absolute -inset-10 -z-10" />

              <div className="relative animate-float">
                <div className="overflow-hidden rounded-[2rem] border border-ink-900/10 bg-ink-950 p-3 shadow-lift-lg">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-clay-200 via-clay-300 to-clay-400">
                    <div className="absolute inset-0 bg-grid-light bg-grid opacity-30" />

                    {/* The lesion being examined */}
                    <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2">
                      <div className="h-full w-full rounded-full bg-gradient-to-br from-ink-800 to-ink-950 opacity-90 blur-[1px]" />
                      <div className="absolute -inset-5 rounded-2xl border-2 border-dashed border-brand-400" />
                      <div className="absolute -inset-5 rounded-2xl bg-brand-500/25" />
                    </div>

                    {/* Sweeping scan line */}
                    <div className="absolute inset-x-0 top-0 h-1/4 animate-scan bg-gradient-to-b from-transparent via-brand-300/60 to-transparent" />

                    {/* Corner brackets */}
                    {[
                      'left-4 top-4 border-l-2 border-t-2 rounded-tl-lg',
                      'right-4 top-4 border-r-2 border-t-2 rounded-tr-lg',
                      'left-4 bottom-4 border-b-2 border-l-2 rounded-bl-lg',
                      'right-4 bottom-4 border-b-2 border-r-2 rounded-br-lg',
                    ].map((pos) => (
                      <div key={pos} className={`absolute h-7 w-7 border-white/70 ${pos}`} />
                    ))}

                    <div className="absolute inset-x-4 bottom-4 rounded-xl bg-ink-950/75 px-4 py-3 backdrop-blur-sm">
                      <div className="flex items-center justify-between text-[0.7rem] text-cream/90">
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
                          Lesion detected
                        </span>
                        <span className="tabular-nums text-brand-300">98%</span>
                      </div>
                      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/15">
                        <div className="h-full w-[98%] rounded-full bg-gradient-to-r from-brand-400 to-brand-300" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating result chip, breaks the frame edge */}
                <div className="absolute -left-6 top-10 rounded-2xl border border-ink-900/10 bg-white/90 px-4 py-3 shadow-lift backdrop-blur sm:-left-10">
                  <div className="eyebrow text-ink-500">Top match</div>
                  <div className="mt-1 font-semibold text-ink-900">Melanocytic nevus</div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-ink-900/10">
                      <span className="block h-full w-3/4 rounded-full bg-brand-500" />
                    </span>
                    <span className="text-xs text-ink-500">low concern</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- Conditions marquee */}
      <section className="border-y border-ink-900/10 bg-white/50 py-6 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 sm:px-6">
          <span className="eyebrow text-ink-500">Trained to recognise</span>
          {conditions.map((c) => (
            <span key={c.name} className="flex items-center gap-2 text-sm text-ink-800">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  c.tone === 'clay' ? 'bg-clay-500' : 'bg-brand-500'
                }`}
              />
              {c.name}
            </span>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------- How it works */}
      <section className="relative py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <span className="eyebrow text-clay-600">The process</span>
            <h2 className="text-balance mt-4 text-4xl font-bold tracking-tight text-ink-900 sm:text-5xl">
              Three steps, no account, no waiting.
            </h2>
            <div className="rule mt-8" />
          </div>

          <div className="relative mt-16 grid gap-8 lg:grid-cols-3">
            {/* Connecting thread behind the cards */}
            <div className="absolute left-0 right-0 top-14 hidden h-px bg-gradient-to-r from-transparent via-ink-900/15 to-transparent lg:block" />

            {steps.map((step, i) => (
              <div
                key={step.title}
                className="group relative rounded-2xl border border-ink-900/10 bg-white/70 p-8 shadow-lift backdrop-blur-sm transition-all duration-500 hover:-translate-y-1.5 hover:shadow-lift-lg"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-ink-800 to-ink-950 text-cream shadow-lift ring-1 ring-inset ring-white/15">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="h-5 w-5"
                    >
                      {step.icon}
                    </svg>
                  </span>
                  <span className="font-serif text-6xl font-bold leading-none text-ink-900/[0.07] transition-colors duration-500 group-hover:text-clay-500/25">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="mt-6 text-2xl font-semibold tracking-tight text-ink-900">
                  {step.title}
                </h3>
                <p className="mt-3 leading-relaxed text-ink-700/75">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Features */}
      <section className="relative overflow-hidden bg-ink-950 py-24 text-cream sm:py-32">
        <div className="pointer-events-none absolute inset-0 bg-grid-light bg-grid opacity-40" />
        <div className="glow-teal pointer-events-none absolute -right-32 top-0 h-[30rem] w-[30rem]" />
        <div className="glow-clay pointer-events-none absolute -bottom-32 -left-24 h-[28rem] w-[28rem]" />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <span className="eyebrow text-clay-400">Why DermaScan</span>
            <h2 className="text-balance mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
              Built to be checkable, not just confident.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-ink-300">
              Most screening demos hand you a percentage and hope you believe it. This one shows
              its working, and admits when it has nothing to report.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2">
            {features.map((f) => (
              <div
                key={f.title}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-8 transition-all duration-500 hover:border-white/20 hover:bg-white/[0.07]"
              >
                <div
                  className={`h-1 w-14 rounded-full bg-gradient-to-r ${f.accent} transition-all duration-500 group-hover:w-24`}
                />
                <h3 className="mt-6 text-xl font-semibold tracking-tight text-cream">{f.title}</h3>
                <p className="mt-3 leading-relaxed text-ink-300">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- CTA */}
      <section className="relative py-24 sm:py-32">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-[2rem] border border-ink-900/10 bg-gradient-to-br from-white via-cream to-clay-50 p-12 text-center shadow-lift-lg sm:p-16">
            <div className="glow-clay pointer-events-none absolute -right-20 -top-20 h-72 w-72" />
            <div className="glow-teal pointer-events-none absolute -bottom-24 -left-16 h-72 w-72" />

            <div className="relative">
              <span className="eyebrow text-clay-600">Free to try</span>
              <h2 className="text-balance mx-auto mt-4 max-w-2xl text-4xl font-bold tracking-tight text-ink-900 sm:text-5xl">
                Ready to check a skin concern?
              </h2>
              <p className="mx-auto mt-5 max-w-lg text-lg leading-relaxed text-ink-700/80">
                Takes about ten seconds. No account, no upload to a server, no cost.
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-4">
                <Link to="/upload" className="btn-primary">
                  Get started
                </Link>
                <Link to="/diseases" className="btn-secondary">
                  Browse the disease library
                </Link>
              </div>
              <p className="mt-8 text-xs text-ink-500">
                Not a substitute for professional medical advice.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
