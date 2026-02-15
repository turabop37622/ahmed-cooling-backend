require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ============================================
// MONGODB URI
// ============================================
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is not defined");
  process.exit(1);
}

// ============================================
// MODELS (Loaded after DB connect)
// ============================================
let Booking, User, Service, Notification;

// ============================================
// AUTH MIDDLEWARE
// ============================================
const JWT_SECRET = process.env.JWT_SECRET || 'ahmed-cooling-secret-key-2024-secure-token';

const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

// ============================================
// BASIC ROUTES
// ============================================

app.get('/', (req, res) => {
  res.json({ 
    message: 'Ahmed Cooling Workshop API',
    status: 'Running',
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    version: '2.0'
  });
});

app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'AC Workshop API is working!',
    version: '2.0',
    timestamp: new Date().toISOString(),
    mongoStatus: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    success: true,
    status: 'OK',
    timestamp: new Date().toISOString(),
    mongoStatus: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// ============================================
// START SERVER WITH DB CONNECTION
// ============================================

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    console.log('📍 URI:', MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@'));

    await mongoose.connect(MONGODB_URI);

    console.log('\n✅ MongoDB Connected Successfully!');
    console.log(`📍 Database: ${mongoose.connection.name}`);
    console.log(`📊 Ready State: ${mongoose.connection.readyState}\n`);

    // ============================================
    // LOAD MODELS AFTER CONNECTION
    // ============================================
    Booking = require('./models/Booking');
    User = require('./models/User');
    Service = require('./models/Service');
    Notification = require('./models/Notification');

    console.log('✅ Models loaded successfully');

    // ============================================
    // AUTH ROUTES
    // ============================================

    app.post('/api/auth/register', async (req, res) => {
      try {
        const { name, email, password, phone } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
          return res.status(400).json({ success: false, error: 'User already exists' });
        }

        const user = new User({ name, email, password, phone, role: 'customer' });
        await user.save();

        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '30d' });

        res.status(201).json({
          success: true,
          token,
          user: user.toJSON()
        });

      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    app.post('/api/auth/login', async (req, res) => {
      try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
          return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        const isValid = await user.comparePassword(password);
        if (!isValid) {
          return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '30d' });

        res.json({ success: true, token, user: user.toJSON() });

      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ============================================
    // SERVICE ROUTES
    // ============================================

    app.get('/api/services', async (req, res) => {
      const services = await Service.find({ active: true });
      res.json({ success: true, data: services });
    });

    // ============================================
    // BOOKING ROUTES (IMPORTANT)
    // ============================================

    const bookingRoutes = require('./routes/bookings');
    app.use('/api/bookings', bookingRoutes);

    console.log('✅ Routes loaded successfully\n');

    // ============================================
    // ERROR HANDLING (MUST BE LAST)
    // ============================================

    app.use((err, req, res, next) => {
      console.error('🔴 Server Error:', err);
      res.status(500).json({ success: false, message: err.message });
    });

    app.use((req, res) => {
      res.status(404).json({
        success: false,
        message: 'Route not found',
        path: req.path
      });
    });

    // ============================================
    // START SERVER
    // ============================================

    app.listen(PORT, '0.0.0.0', () => {
      console.log('════════════════════════════════════════════');
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log('════════════════════════════════════════════');
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();

module.exports = app;
