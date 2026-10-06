import { Link } from 'react-router-dom'

const faqs = [
  {
    q: 'Is this a medical diagnosis?',
    a: 'No. DermaScan gives an AI-assisted estimate for educational and awareness purposes only. Always consult a licensed dermatologist for an actual diagnosis and treatment.',
  },
  {
    q: 'What kind of model powers this?',
    a: 'Two trained models. DeepLabV3-ResNet50 segments the lesion from the surrounding skin, then MedLiT — a compact transformer trained on HAM10000 — classifies it into one of seven ISIC categories. A small language model phrases the chatbot answers, but only from the reference articles in our own library.',
  },
  {
    q: 'Is my photo stored anywhere?',
    a: 'No. Finding the lesion happens in your browser, but classifying it needs the server, so the photo is uploaded for that step. It is held in memory only for the length of that one request — used to generate the mask, isolated lesion and Grad-CAM images you get back — then discarded. It is never written to disk and never saved to the database, which holds only the reference articles behind the Disease Library and chatbot.',
  },
  {
    q: 'What conditions can it detect?',
    a: 'Once the model is connected, it will focus on a set of common conditions such as melanocytic nevi, melanoma, basal cell carcinoma, actinic keratosis, and benign keratosis.',
  },
]

const pipeline = [
  {
    step: 'Detection',
    status: 'Live',
    live: true,
    desc: 'Skin and lesion detection runs in your browser on every camera frame. No model, no server — colour analysis against the healthy skin surrounding the area.',
  },
  {
    step: 'Classification',
    status: 'Live',
    live: true,
    desc: 'MedLiT, trained on HAM10000, ranks all seven ISIC categories with a confidence for each. It reads the lesion crop the segmentation model produced, not the whole photo.',
  },
  {
    step: 'Explainability',
    status: 'Live',
    live: true,
    desc: 'The segmentation mask, the isolated lesion and a Grad-CAM heat map all come from the models themselves, so you can check what the prediction was based on.',
  },
  {
    step: 'Chatbot',
    status: 'Live',
    live: true,
    desc: 'A small language model runs on the server and answers only from the reference articles the search finds. It cannot invent facts, and it never comments on your photo or result.',
  },
]

export default function About() {
  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-4xl px-4 pb-16 pt-20 sm:px-6 sm:pt-28">
          <span className="eyebrow text-clay-600">About the project</span>
          <h1 className="text-balance mt-4 text-5xl font-bold leading-[1.05] tracking-tight text-ink-900 sm:text-6xl">
            A second opinion before the{' '}
            <span className="italic text-brand-700">waiting room</span>.
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-ink-700/80">
            DermaScan is a college project exploring how AI can help people get a quick,
            preliminary sense of a skin concern — and, more importantly, decide whether it is
            worth a dermatologist&apos;s time.
          </p>
          <div className="rule mt-10" />
        </div>
      </section>

      {/* Honest status board, rather than a vague "coming soon" line */}
      <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        <h2 className="eyebrow text-ink-500">Where the build stands</h2>
        <div className="mt-6 space-y-4">
          {pipeline.map((p) => (
            <div
              key={p.step}
              className="group flex flex-col gap-3 rounded-2xl border border-ink-900/10 bg-white/70 p-6 shadow-lift backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift-lg sm:flex-row sm:items-start sm:gap-6"
            >
              <div className="flex items-center gap-3 sm:w-44 sm:shrink-0">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    p.live ? 'bg-brand-500' : 'bg-clay-400'
                  }`}
                />
                <span className="text-lg font-semibold tracking-tight text-ink-900">{p.step}</span>
              </div>
              <div className="flex-1">
                <span
                  className={`eyebrow inline-block rounded-full px-2.5 py-1 ${
                    p.live
                      ? 'bg-brand-50 text-brand-700'
                      : 'bg-clay-50 text-clay-700'
                  }`}
                >
                  {p.status}
                </span>
                <p className="mt-3 leading-relaxed text-ink-700/80">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-20 sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
          Frequently asked questions
        </h2>
        <div className="mt-8 overflow-hidden rounded-2xl border border-ink-900/10 bg-white/70 shadow-lift backdrop-blur-sm">
          {faqs.map((f, i) => (
            <details
              key={f.q}
              className={`group p-6 ${i > 0 ? 'border-t border-ink-900/10' : ''}`}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium text-ink-900">
                {f.q}
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-ink-900/15 text-ink-500 transition-transform duration-300 group-open:rotate-45 group-open:border-clay-400 group-open:text-clay-600">
                  +
                </span>
              </summary>
              <p className="mt-4 leading-relaxed text-ink-700/80">{f.a}</p>
            </details>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-clay-300/50 bg-clay-50/70 p-6 text-sm leading-relaxed text-clay-900">
          DermaScan does not provide medical advice, diagnosis, or treatment. Content is for
          informational purposes only. If you have a health concern, contact a qualified
          healthcare provider.
        </div>

        <div className="mt-10 flex flex-wrap gap-4">
          <Link to="/upload" className="btn-primary">
            Try it now
          </Link>
          <Link to="/diseases" className="btn-secondary">
            Browse the disease library
          </Link>
        </div>
      </section>
    </div>
  )
}
