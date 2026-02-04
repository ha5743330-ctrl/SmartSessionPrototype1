// models/Session.js

const mongoose = require('mongoose');

/**
 * Generate a random session code (like TeamViewer session ID)
 * Example output: "A7X9PQ"
 */
function generateSessionCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Session Schema
 */
const sessionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true // Each session must belong to a user
  },
  sessionName: {
    type: String,
    required: true // Name for the session
  },
  sessionCode: {
    type: String,
    unique: true,
    default: generateSessionCode // Automatically generate a code
  },
  description: {
    type: String // Optional description
  },
  createdAt: {
    type: Date,
    default: Date.now // Timestamp of session creation
  },
  active: {
    type: Boolean,
    default: true // Session status
  }
});

/**
 * Ensure truly unique session codes before saving
 */
sessionSchema.pre('save', async function(next) {
  if (!this.sessionCode) {
    let code;
    do {
      code = generateSessionCode();
    } while (await mongoose.models.Session.findOne({ sessionCode: code }));
    this.sessionCode = code;
  }
  next();
});

// Export the Session model
module.exports = mongoose.model('Session', sessionSchema);
