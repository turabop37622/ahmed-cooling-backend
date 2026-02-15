const express = require('express');
const cors = require('cors');
require('dotenv').config();
const connectDB = require('./config/db');

const app = express();
const port = process.env.PORT || 5000;

// Database connection
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sample data for testing (temporary - baad mein database se ayega)
const services = [
  { id: 1, name: 'Central AC Repair', price: 5000, icon: '❄️', duration: '2-3 hours' },
  { id: 2, name: 'Split AC Repair', price: 3000, icon: '🌬️', duration: '2-3 hours' },
  { id: 3, name: 'Refrigerator Repair', price: 2500, icon: '🧊', duration: '1-2 hours' },
  { id: 4, name: 'Washing Machine Repair', price: 3500, icon: '🌊', duration: '3-4 hours' }
];

const technicians = [
  { id: 1, name: 'Ahmed Khan', rating: 4.8, experience: '8 years', phone: '+92 300 1234567' },
  { id: 2, name: 'Ali Raza', rating: 4.9, experience: '10 years', phone: '+92 301 2345678' }
];

// Basic Routes
app.get('/', (req, res) => {
  res.json({ 
    message: '🏠 Ahmed Cooling Workshop Backend API',
    status: 'success',
    database: 'MongoDB Connected'
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    message: 'Server is running smoothly',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Temporary Routes (sample data)
app.get('/api/services', (req, res) => {
  res.json({ success: true, data: services });
});

app.get('/api/technicians', (req, res) => {
  res.json({ success: true, data: technicians });
});

// MongoDB Routes
app.use('/api/customers', require('./routes/customers'));

// Start server
app.listen(port, () => {
  console.log('='.repeat(60));
  console.log('🚀 AHMED COOLING WORKSHOP BACKEND STARTED');
  console.log('='.repeat(60));
  console.log(`📍 Port: ${port}`);
  console.log(`🌐 URL: http://localhost:${port}`);
  console.log('');
  console.log('📡 AVAILABLE ENDPOINTS:');
  console.log('');
  console.log('   🔹 GET  /api/health              - Health check');
  console.log('   🔹 GET  /api/services            - Get all services');
  console.log('   🔹 GET  /api/technicians         - Get all technicians');
  console.log('   🔹 GET  /api/customers           - Get all customers');
  console.log('   🔹 POST /api/customers           - Create customer');
  console.log('   🔹 GET  /api/customers/:id       - Get single customer');
  console.log('   🔹 PUT  /api/customers/:id       - Update customer');
  console.log('   🔹 DELETE /api/customers/:id     - Delete customer');
  console.log('');
  console.log('💡 TIP: Use Thunder Client or Postman to test APIs');
  console.log('='.repeat(60));
});