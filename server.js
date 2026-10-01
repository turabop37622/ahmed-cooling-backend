require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { rejectMongoOperators } = require('./utils/security');
const { mountAuthLimiters, geocodeLimiter } = require('./utils/limiters');

const app = express();

// Render/Vercel sit behind a proxy: without this every visitor shares the proxy's IP and the rate limiters
// either lock out everybody or protect nobody.
app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));

// ============================================
// SECURITY MIDDLEWARE
// ============================================
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

const allowedOrigins = [
  'https://ahmedcoolingworkshop.com',
  'https://www.ahmedcoolingworkshop.com',
  'https://ahmed-cooling-web.vercel.app',
  'http://localhost:3000',
  'http://localhost:8081',
  'http://localhost:19006',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Reject unknown origins
    console.warn(`⚠️ CORS blocked request from origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Body parsing and operator-injection blocking run BEFORE the limiters, because the limiters key
// some routes by the email/phone in the body.
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ limit: '100kb', extended: true }));
app.use(rejectMongoOperators);

mountAuthLimiters(app);

// The server starts listening BEFORE MongoDB is connected (so a slow Atlas/cold start never leaves Render with no
// listener). Until the database is connected and the routes are mounted, the API answers 503 instead of hanging.
let routesReady = false;
const dbConnected = () => mongoose.connection.readyState === 1;

app.get('/api/health', (req, res) => {
  const connected = dbConnected();
  res.status(connected ? 200 : 503).json(connected
    ? { success: true, status: 'ok' }
    : { success: false, status: 'database_unavailable', message: 'Database is not ready' });
});

app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/geocode')) return next(); // the geocode proxy does not need the database
  if (routesReady && dbConnected()) return next();
  return res.status(503).json({ success: false, message: 'Service starting, please retry' });
});

// ============================================
// GOOGLE SEARCH CONSOLE VERIFICATION
// ============================================
app.get('/google2c7ef9c93df45db9.html', (req, res) => {
  res.type('text/html').send('google-site-verification: google2c7ef9c93df45db9.html');
});

// ============================================
// HOMEPAGE - Ahmed Cooling Workshop
// ============================================
app.get('/', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ahmed Cooling Workshop</title>
  <meta name="application-name" content="Ahmed Cooling Workshop">
  <meta name="description" content="Official application and service platform of Ahmed Cooling Workshop. Book certified technicians for AC repair, maintenance, installation, and gas refilling.">
  <meta property="og:title" content="Ahmed Cooling Workshop">
  <meta property="og:description" content="Professional AC Installation, Repair, Maintenance, and Gas Refill Services at your doorstep.">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Ahmed Cooling Workshop">
  <link rel="canonical" href="https://ahmed-cooling-backend.onrender.com/">
  <link rel="privacy-policy" href="https://ahmed-cooling-backend.onrender.com/privacy-policy">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #0284c7;
      --primary-dark: #0369a1;
      --primary-light: #e0f2fe;
      --accent: #2563eb;
      --text-main: #0f172a;
      --text-muted: #475569;
      --bg-page: #f8fafc;
      --bg-card: #ffffff;
      --border-color: #e2e8f0;
      --radius: 12px;
      --shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.06);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: var(--bg-page);
      color: var(--text-main);
      line-height: 1.65;
      -webkit-font-smoothing: antialiased;
    }
    a { color: var(--primary); text-decoration: none; transition: all 0.2s ease; }
    a:hover { color: var(--primary-dark); text-decoration: underline; }
    
    /* Header / Nav */
    header {
      background: #ffffff;
      border-bottom: 1px solid var(--border-color);
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(8px);
      background-color: rgba(255, 255, 255, 0.95);
    }
    .nav-container {
      max-width: 1140px;
      margin: 0 auto;
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
    .brand-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
    }
    .brand-icon {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);
    }
    .brand-title {
      font-size: 20px;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.3px;
    }
    .nav-links {
      display: flex;
      align-items: center;
      gap: 22px;
      list-style: none;
    }
    .nav-links a {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-muted);
      text-decoration: none;
    }
    .nav-links a:hover {
      color: var(--primary);
    }
    .nav-links .btn-nav {
      background: var(--primary);
      color: #fff !important;
      padding: 8px 16px;
      border-radius: 8px;
      transition: background 0.2s;
    }
    .nav-links .btn-nav:hover {
      background: var(--primary-dark);
      text-decoration: none;
    }

    /* Hero Section */
    .hero {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0369a1 100%);
      color: #ffffff;
      padding: 70px 24px;
      text-align: center;
      position: relative;
    }
    .hero-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.25);
      padding: 6px 14px;
      border-radius: 50px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 20px;
      letter-spacing: 0.2px;
    }
    .hero h1 {
      font-size: 42px;
      font-weight: 800;
      line-height: 1.2;
      margin-bottom: 16px;
      letter-spacing: -0.5px;
    }
    .hero p {
      font-size: 19px;
      max-width: 720px;
      margin: 0 auto 30px;
      color: #cbd5e1;
      font-weight: 400;
    }
    .hero-buttons {
      display: flex;
      justify-content: center;
      gap: 14px;
      flex-wrap: wrap;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 15px;
      text-decoration: none;
      transition: all 0.2s;
    }
    .btn-primary {
      background: #0284c7;
      color: #fff;
      box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4);
    }
    .btn-primary:hover {
      background: #0369a1;
      text-decoration: none;
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.3);
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.2);
      text-decoration: none;
      transform: translateY(-1px);
    }

    /* Container */
    .container {
      max-width: 1140px;
      margin: 0 auto;
      padding: 50px 24px;
    }

    /* Section Styling */
    .section-header {
      margin-bottom: 35px;
    }
    .section-tag {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--primary);
      margin-bottom: 6px;
      display: block;
    }
    .section-title {
      font-size: 28px;
      font-weight: 800;
      color: var(--text-main);
      letter-spacing: -0.3px;
    }
    .section-desc {
      font-size: 16px;
      color: var(--text-muted);
      margin-top: 8px;
      max-width: 750px;
    }

    /* Card */
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      padding: 28px;
      box-shadow: var(--shadow);
      margin-bottom: 30px;
    }

    /* Services Grid */
    .grid-3 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 22px;
      margin-top: 20px;
    }
    .service-card {
      background: #fff;
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      padding: 24px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .service-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.1);
      border-color: #cbd5e1;
    }
    .service-icon {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      background: var(--primary-light);
      color: var(--primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      margin-bottom: 16px;
    }
    .service-card h3 {
      font-size: 18px;
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 8px;
    }
    .service-card p {
      font-size: 14px;
      color: var(--text-muted);
      line-height: 1.6;
    }

    /* Step flow */
    .steps-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 18px;
      margin-top: 24px;
    }
    .step-box {
      background: #fff;
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      padding: 20px;
      position: relative;
    }
    .step-number {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--primary);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 14px;
      margin-bottom: 12px;
    }
    .step-box h4 {
      font-size: 15px;
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 6px;
    }
    .step-box p {
      font-size: 13px;
      color: var(--text-muted);
    }

    /* Google OAuth Callout Box */
    .oauth-box {
      background: linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%);
      border: 1px solid #bae6fd;
      border-radius: var(--radius);
      padding: 28px;
      margin: 30px 0;
    }
    .oauth-box h3 {
      font-size: 20px;
      font-weight: 800;
      color: #0369a1;
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }
    .oauth-box p {
      font-size: 15px;
      color: #334155;
      margin-bottom: 12px;
    }
    .oauth-box ul {
      margin-left: 20px;
      margin-bottom: 14px;
    }
    .oauth-box li {
      font-size: 14px;
      color: #334155;
      margin-bottom: 6px;
    }

    /* Quick policy callout */
    .policy-box {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: var(--radius);
      padding: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      margin-top: 30px;
    }
    .policy-box-info strong {
      font-size: 16px;
      color: var(--text-main);
      display: block;
      margin-bottom: 4px;
    }
    .policy-box-info p {
      font-size: 14px;
      color: var(--text-muted);
    }

    /* Footer */
    footer {
      background: #0f172a;
      color: #94a3b8;
      padding: 45px 24px 30px;
      font-size: 14px;
      border-top: 1px solid #1e293b;
    }
    .footer-container {
      max-width: 1140px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 30px;
      margin-bottom: 30px;
    }
    .footer-brand h4 {
      font-size: 18px;
      font-weight: 800;
      color: #ffffff;
      margin-bottom: 10px;
    }
    .footer-brand p {
      font-size: 13px;
      line-height: 1.6;
      color: #94a3b8;
    }
    .footer-col h5 {
      font-size: 14px;
      font-weight: 700;
      color: #ffffff;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
    }
    .footer-col ul {
      list-style: none;
    }
    .footer-col li {
      margin-bottom: 8px;
    }
    .footer-col a {
      color: #94a3b8;
      text-decoration: none;
      font-size: 13px;
    }
    .footer-col a:hover {
      color: #38bdf8;
      text-decoration: underline;
    }
    .footer-bottom {
      max-width: 1140px;
      margin: 0 auto;
      padding-top: 20px;
      border-top: 1px solid #1e293b;
      text-align: center;
      font-size: 13px;
      color: #64748b;
    }

    @media (max-width: 768px) {
      .hero h1 { font-size: 32px; }
      .hero p { font-size: 16px; }
      .nav-links { gap: 14px; }
    }
  </style>
</head>
<body>

  <!-- Navigation -->
  <header>
    <div class="nav-container">
      <a href="/" class="brand-wrap">
        <div class="brand-icon">❄️</div>
        <span class="brand-title">Ahmed Cooling Workshop</span>
      </a>
      <ul class="nav-links">
        <li><a href="#about">About</a></li>
        <li><a href="#services">Services</a></li>
        <li><a href="#google-auth">Google Sign-In</a></li>
        <li><a href="#how-it-works">How It Works</a></li>
        <li><a href="/privacy-policy">Privacy Policy</a></li>
        <li><a href="/terms-of-service">Terms of Service</a></li>
        <li><a href="/privacy-policy" class="btn-nav">Compliance</a></li>
      </ul>
    </div>
  </header>

  <!-- Hero Section -->
  <section class="hero">
    <div class="hero-badge">Verified Official Portal &amp; Application</div>
    <h1>Ahmed Cooling Workshop</h1>
    <p>Professional On-Demand AC Installation, Maintenance, Emergency Repair, and Gas Refill Services for Homes and Businesses.</p>
    <div class="hero-buttons">
      <a href="#about" class="btn btn-primary">Learn About Our App</a>
      <a href="/privacy-policy" class="btn btn-secondary">Read Privacy Policy</a>
    </div>
  </section>

  <!-- Main Content -->
  <div class="container">

    <!-- About Section: App Purpose -->
    <section id="about" class="card">
      <div class="section-header">
        <span class="section-tag">Application Overview</span>
        <h2 class="section-title">About Ahmed Cooling Workshop &amp; App Purpose</h2>
        <p class="section-desc">
          <strong>Ahmed Cooling Workshop</strong> is the official service platform and mobile application connecting customers directly with certified heating, ventilation, air conditioning (HVAC), and refrigeration specialists.
        </p>
      </div>

      <p style="margin-bottom: 16px; font-size: 15px; color: #334155;">
        The primary purpose of the <strong>Ahmed Cooling Workshop</strong> application is to make air conditioning repair, routine maintenance, emergency breakdown troubleshooting, and new AC installations seamless, transparent, and completely reliable. Whether you are a homeowner preparing for scorching summer heat or a business manager needing dependable cooling systems, our platform handles the entire service lifecycle.
      </p>

      <h3 style="font-size: 17px; font-weight: 700; color: #0f172a; margin: 20px 0 10px;">Core Capabilities of the Application:</h3>
      <ul style="margin-left: 20px; margin-bottom: 20px; font-size: 14.5px; color: #334155;">
        <li style="margin-bottom: 8px;"><strong>On-Demand Service Scheduling:</strong> Select your desired cooling service (installation, maintenance, repair, or gas refill) and book a convenient date and time slot.</li>
        <li style="margin-bottom: 8px;"><strong>Certified Technician Dispatch:</strong> Experienced, background-checked HVAC technicians are assigned to your service request with complete tracking.</li>
        <li style="margin-bottom: 8px;"><strong>Transparent Upfront Estimates:</strong> View service specifications, transparent labor costs, and genuine replacement parts pricing before service begins.</li>
        <li style="margin-bottom: 8px;"><strong>Real-Time Appointment Tracking:</strong> Receive real-time appointment updates, technician arrival notifications, and service progress reports.</li>
        <li style="margin-bottom: 8px;"><strong>Digital Invoices &amp; Service History:</strong> Access digital receipts, warranty records, and previous service history directly within your user account.</li>
      </ul>
    </section>

    <!-- Services Section -->
    <section id="services" style="margin-bottom: 40px;">
      <div class="section-header">
        <span class="section-tag">What We Offer</span>
        <h2 class="section-title">Our Core Cooling Services</h2>
        <p class="section-desc">We deliver comprehensive cooling and HVAC solutions handled by certified professionals.</p>
      </div>

      <div class="grid-3">
        <div class="service-card">
          <div class="service-icon">🔧</div>
          <h3>AC Installation &amp; Dismantling</h3>
          <p>Complete precision mounting, piping, bracket installation, and electrical setup for all Split, Inverter, Window, and Standing AC units.</p>
        </div>

        <div class="service-card">
          <div class="service-icon">⚡</div>
          <h3>Expert AC Repair &amp; Diagnostics</h3>
          <p>Rapid diagnosis of cooling loss, sensor errors, electrical PCB issues, compressor tripping, and fan motor malfunctions.</p>
        </div>

        <div class="service-card">
          <div class="service-icon">🧼</div>
          <h3>Preventive Maintenance &amp; Servicing</h3>
          <p>Deep chemical jet washing, indoor coil descaling, outer unit cleansing, air filter sanitization, and drain tray unblocking.</p>
        </div>

        <div class="service-card">
          <div class="service-icon">❄️</div>
          <h3>Refrigerant Gas Charging</h3>
          <p>High-precision electronic leak detection, nitrogen pressure testing, vacuuming, and genuine refrigerant refill (R32, R410A, R22).</p>
        </div>

        <div class="service-card">
          <div class="service-icon">🚨</div>
          <h3>Emergency Breakdown Assistance</h3>
          <p>Fast-track priority dispatch for urgent residential and commercial cooling failures during peak summer heatwaves.</p>
        </div>

        <div class="service-card">
          <div class="service-icon">🏢</div>
          <h3>Commercial HVAC Solutions</h3>
          <p>Routine service contracts and scheduled maintenance for corporate offices, retail stores, server rooms, and warehouses.</p>
        </div>
      </div>
    </section>

    <!-- Google Sign-In & Data Usage Section -->
    <section id="google-auth" class="oauth-box">
      <h3>🔐 Google Sign-In &amp; User Authentication</h3>
      <p>
        <strong>Ahmed Cooling Workshop</strong> integrates Google Sign-In (OAuth 2.0) to provide our users with a fast, secure, and hassle-free authentication experience.
      </p>

      <h4 style="font-size: 15px; font-weight: 700; color: #0369a1; margin-top: 14px; margin-bottom: 6px;">Why We Request Google User Data:</h4>
      <ul>
        <li><strong>Seamless Single Sign-On:</strong> Enables passwordless login so you don't have to create or remember yet another password.</li>
        <li><strong>Account Profile Creation:</strong> We use your Google Name, Email, and Avatar to automatically create your verified customer profile.</li>
        <li><strong>Booking Management:</strong> All your AC service bookings, technician dispatches, and appointment records are securely linked to your account.</li>
        <li><strong>Service Notifications:</strong> We use your registered email to deliver booking confirmations, technician arrival alerts, and digital invoices.</li>
      </ul>

      <h4 style="font-size: 15px; font-weight: 700; color: #0369a1; margin-top: 14px; margin-bottom: 6px;">Our Strict Privacy Commitment:</h4>
      <ul>
        <li>We only access basic public profile information (Name, Email, Profile Picture, and Google User ID).</li>
        <li>We <strong>NEVER</strong> access your contacts, calendar, emails, Google Drive files, or any private data.</li>
        <li>We <strong>NEVER</strong> sell, rent, or trade your Google user data to any third party or advertiser.</li>
        <li>We strictly comply with the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.</li>
      </ul>
    </section>

    <!-- How It Works Section -->
    <section id="how-it-works" class="card">
      <div class="section-header">
        <span class="section-tag">Step-by-Step</span>
        <h2 class="section-title">How the Ahmed Cooling Workshop App Works</h2>
        <p class="section-desc">Getting certified AC service at your doorstep is simple and straightforward.</p>
      </div>

      <div class="steps-grid">
        <div class="step-box">
          <div class="step-number">1</div>
          <h4>Sign In Securely</h4>
          <p>Log in with one click using your Google Account or mobile phone number.</p>
        </div>

        <div class="step-box">
          <div class="step-number">2</div>
          <h4>Choose Service</h4>
          <p>Select your required cooling service, AC brand, and describe the issue.</p>
        </div>

        <div class="step-box">
          <div class="step-number">3</div>
          <h4>Schedule Visit</h4>
          <p>Set your preferred date, time slot, and home or office service location.</p>
        </div>

        <div class="step-box">
          <div class="step-number">4</div>
          <h4>Expert Service</h4>
          <p>A certified technician arrives equipped with genuine tools and parts.</p>
        </div>

        <div class="step-box">
          <div class="step-number">5</div>
          <h4>Invoice &amp; Review</h4>
          <p>Receive your digital receipt, warranty record, and share your service rating.</p>
        </div>
      </div>
    </section>

    <!-- Compliance and Legal Callout Banner -->
    <div class="policy-box">
      <div class="policy-box-info">
        <strong>Privacy Policy &amp; Terms of Service</strong>
        <p>Review our detailed privacy practices, Google user data handling policies, and terms of service.</p>
      </div>
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <a href="/privacy-policy" class="btn btn-primary" style="padding: 10px 18px; font-size: 14px;">View Privacy Policy</a>
        <a href="/terms-of-service" class="btn btn-secondary" style="padding: 10px 18px; font-size: 14px; background: #fff; color: var(--text-main); border: 1px solid var(--border-color);">Terms of Service</a>
      </div>
    </div>

  </div>

  <!-- Footer -->
  <footer>
    <div class="footer-container">
      <div class="footer-brand">
        <h4>Ahmed Cooling Workshop</h4>
        <p>Dedicated to delivering high-quality residential and commercial air conditioning installation, repair, and maintenance services.</p>
      </div>
      <div class="footer-col">
        <h5>Quick Links</h5>
        <ul>
          <li><a href="#about">About App</a></li>
          <li><a href="#services">Services</a></li>
          <li><a href="#google-auth">Google Sign-In</a></li>
          <li><a href="#how-it-works">How It Works</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h5>Legal &amp; Policy</h5>
        <ul>
          <li><a href="/privacy-policy">Privacy Policy</a></li>
          <li><a href="/terms-of-service">Terms of Service</a></li>
          <li><a href="/privacy-policy#deletion">Data Deletion Instructions</a></li>
          <li><a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google User Data Policy</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h5>Contact Us</h5>
        <ul>
          <li>Email: <a href="mailto:ahmedcoolingworkshop@gmail.com">ahmedcoolingworkshop@gmail.com</a></li>
          <li>Support: <a href="mailto:ahmedcoolingworkshop@gmail.com">ahmedcoolingworkshop@gmail.com</a></li>
          <li>Operating Area: Jeddah, Saudi Arabia</li>
          <li>Website: <a href="https://ahmed-cooling-backend.onrender.com">ahmed-cooling-backend.onrender.com</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <p>&copy; ${new Date().getFullYear()} Ahmed Cooling Workshop. All rights reserved.</p>
    </div>
  </footer>

</body>
</html>`);
});

