// Browser-side skin and lesion analysis.
//
// Two jobs: stop the camera from auto-capturing things that aren't skin, and
// find the lesion region so it can be highlighted. Deliberately classical
// (chrominance thresholds + connected components) rather than learned, so it
// runs per-frame with no model. When the FastAPI backend is connected its
// segmentation output should win over anything computed here.

// --- tuning ---------------------------------------------------------------

// Share of the region of interest that must read as skin before we call it skin.
const SKIN_RATIO_MIN = 0.5
// An extensive rash or a large lesion can cover most of the frame, which drops
// the overall skin ratio below the bar and would make the camera refuse the
// very cases that matter most. So we also accept the frame when its outer ring
// is clearly skin: that means we're looking at a skin close-up with something
// large in the middle, not at a desk.
const SKIN_RING_RATIO_MIN = 0.55
const RING_INNER = 0.75
// The ring test has an obvious hole: rest a hand at the edge of the frame and
// the ring reads as skin no matter what is in the middle, so a keyboard, a
// phone or a desk gets accepted and then reported as one enormous lesion. So
// accepting on the ring also requires the middle to be a plausible *darkening*
// of the surrounding skin. Pigment, erythema and shadowed lesions all are.
// A key cap is lighter than mid-tone skin, or neutral grey, or both.
const INNER_DARKER_MARGIN = 4
// Below this much skin in the middle of the frame, the middle has to justify
// itself as a lesion rather than being taken on trust.
const INNER_SKIN_RATIO_MIN = 0.45
// A lesion candidate has to be at least this much darker than the skin baseline.
const DARKNESS_MARGIN = 16
// Components smaller than this share of the ROI are noise; larger is probably
// uneven lighting across the whole frame rather than a lesion.
const MIN_LESION_AREA = 0.004
const MAX_LESION_AREA = 0.85
// Hair and shadow edges are long and thin, so they fill little of their own
// bounding box. Real lesions are blobs.
const MIN_FILL_RATIO = 0.3
// A blob must keep this share of itself after erosion to count as solid.
const MIN_INTERIOR_RATIO = 0.18

// Coarse grid used to tell whether the framing has gone still. Comparing a
// small luminance signature between frames is enough and stays cheap.
const SIGNATURE_W = 32
const SIGNATURE_H = 24

export const ANALYSIS_WIDTH = 160
export const ANALYSIS_HEIGHT = 120

// --- skin classification ---------------------------------------------------

// Works in Cb/Cr rather than raw RGB: chrominance holds the skin cluster
// together across tones far better than red/green/blue magnitudes do, which
// matters a lot for how this behaves on deep skin.
//
// Cb/Cr alone is not enough — wood, cardboard, leather and kraft paper all land
// inside the skin chrominance window. What actually separates them is where
// green sits between red and blue. Haemoglobin and melanin absorption put skin
// consistently around 0.60-0.73 on that ratio regardless of tone, while those
// materials ramp far more linearly (0.38-0.54). The saturation ceiling then
// removes the leftovers that do hit the skin ratio, such as terracotta.
const SKIN_GREEN_RATIO_MIN = 0.57
// Upper end is set for inflamed skin: erythema pushes the ratio towards 0.90.
// Red objects that also reach that far (brick, terracotta) are cut by the
// saturation ceiling instead.
const SKIN_GREEN_RATIO_MAX = 0.92
const SKIN_SATURATION_MAX = 0.58

export function isSkinPixel(r, g, b) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b
  if (y < 28 || y > 252) return false // near-black or blown out; no usable colour

  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b

  if (cb < 77 || cb > 137) return false
  if (cr < 133 || cr > 180) return false

  // Skin is red-dominant with green sitting above blue.
  if (r <= b || r < g || g < b) return false

  const max = Math.max(r, g, b)
  if (max === 0) return false
  if ((max - Math.min(r, g, b)) / max > SKIN_SATURATION_MAX) return false

  const spread = r - b
  if (spread < 12) return false // too grey to read a reliable hue
  const greenRatio = (r - g) / spread
  return greenRatio >= SKIN_GREEN_RATIO_MIN && greenRatio <= SKIN_GREEN_RATIO_MAX
}

