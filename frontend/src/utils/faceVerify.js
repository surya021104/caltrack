/**
 * Face Verification Utility
 * Uses face-api.js to compare clock-in and clock-out selfies
 * in the browser before allowing clock-out.
 */
let faceapi = null;

let modelsLoaded = false

export async function loadFaceModels() {
  if (modelsLoaded) return true
  try {
    if (!faceapi) {
      faceapi = await import("face-api.js")
    }
    const MODEL_URL = "/models"
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ])
    modelsLoaded = true
    return true
  } catch (err) {
    console.error("Failed to load face models:", err)
    return false
  }
}

/**
 * Get face descriptor from an image source (URL or dataURL).
 * Returns a Float32Array descriptor or null.
 */
async function getDescriptor(imageSrc) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = async () => {
      try {
        const detection = await faceapi
          .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }))
          .withFaceLandmarks(true)
          .withFaceDescriptor()
        resolve(detection?.descriptor ?? null)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = imageSrc
  })
}

/**
 * Checks if a face exists in a single image.
 */
export async function hasFace(imageSrc) {
  const loaded = await loadFaceModels()
  if (!loaded) return true // skip if models fail to load

  const desc = await getDescriptor(imageSrc)
  return !!desc
}


/**
 * Compare two images for face match.
 * @param {string} clockInPhoto  - URL or dataURL of clock-in selfie
 * @param {string} clockOutPhoto - URL or dataURL of clock-out selfie
 * @returns {{ match: boolean, score: number, status: string }}
 *   score is 0–100 (higher = more similar), threshold ~55
 */
export async function verifyFaces(clockInPhoto, clockOutPhoto) {
  if (!clockInPhoto || !clockOutPhoto) {
    return { match: true, score: 0, status: "skipped" }
  }

  const loaded = await loadFaceModels()
  if (!loaded) {
    return { match: true, score: 0, status: "skipped" }
  }

  const [d1, d2] = await Promise.all([
    getDescriptor(clockInPhoto),
    getDescriptor(clockOutPhoto),
  ])

  if (!d1 || !d2) {
    return {
      match: false,
      score: 0,
      status: "no_face",
    }
  }

  const distance = faceapi.euclideanDistance(d1, d2)
  // distance < 0.6 is a match (same person)
  const score = Math.round((1 - distance) * 100)
  const isMatch = distance < 0.6

  return {
    match: isMatch,
    score,
    status: isMatch ? "matched" : "mismatch",
  }
}