// ✅ RENDER HEALTH CHECK (VERY IMPORTANT)
app.get('/health', (req, res) => {
  if (!dbConnected()) return res.status(503).json({ status: 'database_unavailable', message: 'Database is not ready' });
  res.status(200).json({ status: 'OK' });
});

// ============================================
// PRIVACY POLICY - Ahmed Cooling Workshop
// ============================================
app.get('/privacy-policy', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ahmed Cooling Workshop - Privacy Policy</title>
  <meta name="application-name" content="Ahmed Cooling Workshop">
  <meta name="description" content="Privacy Policy for Ahmed Cooling Workshop. Explains our data collection, Google OAuth user data usage, protection, and deletion practices.">
  <link rel="canonical" href="https://ahmed-cooling-backend.onrender.com/privacy-policy">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #0284c7;
      --primary-dark: #0369a1;
      --primary-light: #e0f2fe;
      --text-main: #0f172a;
      --text-muted: #475569;
      --bg-page: #f8fafc;
      --bg-card: #ffffff;
      --border-color: #e2e8f0;
      --radius: 12px;
      --shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.06);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: var(--bg-page);
      color: var(--text-main);
      line-height: 1.7;
      -webkit-font-smoothing: antialiased;
    }
    a { color: var(--primary); text-decoration: underline; font-weight: 500; }
    a:hover { color: var(--primary-dark); }

    /* Header */
    header {
      background: #ffffff;
      border-bottom: 1px solid var(--border-color);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .header-container {
      max-width: 900px;
      margin: 0 auto;
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .brand-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
    }
    .brand-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }
    .brand-title {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      text-decoration: none;
    }
    .back-link {
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      color: var(--text-muted);
    }
    .back-link:hover { color: var(--primary); }

    /* Hero */
    .policy-hero {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #ffffff;
      padding: 50px 24px;
      text-align: center;
    }
    .policy-hero h1 {
      font-size: 34px;
      font-weight: 800;
      margin-bottom: 8px;
      letter-spacing: -0.4px;
    }
    .policy-hero p {
      font-size: 15px;
      color: #94a3b8;
    }

    /* Content */
    .content-wrap {
      max-width: 900px;
      margin: 35px auto 60px;
      padding: 0 24px;
    }
    .policy-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      padding: 40px;
      box-shadow: var(--shadow);
    }
    h2 {
      color: #0f172a;
      font-size: 20px;
      font-weight: 800;
      margin: 32px 0 14px;
      padding-bottom: 8px;
      border-bottom: 2px solid var(--primary-light);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    h2:first-of-type {
      margin-top: 0;
    }
    h3 {
      font-size: 16px;
      font-weight: 700;
      color: #1e293b;
      margin: 20px 0 8px;
    }
    p {
      font-size: 15px;
      color: #334155;
      margin-bottom: 14px;
    }
    ul, ol {
      margin-left: 24px;
      margin-bottom: 16px;
    }
    li {
      font-size: 14.5px;
      color: #334155;
      margin-bottom: 8px;
    }
    
    /* Highlight box */
    .alert-box {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-left: 5px solid #2563eb;
      border-radius: 8px;
      padding: 18px 20px;
      margin: 20px 0;
    }
    .alert-box strong {
      display: block;
      color: #1e40af;
      font-size: 15px;
      margin-bottom: 6px;
    }
    .alert-box p {
      margin: 0;
      color: #1e3a8a;
      font-size: 14px;
    }

    /* Contact Card */
    .contact-card {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 20px;
      margin-top: 15px;
    }
    .contact-card p {
      margin-bottom: 6px;
      font-size: 14px;
    }

    /* Footer */
    footer {
      background: #0f172a;
      color: #94a3b8;
      padding: 30px 24px;
      text-align: center;
      font-size: 13px;
      border-top: 1px solid #1e293b;
    }
    footer a { color: #38bdf8; text-decoration: none; }
    footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>

  <!-- Header -->
  <header>
    <div class="header-container">
      <a href="/" class="brand-wrap">
        <div class="brand-icon">❄️</div>
        <span class="brand-title">Ahmed Cooling Workshop</span>
      </a>
      <a href="/" class="back-link">← Return to Homepage</a>
    </div>
  </header>

  <!-- Hero -->
  <div class="policy-hero">
    <h1>Privacy Policy</h1>
    <p>Application: <strong>Ahmed Cooling Workshop</strong> &bull; Last Updated: September 28, 2026</p>
  </div>

  <!-- Content -->
  <div class="content-wrap">
    <div class="policy-card">

      <h2>1. Introduction &amp; Scope</h2>
      <p>
        Welcome to <strong>Ahmed Cooling Workshop</strong> ("we", "our", or "us"). We operate the official <strong>Ahmed Cooling Workshop</strong> web platform and mobile application (accessible at <a href="https://ahmed-cooling-backend.onrender.com">https://ahmed-cooling-backend.onrender.com</a>).
      </p>
      <p>
        This Privacy Policy details how Ahmed Cooling Workshop collects, uses, protects, discloses, and handles user personal information and Google OAuth user data when you access or interact with our application and AC servicing portal. We are dedicated to respecting your privacy and ensuring complete transparency regarding how your data is handled.
      </p>

      <h2>2. Application Purpose &amp; Overview</h2>
      <p>
        <strong>Ahmed Cooling Workshop</strong> is an on-demand service management application designed to facilitate residential and commercial Air Conditioning (AC) repair, periodic maintenance, emergency breakdown troubleshooting, gas refilling, and professional unit installations. Our platform allows users to view service offerings, schedule appointments with certified HVAC technicians, track service progress, and maintain digital service records.
      </p>

      <h2>3. Information We Collect</h2>
      <p>To provide our AC booking and repair services effectively, we collect the following categories of information:</p>

      <h3>A. Google User Data (Collected via Google Sign-In / OAuth 2.0)</h3>
      <p>When you choose to sign in to Ahmed Cooling Workshop using your Google account, we access the following basic profile information provided through Google OAuth 2.0:</p>
      <ul>
        <li><strong>Full Name:</strong> Your Google account display name (to identify and personalize your customer profile).</li>
        <li><strong>Email Address:</strong> Your primary verified Google email address (to uniquely identify your account, send booking confirmations, dispatch alerts, and digital receipts).</li>
        <li><strong>Profile Picture URL:</strong> Your public Google profile avatar (to display within your customer account dashboard).</li>
        <li><strong>Google User Identifier:</strong> A unique numerical identifier provided by Google (to authenticate your login sessions securely).</li>
      </ul>

      <h3>B. Information Provided Directly by the User</h3>
      <ul>
        <li><strong>Contact Information:</strong> Customer phone number and WhatsApp number (for service coordination, emergency cooling calls, and technician dispatch).</li>
        <li><strong>Service Location Details:</strong> Street address, house/flat/building number, landmark, and city (required for certified technicians to visit your location and perform AC work).</li>
        <li><strong>Booking &amp; Equipment Specifications:</strong> AC unit type (Inverter, Split, Window, Commercial), brand/model, issue description, photos (if uploaded for diagnostics), and preferred appointment date and time.</li>
        <li><strong>Customer Feedback &amp; Reviews:</strong> Star ratings, comments, and reviews submitted following service completion.</li>
      </ul>

      <h3>C. Automated &amp; Technical Information</h3>
      <ul>
        <li><strong>Device &amp; Access Logs:</strong> IP address, device type, browser version, and operating system collected strictly for server security, rate limiting, and fraud prevention.</li>
      </ul>

      <h2>4. How We Use Google User Data &amp; Your Information</h2>
      <p>We process Google user data and customer information exclusively for legitimate operational purposes:</p>
      <ul>
        <li><strong>Authentication &amp; Account Creation:</strong> To securely sign you in using Google Sign-In without storing sensitive passwords on our servers.</li>
        <li><strong>Order &amp; Booking Management:</strong> To associate your AC repair, maintenance, and installation requests with your customer profile.</li>
        <li><strong>Technician Dispatch &amp; Service Fulfillment:</strong> To provide our certified technicians with the necessary details to visit your premises and complete the requested AC service.</li>
        <li><strong>Communication &amp; Invoicing:</strong> To email you booking confirmations, technician arrival alerts, service completion summaries, warranty records, and electronic receipts.</li>
        <li><strong>Customer Support:</strong> To look up your service history and provide prompt technical or warranty assistance when you contact us.</li>
      </ul>

      <h2>5. Google API Services User Data Policy Compliance</h2>
      <div class="alert-box">
        <strong>Google API Services User Data Policy &amp; Limited Use Disclosure</strong>
        <p>
          <strong>Ahmed Cooling Workshop's</strong> use and transfer of information received from Google APIs to any other app will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the <strong>Limited Use</strong> requirements.
        </p>
      </div>

      <h2>6. Strict Prohibitions on Data Sharing &amp; Sale</h2>
      <p>We believe in strict confidentiality. We hold the following firm commitments regarding your data:</p>
      <ul>
        <li><strong>No Sale or Rental:</strong> We <strong>DO NOT</strong> sell, rent, trade, lease, or monetize your personal information or Google user data to any third party under any circumstances.</li>
        <li><strong>No Third-Party Advertising:</strong> We <strong>DO NOT</strong> share or disclose Google user data to third-party advertising networks, data brokers, or marketing platforms.</li>
        <li><strong>No AI/ML Model Training:</strong> We <strong>DO NOT</strong> use Google user data to train, fine-tune, or develop generalized artificial intelligence (AI) or machine learning (ML) models.</li>
        <li><strong>Operational Sharing Only:</strong> Personal data is shared strictly with assigned certified cooling technicians solely to the extent necessary to fulfill your booked service (such as your name, contact phone, and service address).</li>
        <li><strong>Legal Obligations:</strong> We may disclose information only if required to do so by applicable law, court order, or governmental regulation.</li>
      </ul>

      <h2>7. Data Storage, Security &amp; Retention</h2>
      <p>We implement rigorous technical and organizational security controls to safeguard your data:</p>
      <ul>
        <li><strong>Encryption in Transit:</strong> All data transmitted between your device and our servers is secured using modern Transport Layer Security (TLS 1.3 / HTTPS).</li>
        <li><strong>Secure Cloud Infrastructure:</strong> Data is stored in secure, firewall-protected database clusters with restricted administrative access.</li>
        <li><strong>Session Security:</strong> We employ cryptographically signed JSON Web Tokens (JWT) with strict expiration limits.</li>
        <li><strong>Retention Policy:</strong> We retain your customer profile and service history only for as long as your account remains active or as required for accounting, tax, and warranty records.</li>
      </ul>

      <h2 id="deletion">8. Data Retention &amp; Account Deletion Instructions</h2>
      <p>
        Users have complete control over their personal data and may request account and data deletion at any time:
      </p>
      
      <h3>Option 1: Request Deletion via Email</h3>
      <p>
        You can request permanent deletion of your account, Google profile information, and service history by contacting our support team:
      </p>
      <ul>
        <li><strong>Email:</strong> <a href="mailto:ahmedcoolingworkshop@gmail.com">ahmedcoolingworkshop@gmail.com</a></li>
        <li><strong>Subject Line:</strong> <em>Account and Data Deletion Request - Ahmed Cooling Workshop</em></li>
        <li><strong>Details:</strong> Include your registered Google email address.</li>
        <li><strong>Processing Time:</strong> Upon identity verification, all personal data associated with your account will be permanently expunged from our active production databases within <strong>14 to 30 days</strong>.</li>
      </ul>

      <h3>Option 2: Revoke Google Permissions Directly</h3>
      <p>
        You can revoke Ahmed Cooling Workshop's access to your Google account at any time via your Google Account Security Settings:
      </p>
      <p>
        👉 <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">https://myaccount.google.com/permissions</a>
      </p>

      <h2>9. Your Privacy Rights</h2>
      <p>Depending on your jurisdiction, you have the following rights regarding your personal information:</p>
      <ul>
        <li><strong>Right to Access:</strong> You may request a copy of the personal information we hold about you.</li>
        <li><strong>Right to Rectification:</strong> You may request correction of any inaccurate or incomplete details.</li>
        <li><strong>Right to Erasure:</strong> You have the right to request the deletion of your account and personal records.</li>
        <li><strong>Right to Withdraw Consent:</strong> You may revoke your consent for data processing at any time.</li>
      </ul>

      <h2>10. Children's Privacy</h2>
      <p>
        Ahmed Cooling Workshop does not knowingly solicit or collect personal information from individuals under the age of 13. If you become aware that a child has provided us with personal information, please contact us immediately, and we will promptly delete the data.
      </p>

      <h2>11. Changes to This Privacy Policy</h2>
      <p>
        We may update this Privacy Policy periodically to reflect enhancements to our services or changes in legal regulations. When updates occur, we will revise the "Last Updated" date at the top of this page. We encourage you to review this policy periodically.
      </p>

      <h2>12. Contact Information</h2>
      <p>If you have any questions, feedback, or data privacy requests, please reach out to us:</p>
      <div class="contact-card">
        <p><strong>Application:</strong> Ahmed Cooling Workshop</p>
        <p><strong>Developer / Operator:</strong> Ahmed Cooling Workshop</p>
        <p><strong>Primary Support Email:</strong> <a href="mailto:ahmedcoolingworkshop@gmail.com">ahmedcoolingworkshop@gmail.com</a></p>
        <p><strong>Service Area:</strong> Jeddah, Saudi Arabia</p>
        <p><strong>Website:</strong> <a href="https://ahmed-cooling-backend.onrender.com">https://ahmed-cooling-backend.onrender.com</a></p>
      </div>

    </div>
  </div>

  <!-- Footer -->
  <footer>
    <p>
      <a href="/">Home</a> &bull;
      <a href="/privacy-policy">Privacy Policy</a> &bull;
      <a href="/terms-of-service">Terms of Service</a> &bull;
      <a href="https://ahmed-cooling-backend.onrender.com">Ahmed Cooling Workshop</a>
    </p>
    <p style="margin-top: 10px; color: #64748b;">&copy; ${new Date().getFullYear()} Ahmed Cooling Workshop. All rights reserved.</p>
  </footer>

</body>
</html>`);
});

// ============================================
// TERMS OF SERVICE - Ahmed Cooling Workshop
// ============================================
app.get('/terms-of-service', (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ahmed Cooling Workshop - Terms of Service</title>
  <meta name="application-name" content="Ahmed Cooling Workshop">
  <meta name="description" content="Terms of Service for Ahmed Cooling Workshop. Terms governing the use of our AC repair and maintenance booking application.">
  <link rel="canonical" href="https://ahmed-cooling-backend.onrender.com/terms-of-service">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #0284c7;
      --primary-dark: #0369a1;
      --primary-light: #e0f2fe;
      --text-main: #0f172a;
      --text-muted: #475569;
      --bg-page: #f8fafc;
      --bg-card: #ffffff;
      --border-color: #e2e8f0;
      --radius: 12px;
      --shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.06);
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: var(--bg-page);
      color: var(--text-main);
      line-height: 1.7;
    }
    a { color: var(--primary); text-decoration: underline; }
    a:hover { color: var(--primary-dark); }
    header {
      background: #ffffff;
      border-bottom: 1px solid var(--border-color);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .header-container {
      max-width: 900px;
      margin: 0 auto;
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .brand-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
    }
    .brand-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }
    .brand-title {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      text-decoration: none;
    }
    .back-link {
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      color: var(--text-muted);
    }
    .hero {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #ffffff;
      padding: 50px 24px;
      text-align: center;
    }
    .hero h1 { font-size: 34px; font-weight: 800; margin-bottom: 8px; }
    .hero p { font-size: 15px; color: #94a3b8; }
    .content-wrap {
      max-width: 900px;
      margin: 35px auto 60px;
      padding: 0 24px;
    }
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      padding: 40px;
      box-shadow: var(--shadow);
    }
    h2 {
      color: #0f172a;
      font-size: 19px;
      font-weight: 800;
      margin: 28px 0 12px;
      padding-bottom: 6px;
      border-bottom: 2px solid var(--primary-light);
    }
    h2:first-of-type { margin-top: 0; }
    p, li { font-size: 14.5px; color: #334155; margin-bottom: 10px; }
    ul { margin-left: 24px; margin-bottom: 14px; }
    footer {
      background: #0f172a;
      color: #94a3b8;
      padding: 30px 24px;
      text-align: center;
      font-size: 13px;
      border-top: 1px solid #1e293b;
    }
    footer a { color: #38bdf8; text-decoration: none; }
  </style>
</head>
<body>
  <header>
    <div class="header-container">
      <a href="/" class="brand-wrap">
        <div class="brand-icon">❄️</div>
        <span class="brand-title">Ahmed Cooling Workshop</span>
      </a>
      <a href="/" class="back-link">← Return to Homepage</a>
    </div>
  </header>

  <div class="hero">
    <h1>Terms of Service</h1>
    <p>Application: <strong>Ahmed Cooling Workshop</strong> &bull; Last Updated: September 28, 2026</p>
  </div>

  <div class="content-wrap">
    <div class="card">
      <h2>1. Agreement to Terms</h2>
      <p>By accessing or using the <strong>Ahmed Cooling Workshop</strong> application and online booking platform, you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, please refrain from using our application.</p>

      <h2>2. Description of Services</h2>
      <p>Ahmed Cooling Workshop provides residential and commercial Air Conditioning (AC), refrigeration, and HVAC installation, periodic servicing, diagnosis, repair, and gas refilling services. Customers may browse available service packages, book technician appointments, monitor service status, and access electronic billing through the platform.</p>

      <h2>3. User Accounts &amp; Authentication</h2>
      <p>You may create an account directly or authenticate using Google Sign-In. You agree to provide accurate, current, and complete details during registration and booking. You are responsible for safeguarding your credentials and for all activities carried out under your account.</p>

      <h2>4. Booking, Rescheduling &amp; Cancellations</h2>
      <ul>
        <li><strong>Confirmation:</strong> Service appointments are subject to technician availability and workshop scheduling confirmation.</li>
        <li><strong>Cancellations:</strong> Users may cancel or reschedule a scheduled booking free of charge prior to technician dispatch.</li>
        <li><strong>Access to Premises:</strong> Customers must ensure safe access to the premises and cooling equipment at the scheduled appointment time.</li>
      </ul>

      <h2>5. Pricing &amp; Payments</h2>
      <p>Service charges are based on transparent estimates for labor and genuine replacement parts. Final pricing will be confirmed before repairs begin. Invoices are delivered electronically to your registered email address upon completion of service.</p>

      <h2>6. Workmanship Warranty</h2>
      <p>Ahmed Cooling Workshop stands behind the quality of its work. Repaired units and installed components are covered by our standard workmanship warranty as specified on your service receipt.</p>

      <h2>7. Limitation of Liability</h2>
      <p>Ahmed Cooling Workshop and its certified technicians strive for maximum safety and professionalism. In no event shall Ahmed Cooling Workshop be liable for indirect, incidental, or consequential damages resulting from pre-existing equipment defects or unauthorized third-party tampering.</p>

      <h2>8. Contact Information</h2>
      <p>For inquiries regarding these Terms of Service, please contact us at <a href="mailto:ahmedcoolingworkshop@gmail.com">ahmedcoolingworkshop@gmail.com</a> or visit our <a href="/">homepage</a>.</p>
    </div>
  </div>

  <footer>
    <p>
      <a href="/">Home</a> &bull;
      <a href="/privacy-policy">Privacy Policy</a> &bull;
      <a href="/terms-of-service">Terms of Service</a> &bull;
      <a href="https://ahmed-cooling-backend.onrender.com">Ahmed Cooling Workshop</a>
    </p>
    <p style="margin-top: 10px; color: #64748b;">&copy; ${new Date().getFullYear()} Ahmed Cooling Workshop. All rights reserved.</p>
  </footer>
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
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET is not defined in environment variables');
  process.exit(1);
}

// ============================================
// START SERVER WITH DB CONNECTION
// ============================================

const PORT = process.env.PORT || 5000;

let server;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Connect with retry: a failed attempt is logged and retried with a growing delay instead of killing the process.
async function connectWithRetry(maxAttempts = 10) {
  console.log('🔄 Connecting to MongoDB...');
  console.log('📍 URI:', MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@'));
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
      return;
    } catch (err) {
      console.error(`❌ MongoDB connection attempt ${attempt}/${maxAttempts} failed:`, err.message);
      if (attempt === maxAttempts) throw err;
      await sleep(Math.min(30000, 2000 * attempt));
    }
  }
}

function listen() {
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log('════════════════════════════════════════════');
    console.log(`🚀 Server listening on http://localhost:${PORT} (database connecting...)`);
    console.log('════════════════════════════════════════════');
  });
  return server;
}