// --- tissue vs. object -----------------------------------------------------

// Everything above decides whether a *pixel* is skin. That is not enough on its
// own, because a lesion is defined negatively: darker than the skin baseline and
// not skin-coloured. A keyboard in the middle of the frame fits that perfectly.
//
// So a lesion candidate has to also look like tissue. Melanin and haemoglobin
// both absorb more green and blue than red, which keeps skin red-dominant all
// the way from pale skin through erythema to a near-black mole. Manufactured
// surfaces are neutral (r ≈ g ≈ b) or cool, and no lighting makes a grey key cap
// red-dominant.
//
// Both thresholds scale with brightness: a dark mole has a small absolute
// red-blue gap simply because all three channels are small.
function isNeutral(r, g, b) {
  const luma = 0.299 * r + 0.587 * g + 0.114 * b
  return Math.max(r, g, b) - Math.min(r, g, b) < Math.max(6, luma * 0.08)
}

function isTissuePixel(r, g, b) {
  if (r < g - 4) return false // green- or blue-dominant: not tissue at any tone
  const luma = 0.299 * r + 0.587 * g + 0.114 * b
  return r - b >= Math.max(6, luma * 0.07)
}

// Share of a blob allowed to be colourless before it is called an object rather
// than a lesion.
const MAX_NEUTRAL_SHARE = 0.55
// A dark warm-grey key cap is red-dominant enough to pass the test above — it is
// genuinely a brownish colour. What it is not is *saturated*: pigment puts a
// mole around 0.45 and a dark key cap around 0.20. Used as an absolute floor
// only when there is no skin to compare against.
const MIN_TISSUE_SATURATION = 0.25
// For a lesion there is skin to compare against, and the absolute floor is the
// wrong test there: a mole on very pale skin sits near 0.27 only because the
// skin itself sits near 0.20. What holds across tones is that extra pigment
// makes a lesion no less saturated than the skin around it.
const LESION_SATURATION_FACTOR = 0.8

// Mean colour of a blob, plus how much of it has no colour at all.
function blobProfile(pixels, rgb) {
  let sr = 0, sg = 0, sb = 0, neutral = 0
  for (const i of pixels) {
    const p = i * 3
    const r = rgb[p], g = rgb[p + 1], b = rgb[p + 2]
    sr += r; sg += g; sb += b
    if (isNeutral(r, g, b)) neutral++
  }
  const n = pixels.length || 1
  return { r: sr / n, g: sg / n, b: sb / n, neutralShare: neutral / n }
}

function saturation({ r, g, b }) {
  const max = Math.max(r, g, b)
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max
}

function looksLikeTissue(profile, minSaturation = MIN_TISSUE_SATURATION) {
  if (profile.neutralShare > MAX_NEUTRAL_SHARE) return false
  if (!isTissuePixel(profile.r, profile.g, profile.b)) return false
  return saturation(profile) >= minSaturation
}

// --- helpers ---------------------------------------------------------------

// Per-pixel noise makes isolated pixels fail the skin test for trivial reasons
// (a momentarily low red/blue spread), which then cluster into phantom lesions
// on deep skin. Smoothing first is what stops that.
function boxBlur(data, w, h) {
  const out = new Float32Array(w * h * 3)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, n = 0
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= w) continue
          const p = (yy * w + xx) * 4
          r += data[p]; g += data[p + 1]; b += data[p + 2]; n++
        }
      }
      const o = (y * w + x) * 3
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n
    }
  }
  return out
}

// Share of a blob's pixels that survive an erosion. Hairs, creases and shadow
// edges are ~1-2px wide and erode to nothing; a real lesion keeps a solid core.
function interiorRatio(pixels, mask, w, h) {
  let interior = 0
  for (const i of pixels) {
    const x = i % w
    const y = (i / w) | 0
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue
    let solid = true
    for (let dy = -1; dy <= 1 && solid; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!mask[i + dy * w + dx]) { solid = false; break }
      }
    }
    if (solid) interior++
  }
  return pixels.length ? interior / pixels.length : 0
}

