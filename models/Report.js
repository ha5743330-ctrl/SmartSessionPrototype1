// models/Report.js

const mongoose = require('mongoose');

/**
 * Schema for storing user action reports
 */
const reportSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Reference to the User model
    required: true
  },
  action: {
    type: String,
    required: true // Description of the action performed
  },
  timestamp: {
    type: Date,
    default: Date.now // Automatically set to current date/time
  }
});

// Export the Report model
module.exports = mongoose.model('Report', reportSchema);
