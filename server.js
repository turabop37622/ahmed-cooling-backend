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
// HEALTH CHECK - Render ke liye
// ============================================
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

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
let Booking, User, Service, Notification, Product, Ad;

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
    Booking      = require('./models/Booking');
    User         = require('./models/User');
    Service      = require('./models/Service');
    Notification = require('./models/Notification');
    Product      = require('./models/Products');   // ✅ NEW
    Ad           = require('./models/Ad');         // ✅ NEW

    console.log('✅ Models loaded successfully');

    // ============================================
    // AUTH ROUTES
    // ============================================
    const authRoutes = require('./routes/auth');
    app.use('/api/auth', authRoutes);
    console.log('✅ Auth routes loaded');

    // ============================================
    // SERVICE ROUTES
    // ============================================
    app.get('/api/services', async (req, res) => {
      const services = await Service.find({ active: true });
      res.json({ success: true, data: services });
    });

    // ============================================
    // BOOKING ROUTES
    // ============================================
    const bookingRoutes = require('./routes/bookings');
    app.use('/api/bookings', bookingRoutes);
    console.log('✅ Booking routes loaded');

    // ============================================
    // ✅ PRODUCT ROUTES (brands, models, categories)
    // ============================================
    const productRoutes = require('./routes/products');
    app.use('/api/products', productRoutes);
    console.log('✅ Product routes loaded');

    // ============================================
    // ✅ ADS ROUTES (post ad, my ads, admin)
    // ============================================
    const adRoutes = require('./routes/ads');
    app.use('/api/ads', adRoutes);
    console.log('✅ Ads routes loaded');

    console.log('✅ All routes loaded successfully\n');

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
      console.log('📦 Available API endpoints:');
      console.log(`   GET  /api/products/categories`);
      console.log(`   GET  /api/products/brands?category=ac`);
      console.log(`   GET  /api/products/models?category=ac&brand=Daikin`);
      console.log(`   POST /api/ads`);
      console.log(`   GET  /api/ads/my-ads`);
      console.log(`   GET  /api/ads/active`);
      console.log(`   PUT  /api/ads/admin/:id/approve`);
      console.log(`   PUT  /api/ads/admin/:id/reject`);
      console.log('════════════════════════════════════════════');
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();

module.exports = app;