// Averages luminance into a coarse grid, for frame-to-frame steadiness checks.
function buildSignature(luma, w, h) {
  const sig = new Float32Array(SIGNATURE_W * SIGNATURE_H)
  const cellW = w / SIGNATURE_W
  const cellH = h / SIGNATURE_H
  for (let gy = 0; gy < SIGNATURE_H; gy++) {
    for (let gx = 0; gx < SIGNATURE_W; gx++) {
      let sum = 0
      let n = 0
      for (let y = Math.floor(gy * cellH); y < Math.floor((gy + 1) * cellH); y++) {
        for (let x = Math.floor(gx * cellW); x < Math.floor((gx + 1) * cellW); x++) {
          sum += luma[y * w + x]
          n++
        }
      }
      sig[gy * SIGNATURE_W + gx] = n ? sum / n : 0
    }
  }
  return sig
}

function median(values) {
  if (!values.length) return 0
  const sorted = Float32Array.from(values).sort()
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Drops isolated specks, then closes the small gaps that leaves behind.
function denoise(mask, w, h) {
  const eroded = new Uint8Array(mask.length)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (!mask[i]) continue
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx || dy) n += mask[i + dy * w + dx]
        }
      }
      if (n >= 4) eroded[i] = 1
    }
  }

  const closed = new Uint8Array(mask.length)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (eroded[i]) {
        closed[i] = 1
        continue
      }
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx || dy) n += eroded[i + dy * w + dx]
        }
      }
      if (n >= 5) closed[i] = 1
    }
  }
  return closed
}

// Flood-fills the mask into blobs, returning them largest-first.
function connectedComponents(mask, w, h) {
  const seen = new Uint8Array(mask.length)
  const queue = new Int32Array(mask.length)
  const components = []

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue

    let head = 0
    let tail = 0
    queue[tail++] = start
    seen[start] = 1

    let area = 0
    let minX = w
    let maxX = -1
    let minY = h
    let maxY = -1

    while (head < tail) {
      const i = queue[head++]
      const x = i % w
      const y = (i / w) | 0
      area++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const ni = ny * w + nx
          if (mask[ni] && !seen[ni]) {
            seen[ni] = 1
            queue[tail++] = ni
          }
        }
      }
    }

    components.push({ area, minX, maxX, minY, maxY, pixels: queue.slice(0, tail) })
  }

  return components.sort((a, b) => b.area - a.area)
}

// --- main entry point ------------------------------------------------------

