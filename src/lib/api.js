import { CLEAR_SKIN, mockPredict } from './mockPredict'

// Set VITE_API_URL in a .env file to point at the FastAPI backend (see backend/README.md), e.g.:
//   VITE_API_URL=http://localhost:8000/api
// Falls back to the local mock when unset, for frontend-only dev without the backend running.
const API_BASE = import.meta.env.VITE_API_URL

function dataUrlToBlob(dataUrl) {
  const [meta, base64] = dataUrl.split(',')
  const mime = meta.match(/:(.*?);/)[1]
  const bytes = atob(base64)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

// image: either a File (from file input) or a data URL string (from camera capture)
// analysis: on-device skin/lesion result from lib/skinAnalysis. Drives the mock,
// and is sent along to the backend as a hint — the backend's own segmentation
// should take precedence over it.
export async function predictImage(image, analysis) {
  if (!API_BASE) {
    return mockPredict(analysis)
  }

  const blob = typeof image === 'string' ? dataUrlToBlob(image) : image
  const formData = new FormData()
  formData.append('image', blob, 'skin-photo.jpg')
  if (analysis) {
    formData.append(
      'client_analysis',
      JSON.stringify({
        isSkin: analysis.isSkin,
        skinRatio: analysis.skinRatio,
        hasLesion: analysis.hasLesion,
        lesions: analysis.lesions,
        coverage: analysis.coverage,
      }),
    )
  }

  let res
  try {
    res = await fetch(`${API_BASE}/predict`, { method: 'POST', body: formData })
  } catch {
    // fetch only rejects when the request never reached a server. The browser's
    // own message for this is "Failed to fetch", which tells the user nothing
    // about what to do, and a stopped backend is by far the usual cause.
    throw new Error(
      `Could not reach the analysis server at ${API_BASE}. Start the backend (start-backend.cmd) and try again.`,
    )
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(
      `The analysis server returned an error (${res.status}).${detail ? ` ${detail.slice(0, 200)}` : ''}`,
    )
  }

  // Backend response shape, per backend/app/models.py (PredictionResponse):
  // {
  //   results: [{ id, name, severity, summary, advice, reasoning, confidence }, ...],
  //   explanation: { available, note, maskUrl, lesionUrl, gradcamUrl }
  // }
  // results is sorted highest-confidence first; results[0] is the headline.
  const prediction = await res.json()
  return applyClearSkin(prediction, analysis)
}

// The backend classifier always names a condition — it has no "nothing here"
// class, so on its own it can never report healthy skin. The on-device detector
// can, so we reconcile the two.
//
// Safety rule: an all-clear is only shown when the classifier also has nothing
// concerning to say. If it returns a medium or high severity result we show that
// result, even though our colour-based detector found no distinct lesion —
// suppressing a possible melanoma because a heuristic disagreed is not a
// trade we should make.
function applyClearSkin(prediction, analysis) {
  if (!analysis?.isSkin || analysis.hasLesion) return prediction

  const top = prediction?.results?.[0]
  if (top && (top.severity === 'medium' || top.severity === 'high')) {
    return {
      ...prediction,
      noLesionFound: true, // surfaced as a caveat alongside the model's result
    }
  }

  return {
    ...prediction,
    clear: true,
    results: [{ ...CLEAR_SKIN, confidence: 100 }],
  }
}
