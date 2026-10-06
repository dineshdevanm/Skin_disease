// Placeholder prediction logic. Swap this out once a trained model + API is ready.
export const CONDITIONS = [
  {
    id: 'nevus',
    name: 'Melanocytic Nevus',
    severity: 'low',
    summary: 'A common mole made of pigment-producing cells. Usually harmless.',
    advice: 'Keep an eye on any changes in size, shape, or color over time.',
    reasoning:
      'The lesion shows a symmetric shape, uniform coloring, and a well-defined border — patterns typically associated with benign moles.',
  },
  {
    id: 'melanoma',
    name: 'Melanoma',
    severity: 'high',
    summary: 'A serious form of skin cancer that develops in pigment-producing cells.',
    advice: 'See a dermatologist as soon as possible for a professional evaluation.',
    reasoning:
      'The lesion shows asymmetry, an irregular border, and uneven color distribution — patterns the model associates with malignant growths.',
  },
  {
    id: 'bkl',
    name: 'Benign Keratosis',
    severity: 'low',
    summary: 'A non-cancerous skin growth, often appearing with age.',
    advice: 'Generally no treatment needed unless it becomes irritated.',
    reasoning:
      'The surface texture appears rough and "stuck-on" with well-demarcated edges, consistent with benign keratosis patterns.',
  },
  {
    id: 'bcc',
    name: 'Basal Cell Carcinoma',
    severity: 'medium',
    summary: 'The most common type of skin cancer; grows slowly and rarely spreads.',
    advice: 'Consult a dermatologist for confirmation and treatment options.',
    reasoning:
      'A pearly, translucent texture and visible surface blood vessels were the dominant patterns influencing this prediction.',
  },
  {
    id: 'akiec',
    name: 'Actinic Keratosis',
    severity: 'medium',
    summary: 'A rough, scaly patch caused by years of sun exposure.',
    advice: 'Can sometimes progress; a dermatologist visit is recommended.',
    reasoning:
      'A rough, scaly texture on sun-exposed skin was the strongest signal contributing to this prediction.',
  },
]

// Shown when the image reads as skin but no distinct lesion was found in it.
// Worded as "nothing found in this photo" rather than a clean bill of health:
// the check compares a region against the healthy skin around it, so it cannot
// speak for anything outside the frame.
export const CLEAR_SKIN = {
  id: 'clear',
  name: 'No visible skin problem',
  severity: 'none',
  summary:
    'We found skin in this photo but no distinct lesion, mole, or discoloured patch standing out from the surrounding area.',
  advice:
    'Nothing here needs attention right now. If you can see or feel something the photo missed, retake it closer and in better light, or check with a dermatologist.',
  reasoning:
    'The framed area was compared against the healthy skin surrounding it. No region differed enough in colour or darkness to be marked as a lesion.',
}

// Simulates a backend call. Returns a random plausible prediction after a short
// delay — or the clear-skin verdict when the on-device analysis found no lesion.
export function mockPredict(analysis) {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (analysis && analysis.isSkin && !analysis.hasLesion) {
        resolve({
          clear: true,
          results: [{ ...CLEAR_SKIN, confidence: 100 }],
          explanation: {
            available: false,
            note: 'Based on on-device image analysis only. Connect the model backend for a real per-condition assessment.',
          },
        })
        return
      }

      const shuffled = [...CONDITIONS].sort(() => Math.random() - 0.5)
      const top = shuffled.slice(0, 3).map((c, i) => ({
        ...c,
        confidence: Math.max(5, Math.round((1 / (i + 1.5)) * 60 + Math.random() * 10)),
      }))
      top.sort((a, b) => b.confidence - a.confidence)

      resolve({
        results: top,
        explanation: {
          available: false,
          note: 'Explainability (XAI) is not yet connected — this is placeholder guidance based on general condition patterns, not a real per-image analysis.',
          // The real backend (backend/app/services/model_service.py) generates maskUrl/lesionUrl/
          // gradcamUrl images. This pure-frontend mock skips them; Results.jsx's gallery just
          // shows the original photo when they're absent.
        },
      })
    }, 1600)
  })
}