// roiScale: how much of the frame to look at. The camera passes ~0.7 to match
// its on-screen framing ring; uploaded photos use nearly the whole image.
export function analyzeFrame(imageData, { roiScale = 0.7 } = {}) {
  const { data, width: w, height: h } = imageData
  const cx = w / 2
  const cy = h / 2
  const rx = (w * roiScale) / 2
  const ry = (h * roiScale) / 2

  const rgb = boxBlur(data, w, h)
  const roi = new Uint8Array(w * h)
  const ring = new Uint8Array(w * h)
  const skin = new Uint8Array(w * h)
  const luma = new Float32Array(w * h)

  let roiCount = 0
  let skinCount = 0
  let ringCount = 0
  let ringSkinCount = 0
  // Everything inside the ring, skin or not. The middle of the frame is what is
  // actually being photographed, so it gets checked on its own.
  const innerPixels = []
  const innerLuma = []
  let innerSkinCount = 0
  // Mean skin colour, for judging a lesion's pigment against its surroundings.
  let skinR = 0, skinG = 0, skinB = 0

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const p0 = i * 3
      // Luminance is filled for the whole frame, not just the ROI, so the
      // steadiness signature stays comparable between frames.
      luma[i] = 0.299 * rgb[p0] + 0.587 * rgb[p0 + 1] + 0.114 * rgb[p0 + 2]

      const nx = (x - cx) / rx
      const ny = (y - cy) / ry
      if (nx * nx + ny * ny > 1) continue

      roi[i] = 1
      roiCount++
      const inRing = nx * nx + ny * ny >= RING_INNER * RING_INNER
      if (inRing) ring[i] = 1
      if (inRing) ringCount++

      const r = rgb[p0]
      const g = rgb[p0 + 1]
      const b = rgb[p0 + 2]
      if (!inRing) {
        innerPixels.push(i)
        innerLuma.push(luma[i])
      }
      if (isSkinPixel(r, g, b)) {
        skin[i] = 1
        skinCount++
        skinR += r; skinG += g; skinB += b
        if (inRing) ringSkinCount++
        else innerSkinCount++
      }
    }
  }

  const skinRatio = roiCount ? skinCount / roiCount : 0
  const ringRatio = ringCount ? ringSkinCount / ringCount : 0
  const signature = buildSignature(luma, w, h)

  const ringLuma = []
  const allLuma = []
  for (let i = 0; i < skin.length; i++) {
    if (!skin[i]) continue
    allLuma.push(luma[i])
    if (ring[i]) ringLuma.push(luma[i])
  }

  // `reason` is for the viewfinder: "that isn't skin" and "there's an object in
  // the middle of the frame" need different advice to be useful.
  const reject = (reason) => ({
    signature,
    isSkin: false,
    reason,
    skinRatio,
    ringRatio,
    hasLesion: false,
    lesions: [],
    lesionMask: null,
    coverage: 0,
    width: w,
    height: h,
  })

  if (skinRatio < SKIN_RATIO_MIN && ringRatio < SKIN_RING_RATIO_MIN) return reject('no-skin')

  // Both gates above can be satisfied by skin that is only at the edge of the
  // frame — a hand resting on a desk, a finger beside a keyboard. The middle is
  // what is actually being photographed, so when it isn't skin it has to at
  // least be a plausible darker patch of the same surface. Skin close-ups skip
  // this entirely, lesion or not, because their middle reads as skin.
  const innerSkinRatio = innerPixels.length ? innerSkinCount / innerPixels.length : 0
  if (innerSkinRatio < INNER_SKIN_RATIO_MIN) {
    if (!looksLikeTissue(blobProfile(innerPixels, rgb))) return reject('object')
    // Lighter than the skin around it: a surface the skin is resting on, not a
    // lesion. Only meaningful when there is enough ring skin to compare against.
    if (ringLuma.length >= 40 && median(innerLuma) > median(ringLuma) - INNER_DARKER_MARGIN) {
      return reject('object')
    }
  }

  // Baseline colour of the healthy skin around whatever we're looking for.
  // Measured from the outer ring rather than the whole region: a lesion covering
  // more than half the frame would otherwise drag the median inside itself and
  // leave nothing looking abnormal. The ring is normal skin by construction.
  // Fall back to the full region when the ring is too sparse to be reliable.
  const skinLuma = ringLuma.length >= 40 ? ringLuma : allLuma
  const baseline = median(skinLuma)

  const deviations = skinLuma.map((v) => Math.abs(v - baseline))
  const mad = median(deviations)
  const darkThreshold = baseline - Math.max(DARKNESS_MARGIN, mad * 1.8)

  // A lesion is either notably darker than the surrounding skin, or a patch
  // inside the skin region whose colour isn't skin at all (moles, rashes).
  // Both arms require the pixel to be darker than baseline: skin that reads as
  // non-skin while being *lighter* is a highlight or blown-out glare, not a lesion.
  const candidates = new Uint8Array(w * h)
  for (let i = 0; i < candidates.length; i++) {
    if (!roi[i]) continue
    if (luma[i] >= baseline) continue
    if (!skin[i] || luma[i] < darkThreshold) candidates[i] = 1
  }

  const skinSaturation = skinCount
    ? saturation({ r: skinR / skinCount, g: skinG / skinCount, b: skinB / skinCount })
    : 0
  const minLesionSaturation = Math.min(
    MIN_TISSUE_SATURATION,
    skinSaturation * LESION_SATURATION_FACTOR,
  )

  const cleaned = denoise(candidates, w, h)
  const components = connectedComponents(cleaned, w, h)

  const lesionMask = new Uint8Array(w * h)
  const lesions = []
  let lesionArea = 0

  for (const c of components) {
    const areaRatio = c.area / roiCount
    if (areaRatio < MIN_LESION_AREA || areaRatio > MAX_LESION_AREA) continue

    const bw = c.maxX - c.minX + 1
    const bh = c.maxY - c.minY + 1
    if (bw < 4 || bh < 4) continue
    if (c.area / (bw * bh) < MIN_FILL_RATIO) continue // thin: hair or a shadow edge
    if (interiorRatio(c.pixels, cleaned, w, h) < MIN_INTERIOR_RATIO) continue // no solid core
    if (!looksLikeTissue(blobProfile(c.pixels, rgb), minLesionSaturation)) continue // an object

    for (const i of c.pixels) lesionMask[i] = 1
    lesionArea += c.area

    lesions.push({
      x: c.minX / w,
      y: c.minY / h,
      width: bw / w,
      height: bh / h,
      areaRatio,
    })

    if (lesions.length >= 3) break
  }

  return {
    signature,
    isSkin: true,
    reason: null,
    skinRatio,
    ringRatio,
    hasLesion: lesions.length > 0,
    lesions,
    lesionMask: lesions.length ? lesionMask : null,
    coverage: roiCount ? lesionArea / roiCount : 0,
    width: w,
    height: h,
  }
}

