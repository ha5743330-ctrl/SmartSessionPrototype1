// ============================
// face_compare.js - REAL Face Authentication (No Histogram)
// ============================

/**
 * Calculate Euclidean distance between two face descriptors
 * Descriptor length = 128 (face-api.js)
 *
 * @param {number[]} d1 - live face descriptor
 * @param {number[]} d2 - stored face descriptor
 * @returns {number} distance (lower = better match)
 */
function euclideanDistance(d1, d2) {
  if (!Array.isArray(d1) || !Array.isArray(d2)) {
    throw new Error("Descriptors must be arrays");
  }

  if (d1.length !== 128 || d2.length !== 128) {
    throw new Error("Face descriptor length must be 128");
  }

  let sum = 0;
  for (let i = 0; i < 128; i++) {
    const diff = d1[i] - d2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Verify if face matches stored user face
 *
 * @param {number[]} liveDescriptor - descriptor from camera
 * @param {number[]} storedDescriptor - descriptor from DB
 * @returns {boolean} true = same person, false = reject
 */
function verifyFace(liveDescriptor, storedDescriptor) {
  if (!storedDescriptor) return false;

  const distance = euclideanDistance(liveDescriptor, storedDescriptor);

  console.log("🔍 Face Match Distance:", distance);
  

  // 🔐 Threshold:
  // 0.45 = very strict
  // 0.55 = balanced (recommended)
  // 0.60 = loose (NOT recommended)
  return distance < 0.55;
}

module.exports = {
  verifyFace
};
