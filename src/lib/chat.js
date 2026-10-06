// Set VITE_API_URL in a .env file to point at the FastAPI backend (see backend/README.md), e.g.:
//   VITE_API_URL=http://localhost:8000/api
// Retrieval and the small local LLM both live server-side
// (backend/app/services/retrieval.py and llm.py) — this file is just the client.
const API_BASE = import.meta.env.VITE_API_URL

const NOT_CONFIGURED = {
  answer:
    'The chatbot backend is not configured yet. Set VITE_API_URL to point at the FastAPI backend (see backend/README.md).',
  references: [],
  internalLinks: [],
  suggestions: [],
}

// Returns { answer, references, internalLinks, suggestions }
export async function askChatbot(message, history = []) {
  if (!API_BASE) {
    return NOT_CONFIGURED
  }

  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  })

  if (!res.ok) {
    throw new Error(`Chat request failed (${res.status})`)
  }

  return res.json()
}

/**
 * Streamed version. The model generates at a handful of tokens per second on
 * CPU, so waiting for the whole answer feels broken — this hands each chunk to
 * `onToken` as it arrives, then resolves with the sources.
 *
 * Returns { references, internalLinks, suggestions }.
 */
export async function askChatbotStream(message, history = [], onToken, signal) {
  if (!API_BASE) {
    onToken?.(NOT_CONFIGURED.answer)
    return { references: [], internalLinks: [], suggestions: [] }
  }

  const res = await fetch(`${API_BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
    signal,
  })

  if (!res.ok || !res.body) {
    throw new Error(`Chat request failed (${res.status})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let sources = { references: [], internalLinks: [], suggestions: [] }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE frames are separated by a blank line; keep any partial frame back.
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''

    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data:'))
      if (!line) continue
      let payload
      try {
        payload = JSON.parse(line.slice(5))
      } catch {
        continue
      }
      if (typeof payload.text === 'string') {
        onToken?.(payload.text)
      } else if (payload.references || payload.internalLinks || payload.suggestions) {
        sources = {
          references: payload.references ?? [],
          internalLinks: payload.internalLinks ?? [],
          suggestions: payload.suggestions ?? [],
        }
      }
    }
  }

  return sources
}
