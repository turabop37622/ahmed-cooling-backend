require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

async function createAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const existing = await User.findOne({ role: 'admin' });
    if (existing) {
      console.log('Admin already exists:', existing.email || existing.phone);
      await mongoose.disconnect();
      return;
    }

    const admin = new User({
      fullName: 'Admin',
      email: 'admin@ahmedcooling.com',
      password: 'admin123456',
      role: 'admin',
      isVerified: true,
      authProvider: 'local',
    });
    await admin.save();
    console.log('Admin created!');
    console.log('Email: admin@ahmedcooling.com');
    console.log('Password: admin123456');

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

createAdmin();
