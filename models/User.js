const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  type: { type: String, enum: ['add', 'withdraw', 'entry_fee', 'prize'], required: true },
  date: { type: Date, default: Date.now },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' }
});

const gameSlotSchema = new mongoose.Schema({
  gameId: { type: String, required: true },
  mode: { type: String, required: true },
  entryFee: { type: Number, required: true },
  position: { type: Number },
  prize: { type: Number },
  date: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  verified: { type: Boolean, default: false },
  wallet: { type: Number, default: 0 },
  gameHistory: [gameSlotSchema],
  paymentHistory: [paymentSchema],
  totalGamesPlayed: { type: Number, default: 0 },
  totalWins: { type: Number, default: 0 }
});

module.exports = mongoose.model('User', userSchema);