async function startServer() {
  try {
    if (JWT_SECRET.length < 32) {
      console.warn('⚠️ JWT_SECRET is shorter than 32 characters — replace it with a long random value.');
    }
    listen();
    await connectWithRetry();

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

    // Ensure Admin user exists — credentials from environment variables only
    const ADMIN_SEED_EMAIL = process.env.ADMIN_SEED_EMAIL;
    const ADMIN_SEED_PASSWORD = process.env.ADMIN_SEED_PASSWORD;
    if (ADMIN_SEED_EMAIL && ADMIN_SEED_PASSWORD && ADMIN_SEED_PASSWORD.length < 12) {
      console.warn('⚠️ ADMIN_SEED_PASSWORD is shorter than 12 characters — refusing to seed the admin account. Use a longer password.');
    } else if (ADMIN_SEED_EMAIL && ADMIN_SEED_PASSWORD) {
      try {
        let adminDoc = await User.findOne({ email: ADMIN_SEED_EMAIL });
        if (!adminDoc) {
          adminDoc = await User.findOne({ role: 'admin' });
        }
        if (adminDoc) {
          console.log('Admin account already exists; startup seed left it unchanged');
        } else {
          adminDoc = new User({
            fullName: 'Ahmed Admin',
            email: ADMIN_SEED_EMAIL,
            password: ADMIN_SEED_PASSWORD,
            role: 'admin',
            isVerified: true,
            authProvider: 'local'
          });
          await adminDoc.save();
          console.log('🔒 Admin user created in MongoDB with encrypted bcrypt password');
        }
      } catch (seedErr) {
        console.warn('⚠️ Admin seed warning:', seedErr.message);
      }
    } else {
      console.log('ℹ️ ADMIN_SEED_EMAIL/ADMIN_SEED_PASSWORD not set — skipping admin seed');
    }

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
    app.use('/api/users', require('./routes/users'));
    app.use('/api', require('./routes/feedback'));
    console.log('✅ Admin routes loaded');

    // ============================================
    // GEOCODE PROXY (keeps Google API key server-side)
    // ============================================
    const geocodeCache = new Map(); // "lat,lng,lang" (3 decimals) -> { address, expires }
    const GEOCODE_CACHE_MAX = 500;
    const GEOCODE_CACHE_TTL = 10 * 60 * 1000;
    app.get('/api/geocode/reverse', geocodeLimiter, async (req, res) => {
      try {
        const latNum = Number(req.query.lat);
        const lngNum = Number(req.query.lng);
        if (!Number.isFinite(latNum) || !Number.isFinite(lngNum) || Math.abs(latNum) > 90 || Math.abs(lngNum) > 180) {
          return res.status(400).json({ success: false, message: 'Valid lat and lng required' });
        }
        const lat = latNum;
        const lng = lngNum;
        const lang = ['en', 'ar', 'ur'].includes(req.query.lang) ? req.query.lang : 'en';

        const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)},${lang}`;
        const cached = geocodeCache.get(cacheKey);
        if (cached && cached.expires > Date.now()) return res.json({ success: true, address: cached.address });
        const remember = (address) => {
          if (geocodeCache.size >= GEOCODE_CACHE_MAX) geocodeCache.delete(geocodeCache.keys().next().value);
          geocodeCache.set(cacheKey, { address, expires: Date.now() + GEOCODE_CACHE_TTL });
          return address;
        };

        const GOOGLE_GEOCODE_KEY = process.env.GOOGLE_GEOCODE_KEY;

        // 1. Attempt Google Maps Reverse Geocode (only when a key is configured)
        if (GOOGLE_GEOCODE_KEY) {
          try {
            const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=${lang || 'en'}&key=${encodeURIComponent(GOOGLE_GEOCODE_KEY)}`;
            const gRes = await axios.get(url, { timeout: 6000 });
            if (gRes.data?.status === 'OK' && gRes.data.results?.length) {
              return res.json({ success: true, address: remember(gRes.data.results[0].formatted_address) });
            }
          } catch (gErr) {
            // Fall through to OpenStreetMap
          }
        }

        // 2. Fallback to OpenStreetMap Nominatim
        try {
          const osmUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=${lang || 'ar'}`;
          const osmRes = await axios.get(osmUrl, {
            timeout: 6000,
            headers: { 'User-Agent': 'AhmedCoolingWorkshop/1.0' },
          });
          if (osmRes.data?.address) {
            const a = osmRes.data.address;
            const road = a.road || a.pedestrian || a.street || '';
            const district = a.neighbourhood || a.suburb || a.quarter || '';
            const city = a.city || a.town || (lang === 'ar' ? 'جدة' : 'Jeddah');
            const parts = [road, district, city].filter(Boolean);
            const address = parts.length >= 2 ? parts.join(lang === 'ar' ? '، ' : ', ') : (osmRes.data.display_name || `${city}, KSA`);
            return res.json({ success: true, address: remember(address) });
          }
        } catch (osmErr) {
          // Fall through
        }

        return res.json({ success: false, message: 'No results' });
      } catch {
        return res.json({ success: false, message: 'Geocode failed' });
      }
    });

    console.log('✅ All routes loaded successfully\n');
    routesReady = true;

    // ============================================
    // ERROR HANDLING (MUST BE LAST)
    // ============================================

    app.use((err, req, res, next) => {
      if (err?.type === 'entity.too.large') return res.status(413).json({ success: false, message: 'Request too large' });
      if (err?.type === 'entity.parse.failed') return res.status(400).json({ success: false, message: 'Invalid JSON' });
      if (err?.message === 'Not allowed by CORS') return res.status(403).json({ success: false, message: 'Origin not allowed' });
      if (err?.code === 11000) return res.status(409).json({ success: false, message: 'That value is already in use' });
      if (err?.name === 'CastError' || err?.name === 'ValidationError') return res.status(400).json({ success: false, message: 'Invalid request data' });
      console.error('🔴 Server Error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    });

    app.use((req, res) => {
      res.status(404).json({ success: false, message: 'Route not found' });
    });

    // ============================================
    // START SERVER
    // ============================================

    console.log('════════════════════════════════════════════');
    console.log('✅ Ready — database connected, all routes mounted');
    console.log('📦 Available API endpoints:');
    console.log(`   GET  /api/services`);
    console.log(`   GET  /api/bookings/public`);
    console.log(`   GET  /api/products/categories`);
    console.log(`   GET  /api/products/brands?category=ac`);
    console.log(`   GET  /api/products/models?category=ac&brand=Daikin`);
    console.log('════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// ============================================
// PROCESS-LEVEL SAFETY NETS
// ============================================
process.on('unhandledRejection', (reason) => {
  console.error('🔴 Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('🔴 Uncaught exception:', err);
});

mongoose.connection.on('error', (err) => console.error('🔴 MongoDB connection error:', err.message));
mongoose.connection.on('disconnected', () => console.warn('⚠️ MongoDB disconnected'));

let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`🛑 ${signal} received — shutting down`);
  const finish = async () => {
    try { await mongoose.connection.close(); } catch (e) { console.error('Error closing MongoDB:', e.message); }
    process.exit(0);
  };
  if (server) server.close(finish); else finish();
  setTimeout(() => process.exit(0), 10000).unref(); // do not hang on keep-alive connections
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer();

module.exports = app;
