// backend/routes/face_auth.js

const express = require('express');
const router = express.Router();
const User = require('../models/User');  // ✅ User model
const { verifyFace } = require('../utils/face_compare'); // Euclidean distance function

// =============================
// FACE LOGIN ROUTE (SECURE)
// =============================
router.post('/face-login', async (req, res) => {
  try {
    const { userId, liveDescriptor } = req.body;

    // 1️⃣ Validate input
    if (!userId || !liveDescriptor) {
      return res.status(400).json({ success: false, message: 'Missing face data' });
    }

    // 2️⃣ Find user
    const user = await User.findOne({ userId });
    if (!user || !user.faceDescriptor) {
      return res.status(404).json({ success: false, message: 'User face not registered' });
    }

    // 3️⃣ Real Face Match
    const matched = verifyFace(liveDescriptor, user.faceDescriptor);

    if (!matched) {
      return res.status(401).json({ success: false, message: 'Face not matched' });
    }

    // 4️⃣ Success
    return res.json({ success: true, message: 'Face verified. Login success' });

  } catch (err) {
    console.error("Face auth error:", err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
