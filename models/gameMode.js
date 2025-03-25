const mongoose = require('mongoose');

const gameModeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  entryFee: { type: Number, required: true },
  maxSlots: { type: Number, required: true },
  filledSlots: { type: Number, default: 0 },
  prizes: { type: Map, of: Number },
  status: { type: String, enum: ['open', 'in-progress', 'completed'], default: 'open' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('GameMode', gameModeSchema);