const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 🔥 Define absolute path for storing uploaded face images
const faceDir = path.join(process.cwd(), 'uploads', 'faces');

// Ensure the directory exists
if (!fs.existsSync(faceDir)) {
  fs.mkdirSync(faceDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, faceDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  }
});

// Export multer instance
const upload = multer({ storage });

module.exports = upload;
