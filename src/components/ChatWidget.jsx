import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { askChatbotStream } from '../lib/chat'

const QUICK_REPLIES = [
  'What is melanoma?',
  'How can I treat melanoma?',
  'How do I protect my skin from the sun?',
]

const GREETING = {
  role: 'bot',
  text: "Hi! Ask me anything about skin conditions, moles or sun safety.",
  references: [],
  internalLinks: [],
  suggestions: QUICK_REPLIES,
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState([GREETING])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const listRef = useRef(null)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, loading])

  const send = async (text) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    // Prior turns go up with the question so follow-ups like "is that serious?"
    // resolve. Only the last few matter, and the server trims further.
    const history = messages
      .filter((m) => m.text)
      .slice(-4)
      .map((m) => ({ role: m.role, text: m.text }))

    setMessages((prev) => [
      ...prev,
      { role: 'user', text: trimmed },
      {
        role: 'bot',
        text: '',
        references: [],
        internalLinks: [],
        suggestions: [],
        streaming: true,
      },
    ])
    setInput('')
    setLoading(true)

    const appendToLast = (chunk) =>
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        next[next.length - 1] = { ...last, text: last.text + chunk }
        return next
      })

    try {
      const sources = await askChatbotStream(trimmed, history, appendToLast)
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        next[next.length - 1] = {
          ...last,
          streaming: false,
          references: sources.references || [],
          internalLinks: sources.internalLinks || [],
          suggestions: sources.suggestions || [],
        }
        return next
      })
    } catch {
      setMessages((prev) => {
        const next = [...prev]
        next[next.length - 1] = {
          role: 'bot',
          text: 'Something went wrong answering that. Please try again.',
          references: [],
          internalLinks: [],
          streaming: false,
        }
        return next
      })
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = (e) => {
    e.preventDefault()
    send(input)
  }

  // Chips under the newest answer. The server picks them from the documents it
  // actually retrieved, so tapping one always lands on something answerable.
  const last = messages[messages.length - 1]
  const followUps = last?.role === 'bot' && !last.streaming ? last.suggestions ?? [] : []

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div
          className={`mb-3 flex flex-col overflow-hidden rounded-2xl border border-ink-900/10 bg-white shadow-xl transition-[width,height] duration-300 ease-out ${
            expanded
              ? 'h-[min(52rem,calc(100vh-8rem))] w-[min(48rem,calc(100vw-2.5rem))]'
              : 'h-[28rem] w-80 sm:w-96'
          }`}
        >
          <div className="flex items-center justify-between bg-brand-600 px-4 py-3 text-white">
            <span className="text-sm font-semibold">Skin Health Assistant</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                aria-label={expanded ? 'Shrink chat' : 'Expand chat'}
                title={expanded ? 'Shrink' : 'Expand'}
                className="rounded-md p-1 hover:bg-brand-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  {expanded ? (
                    // arrows pointing in
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 4v5H4m11-5v5h5M9 20v-5H4m11 5v-5h5" />
                  ) : (
                    // arrows pointing out
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 9V4h5M20 9V4h-5M4 15v5h5m11-5v5h-5" />
                  )}
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="rounded-md p-1 hover:bg-brand-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`rounded-xl px-3 py-2 text-sm ${
                    expanded ? 'max-w-[32rem]' : 'max-w-[85%]'
                  } ${
                    m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-ink-900/10 text-ink-800'
                  }`}
                >
                  <p className="whitespace-pre-wrap">
                    {m.text}
                    {m.streaming && !m.text && (
                      <span className="text-ink-500">Thinking&hellip;</span>
                    )}
                    {m.streaming && m.text && (
                      <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-ink-800 align-middle" />
                    )}
                  </p>
                  {(m.references?.length > 0 || m.internalLinks?.length > 0) && (
                    <div className="mt-2 space-y-1 border-t border-ink-900/10 pt-2">
                      {m.references?.map((ref) => (
                        <a
                          key={ref.url}
                          href={ref.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-xs font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
                        >
                          {ref.label}
                        </a>
                      ))}
                      {m.internalLinks?.map((link) => (
                        <Link
                          key={link.to}
                          to={link.to}
                          onClick={() => setOpen(false)}
                          className="block text-xs font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {!loading && followUps.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {followUps.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="border-t border-ink-900/10 px-4 py-2 text-center text-[11px] text-ink-400">
            General information only — not medical advice.
          </p>

          <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-ink-900/10 p-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question..."
              className="flex-1 rounded-lg border border-ink-900/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-ink-900/20"
            >
              Send
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close chat' : 'Open chat'}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg transition-colors hover:bg-brand-700"
      >
        {open ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
            <path d="M4 4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3v3.5a.5.5 0 0 0 .8.4L12.67 17H20a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4z" />
          </svg>
        )}
      </button>
    </div>
  )
}