// --- rendering -------------------------------------------------------------

const HIGHLIGHT_RGB = [13, 148, 136] // brand-600

// Paints the lesion mask as a soft tint plus an outlined box, scaled up from
// analysis resolution to whatever the target canvas is. Used both for the live
// camera overlay and for the still image on the results page.
export function drawLesionOverlay(ctx, analysis, targetW, targetH) {
  if (!analysis?.lesionMask) return

  const { lesionMask, width: w, height: h } = analysis

  // Build the mask at analysis resolution, then let drawImage smooth it up so
  // the edges come out soft rather than blocky.
  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = w
  maskCanvas.height = h
  const maskCtx = maskCanvas.getContext('2d')
  const img = maskCtx.createImageData(w, h)
  const [mr, mg, mb] = HIGHLIGHT_RGB
  for (let i = 0; i < lesionMask.length; i++) {
    if (!lesionMask[i]) continue
    const p = i * 4
    img.data[p] = mr
    img.data[p + 1] = mg
    img.data[p + 2] = mb
    img.data[p + 3] = 80 // light enough that the lesion stays visible through it
  }
  maskCtx.putImageData(img, 0, 0)

  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(maskCanvas, 0, 0, targetW, targetH)

  ctx.strokeStyle = `rgb(${mr}, ${mg}, ${mb})`
  ctx.lineWidth = Math.max(2, targetW * 0.005)
  ctx.setLineDash([Math.max(6, targetW * 0.02), Math.max(4, targetW * 0.014)])
  const pad = targetW * 0.012
  for (const l of analysis.lesions) {
    ctx.strokeRect(
      l.x * targetW - pad,
      l.y * targetH - pad,
      l.width * targetW + pad * 2,
      l.height * targetH + pad * 2,
    )
  }
  ctx.restore()
}

// Burns the highlight into a copy of the photo, for the results page gallery.
export function buildHighlightDataUrl(source, analysis) {
  if (!analysis?.lesionMask) return null
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  drawLesionOverlay(ctx, analysis, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.92)
}

// Draws `source` into an offscreen canvas at analysis resolution and analyses it.
// cropAspect crops the source to that aspect ratio first, matching what an
// object-cover video preview actually shows, so overlay coordinates line up.
export function analyzeSource(source, { roiScale = 0.7, cropAspect = null } = {}) {
  const sw = source.videoWidth || source.naturalWidth || source.width
  const sh = source.videoHeight || source.naturalHeight || source.height
  if (!sw || !sh) return null

  let sx = 0
  let sy = 0
  let cw = sw
  let ch = sh
  if (cropAspect) {
    if (sw / sh > cropAspect) {
      cw = sh * cropAspect
      sx = (sw - cw) / 2
    } else {
      ch = sw / cropAspect
      sy = (sh - ch) / 2
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = ANALYSIS_WIDTH
  canvas.height = ANALYSIS_HEIGHT
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(source, sx, sy, cw, ch, 0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT)
  const frame = ctx.getImageData(0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT)

  const analysis = analyzeFrame(frame, { roiScale })
  return { ...analysis, crop: { sx, sy, sw: cw, sh: ch } }
}
