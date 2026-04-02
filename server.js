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
// GOOGLE SEARCH CONSOLE VERIFICATION
// ============================================
app.get('/google2c7ef9c93df45db9.html', (req, res) => {
  res.type('text/html').send('google-site-verification: google2c7ef9c93df45db9.html');
});

// ============================================
// HOMEPAGE - with privacy policy link
// ============================================
app.get('/', (req, res) => {
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ahmed Cooling Workshop - Professional AC & Cooling Services</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; color: #333; line-height: 1.7; }
    .hero { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; padding: 50px 20px; text-align: center; }
    .hero h1 { font-size: 32px; margin-bottom: 10px; }
    .hero p { font-size: 18px; opacity: 0.9; max-width: 600px; margin: 0 auto; }
    .content { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    h2 { color: #1a1a2e; margin: 30px 0 15px; font-size: 22px; border-left: 4px solid #667eea; padding-left: 12px; }
    p, li { font-size: 15px; color: #555; margin-bottom: 10px; }
    ul { padding-left: 20px; margin-bottom: 15px; }
    .features { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0 30px; }
    .feature { background: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.06); }
    .feature strong { display: block; margin-bottom: 5px; color: #1a1a2e; }
    .feature p { font-size: 13px; margin: 0; }
    .policy-box { background: #fff; border: 2px solid #667eea; border-radius: 12px; padding: 25px; margin: 30px 0; text-align: center; }
    .policy-box p { font-size: 15px; color: #555; margin-bottom: 15px; }
    .policy-box a { display: inline-block; background: #667eea; color: #fff; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; margin: 5px 10px; }
    .policy-box a:hover { background: #5a6fd6; }
    .policy-box a.secondary { background: #fff; color: #667eea; border: 2px solid #667eea; }
    .footer { text-align: center; padding: 20px; font-size: 13px; color: #999; border-top: 1px solid #eee; margin-top: 20px; }
    .footer a { color: #667eea; text-decoration: none; }
  </style>
</head>
<body>
  <div class="hero">
    <h1>Ahmed Cooling Workshop</h1>
    <p>Professional AC &amp; Cooling Installation, Repair, and Maintenance Services at Your Doorstep</p>
  </div>
  <div class="content">
    <h2>About Our App</h2>
    <p>Ahmed Cooling Workshop is a mobile application that connects customers with professional AC and cooling service technicians. Our app allows users to browse available services, book appointments for AC installation, repair, and maintenance, track service progress in real-time, and leave reviews after service completion.</p>

    <h2>Our Services</h2>
    <div class="features">
      <div class="feature"><strong>AC Installation</strong><p>Professional installation of all AC brands and models at your home or office.</p></div>
      <div class="feature"><strong>AC Repair</strong><p>Expert diagnosis and repair of AC units, including gas refilling and part replacement.</p></div>
      <div class="feature"><strong>Maintenance</strong><p>Regular servicing and preventive maintenance to keep your AC running efficiently.</p></div>
      <div class="feature"><strong>Online Booking</strong><p>Easy appointment scheduling through our mobile app with real-time tracking.</p></div>
    </div>

    <h2>How We Use Your Data</h2>
    <p>Ahmed Cooling Workshop uses Google Sign-In to provide a simple and secure login experience. When you sign in with your Google account, we only access your basic profile information (name, email address, and profile picture) for the following purposes:</p>
    <ul>
      <li><strong>Account Creation &amp; Authentication:</strong> To create and manage your user account securely.</li>
      <li><strong>Booking Management:</strong> To associate your service bookings with your account and send you booking confirmations and updates.</li>
      <li><strong>Communication:</strong> To send you service-related notifications, booking reminders, and support responses via email.</li>
    </ul>
    <p>We do not access your Google contacts, calendar, drive, or any other Google data beyond basic profile information. We do not sell or share your personal data with third parties for advertising purposes. For complete details, please read our Privacy Policy linked below.</p>

    <div class="policy-box">
      <p>Please review our Privacy Policy and Terms of Service for complete details on how we handle your data.</p>
      <a href="https://ahmed-cooling-backend.onrender.com/privacy-policy">Privacy Policy</a>
      <a href="https://ahmed-cooling-backend.onrender.com/terms-of-service" class="secondary">Terms of Service</a>
    </div>
  </div>
  <div class="footer">
    <p>&copy; ${new Date().getFullYear()} Ahmed Cooling Workshop. All rights reserved.</p>
    <p style="margin-top:8px;"><a href="https://ahmed-cooling-backend.onrender.com/privacy-policy">Privacy Policy</a> &nbsp;|&nbsp; <a href="https://ahmed-cooling-backend.onrender.com/terms-of-service">Terms of Service</a></p>
  </div>
</body>
</html>`);
});

// ✅ RENDER HEALTH CHECK (VERY IMPORTANT)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// ============================================
// PRIVACY POLICY
// ============================================
app.get('/privacy-policy', (req, res) => {
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy - Ahmed Cooling Workshop</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; color: #333; line-height: 1.7; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; padding: 40px 20px; text-align: center; }
    .header h1 { font-size: 28px; margin-bottom: 5px; }
    .header p { opacity: 0.85; font-size: 14px; }
    .content { max-width: 800px; margin: 30px auto; padding: 40px; background: #fff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
    h2 { color: #1a1a2e; margin: 25px 0 10px; font-size: 20px; border-left: 4px solid #667eea; padding-left: 12px; }
    p, li { font-size: 15px; color: #555; margin-bottom: 10px; }
    ul { padding-left: 20px; }
    .footer { text-align: center; padding: 20px; font-size: 13px; color: #999; }
    .footer a { color: #667eea; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Privacy Policy</h1>
    <p>Ahmed Cooling Workshop &mdash; Last updated: April 1, 2026</p>
  </div>
  <div class="content">
    <h2>1. Introduction</h2>
    <p>Ahmed Cooling Workshop ("we", "our", or "us") operates the Ahmed Cooling mobile application. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our application.</p>

    <h2>2. Information We Collect</h2>
    <p>We may collect the following types of information:</p>
    <ul>
      <li><strong>Personal Information:</strong> Name, email address, phone number, and address when you create an account or place a booking.</li>
      <li><strong>Authentication Data:</strong> We use Google Sign-In for authentication. When you sign in with Google, we receive your name, email, and profile picture from your Google account.</li>
      <li><strong>Booking Information:</strong> Details about the services you book, including service type, date, time, location, and any notes you provide.</li>
      <li><strong>Device Information:</strong> Device type, operating system, and app version for analytics and troubleshooting.</li>
    </ul>

    <h2>3. How We Use Your Information</h2>
    <ul>
      <li>To create and manage your account.</li>
      <li>To process and manage your service bookings.</li>
      <li>To send booking confirmations, updates, and notifications via email, SMS, or WhatsApp.</li>
      <li>To improve our services and user experience.</li>
      <li>To respond to your inquiries and provide customer support.</li>
    </ul>

    <h2>4. Google User Data</h2>
    <p>When you sign in using Google, we access your basic profile information (name, email, and profile picture) solely for authentication and account creation. We do not access, store, or share any other Google user data such as contacts, calendar, drive files, or browsing history. Our use of Google user data complies with the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>

    <h2>5. Data Sharing</h2>
    <p>We do not sell, trade, or rent your personal information to third parties. We may share information only in the following cases:</p>
    <ul>
      <li>With service technicians assigned to your booking (limited to information needed to complete the service).</li>
      <li>With third-party service providers who assist in operating our app (e.g., cloud hosting, email/SMS services) under strict confidentiality agreements.</li>
      <li>If required by law or to protect our legal rights.</li>
    </ul>

    <h2>6. Data Security</h2>
    <p>We implement appropriate technical and organizational security measures to protect your personal data, including encrypted data transmission (HTTPS), secure password hashing, and JWT-based authentication tokens.</p>

    <h2>7. Data Retention</h2>
    <p>We retain your personal data for as long as your account is active or as needed to provide services. You may request deletion of your account and associated data at any time by contacting us.</p>

    <h2>8. Your Rights</h2>
    <ul>
      <li>Access, update, or delete your personal information.</li>
      <li>Opt out of promotional communications.</li>
      <li>Request a copy of your data.</li>
      <li>Withdraw consent for data processing at any time.</li>
    </ul>

    <h2>9. Children's Privacy</h2>
    <p>Our service is not directed to individuals under the age of 13. We do not knowingly collect personal information from children.</p>

    <h2>10. Changes to This Policy</h2>
    <p>We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.</p>

    <h2>11. Contact Us</h2>
    <p>If you have questions about this Privacy Policy, please contact us:</p>
    <ul>
      <li><strong>App:</strong> Ahmed Cooling Workshop</li>
      <li><strong>Website:</strong> <a href="https://ahmed-cooling-backend.onrender.com">https://ahmed-cooling-backend.onrender.com</a></li>
    </ul>
  </div>
  <div class="footer">
    <p><a href="/">← Back to Home</a> &nbsp;|&nbsp; &copy; ${new Date().getFullYear()} Ahmed Cooling Workshop</p>
  </div>
</body>
</html>`);
});

// ============================================
// TERMS OF SERVICE
// ============================================
app.get('/terms-of-service', (req, res) => {
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terms of Service - Ahmed Cooling Workshop</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; color: #333; line-height: 1.7; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; padding: 40px 20px; text-align: center; }
    .header h1 { font-size: 28px; margin-bottom: 5px; }
    .header p { opacity: 0.85; font-size: 14px; }
    .content { max-width: 800px; margin: 30px auto; padding: 40px; background: #fff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
    h2 { color: #1a1a2e; margin: 25px 0 10px; font-size: 20px; border-left: 4px solid #667eea; padding-left: 12px; }
    p, li { font-size: 15px; color: #555; margin-bottom: 10px; }
    ul { padding-left: 20px; }
    .footer { text-align: center; padding: 20px; font-size: 13px; color: #999; }
    .footer a { color: #667eea; text-decoration: none; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Terms of Service</h1>
    <p>Ahmed Cooling Workshop &mdash; Last updated: April 1, 2026</p>
  </div>
  <div class="content">
    <h2>1. Acceptance of Terms</h2>
    <p>By using the Ahmed Cooling Workshop application, you agree to be bound by these Terms of Service. If you do not agree, please do not use the application.</p>

    <h2>2. Services</h2>
    <p>Ahmed Cooling Workshop provides AC and cooling equipment installation, repair, and maintenance services. You can browse services, book appointments, and track service progress through our app.</p>

    <h2>3. User Accounts</h2>
    <p>You must provide accurate information when creating an account. You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account.</p>

    <h2>4. Bookings & Cancellations</h2>
    <ul>
      <li>Bookings are subject to availability and confirmation.</li>
      <li>You may cancel a booking before the service is confirmed by the technician.</li>
      <li>We reserve the right to cancel or reschedule bookings due to unforeseen circumstances.</li>
    </ul>

    <h2>5. User Responsibilities</h2>
    <ul>
      <li>Provide accurate booking details including address and contact information.</li>
      <li>Ensure access to the premises for scheduled service visits.</li>
      <li>Do not misuse the app or attempt to interfere with its operation.</li>
    </ul>

    <h2>6. Limitation of Liability</h2>
    <p>Ahmed Cooling Workshop shall not be liable for any indirect, incidental, or consequential damages arising from the use of our services or application.</p>

    <h2>7. Modifications</h2>
    <p>We reserve the right to modify these terms at any time. Continued use of the app constitutes acceptance of updated terms.</p>

    <h2>8. Contact</h2>
    <p>For questions about these Terms, contact us through the app or visit our <a href="/">homepage</a>.</p>
  </div>
  <div class="footer">
    <p><a href="/">← Back to Home</a> &nbsp;|&nbsp; &copy; ${new Date().getFullYear()} Ahmed Cooling Workshop</p>
  </div>
</body>
</html>`);
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
let Booking, User, Service, Notification, Product;

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
    Product      = require('./models/Products');

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
    const serviceRoutes = require('./routes/services');
    app.use('/api/services', serviceRoutes);
    console.log('✅ Service routes loaded');

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
    // ADMIN ROUTES
    // ============================================
    const adminRoutes = require('./routes/admin');
    app.use('/api/admin', adminRoutes);
    console.log('✅ Admin routes loaded');

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
      console.log(`   GET  /api/services`);
      console.log(`   GET  /api/bookings/public`);
      console.log(`   GET  /api/products/categories`);
      console.log(`   GET  /api/products/brands?category=ac`);
      console.log(`   GET  /api/products/models?category=ac&brand=Daikin`);
      console.log('════════════════════════════════════════════');
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();

module.exports = app;