// models/User.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * Generate a random 6-digit user ID
 */
function generateUserId() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * User Schema
 */
const userSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      
      unique: true,
      required: true,
      default: generateUserId
    },

    name: {
      type: String,
      required: true
    },

    email: {
      type: String,
      unique: true,
      required: true
    },

    password: {
      type: String,
      required: true
    },

    role: {
      type: String,
      default: 'student'
    },

    blocked: {
      type: Boolean,
      default: false
    },

    // 🔐 REAL FACE AUTH DATA
    faceDescriptor: {
      type: [Number], // must be 128 values
      required: false
    }
  },
  { timestamps: true }
);


/**
 * Hash password before save
 */
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

/**
 * Compare password (login use)
 */
userSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', userSchema);
