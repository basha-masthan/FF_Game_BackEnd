const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const User = require('./models/User');
const GameMode = require('./models/gameMode');

dotenv.config();
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: 'http://localhost:3000' } });

app.use(express.json());
app.use(cors());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB Connected Successfully'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// Email Transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

const otps = new Map();

// Signup - Step 1: Generate and Send OTP
app.post('/api/signup', async (req, res) => {
  const { username, email, phone, password } = req.body;
  console.log('Signup Request:', req.body);

  try {
    const existingUser = await User.findOne({ $or: [{ username }, { email }, { phone }] });
    if (existingUser) return res.status(400).json({ message: 'User already exists' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otps.set(email, { otp, data: { username, email, phone, password } });
    console.log(`OTP Generated for ${email}: ${otp}`);

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your Free Fire Tournament OTP',
      text: `Your OTP is: ${otp}. Enter it on the website to complete signup.`
    };
    await transporter.sendMail(mailOptions);
    console.log('OTP Email Sent');

    res.json({ message: 'OTP sent to your email. Please verify.' });
  } catch (err) {
    console.error('Signup Error:', err);
    res.status(500).json({ message: 'Error generating OTP', error: err.message });
  }
});

// Signup - Step 2: Verify OTP and Save User
app.post('/api/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  console.log('OTP Verification Request:', { email, otp });

  try {
    const storedData = otps.get(email);
    if (!storedData) return res.status(400).json({ message: 'No OTP found for this email' });

    if (storedData.otp !== otp) return res.status(400).json({ message: 'Invalid OTP' });

    const hashedPassword = await bcrypt.hash(storedData.data.password, 10);
    const user = new User({
      username: storedData.data.username,
      email: storedData.data.email,
      phone: storedData.data.phone,
      password: hashedPassword,
      verified: true
    });

    await user.save();
    console.log('User Saved to Database:', user);
    otps.delete(email);

    res.json({ message: 'Signup completed successfully! You can now log in.' });
  } catch (err) {
    console.error('OTP Verification Error:', err);
    res.status(500).json({ message: 'Error verifying OTP', error: err.message });
  }
});

// Login
// app.post('/api/login', async (req, res) => {
//   const { email, password } = req.body;
//   try {
//     const user = await User.findOne({ email });
//     if (!user || !user.verified) return res.status(400).json({ message: 'Invalid credentials or unverified' });

//     const isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch) return res.status(400).json({ message: 'Invalid password' });

//     res.json({ message: 'Login successful', user: { username: user.username, wallet: user.wallet, id: user._id } });
//   } catch (err) {
//     res.status(500).json({ message: 'Error during login' });
//   }
// });

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user || !user.verified) return res.status(400).json({ message: 'Invalid credentials or unverified' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid password' });

    res.json({ 
      message: 'Login successful', 
      user: { 
        id: user._id.toString(), // Explicitly include and convert to string
        username: user.username, 
        wallet: user.wallet 
      } 
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Error during login' });
  }
});


// Get user profile data
app.get('/api/user/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password'); // Exclude password
    if (!user) return res.status(404).json({ error: 'User not found' });
    console.log('Sending user data:', user); // Log what’s sent
    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Server error' });
  }
});
// Get all game modes
app.get('/api/game-modes', async (req, res) => {
  try {
    const gameModes = await GameMode.find({ status: 'open' });
    console.log('Game modes fetched:', gameModes);
    res.json(gameModes);
  } catch (error) {
    console.error('Error fetching game modes:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ... (existing imports and setup)

app.post('/api/wallet/add', async (req, res) => {
  const { userId, amount } = req.body;
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.wallet = (user.wallet || 0) + amount;
    user.transactions = user.transactions || [];
    user.transactions.push({ date: new Date(), amount, type: 'Credit' });
    await user.save();

    res.json({ message: 'Funds added', wallet: user.wallet });
  } catch (error) {
    console.error('Error adding funds:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ... (existing routes)

// Book a slot
app.post('/api/game-modes/:id/book', async (req, res) => {
  const { userId } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const gameMode = await GameMode.findById(req.params.id);
    if (!gameMode || gameMode.filledSlots >= gameMode.maxSlots) {
      return res.status(400).json({ error: 'No slots available' });
    }

    if (user.wallet < gameMode.entryFee) {
      return res.status(400).json({ error: 'Insufficient wallet balance' });
    }

    user.wallet -= gameMode.entryFee;
    user.gameHistory.push({
      gameId: gameMode._id,
      mode: gameMode.title,
      entryFee: gameMode.entryFee,
      date: new Date()
    });
    await user.save();

    gameMode.filledSlots += 1;
    await gameMode.save();

    io.emit('slotUpdate', gameMode);

    res.json({ message: 'Slot booked successfully', gameMode });
  } catch (error) {
    console.error('Booking Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  socket.on('disconnect', () => console.log('User disconnected:', socket.id));
});

// Seed initial game modes
const seedGameModes = async () => {
  try {
    await GameMode.deleteMany({});
    const gameModes = [
      { title: 'Solo 50 Players', entryFee: 15, maxSlots: 50, filledSlots: 0, prizes: { 1: 200, 2: 150, 3: 100, '4-10': 20 } },
      { title: 'Squad Match (12 Teams)', entryFee: 100, maxSlots: 12, filledSlots: 0, prizes: { 1: 500, 2: 300, 3: 200 } },
      { title: 'Duo 40 Players', entryFee: 20, maxSlots: 20, filledSlots: 0, prizes: { 1: 250, 2: 150, 3: 100 } },
      { title: 'Solo Quick 30 Players', entryFee: 10, maxSlots: 30, filledSlots: 0, prizes: { 1: 100, 2: 60, 3: 40 } },
      { title: 'Squad Elite (10 Teams)', entryFee: 120, maxSlots: 10, filledSlots: 0, prizes: { 1: 600, 2: 350, 3: 250 } },
      { title: 'Duo Clash 50 Players', entryFee: 25, maxSlots: 25, filledSlots: 0, prizes: { 1: 300, 2: 200, 3: 150 } },
      { title: 'Solo Pro 60 Players', entryFee: 20, maxSlots: 60, filledSlots: 0, prizes: { 1: 400, 2: 250, 3: 150 } },
      { title: 'Squad Royale (8 Teams)', entryFee: 150, maxSlots: 8, filledSlots: 0, prizes: { 1: 700, 2: 400, 3: 300 } },
      { title: 'Duo Sprint 36 Players', entryFee: 15, maxSlots: 18, filledSlots: 0, prizes: { 1: 150, 2: 100, 3: 70 } },
      { title: 'Solo Survival 70 Players', entryFee: 25, maxSlots: 70, filledSlots: 0, prizes: { 1: 500, 2: 300, 3: 200 } },
    ];
    await GameMode.insertMany(gameModes);
    console.log('Game modes seeded successfully');
  } catch (error) {
    console.error('Error seeding game modes:', error);
  }
};

// Uncomment to seed data, then comment back after running once
seedGameModes();

server.listen(5000, () => console.log('Server running on port 5000'));