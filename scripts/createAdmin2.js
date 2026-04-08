require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

async function createAdmin2() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const existing = await User.findOne({ email: 'admin2@ahmedcooling.com' });
    if (existing) {
      console.log('Admin2 already exists:', existing.email);
      await mongoose.disconnect();
      return;
    }

    const admin = new User({
      fullName: 'Admin 2',
      email: 'admin2@ahmedcooling.com',
      password: 'admin123456',
      role: 'admin',
      isVerified: true,
      authProvider: 'local',
    });
    await admin.save();
    console.log('Admin 2 created!');
    console.log('Email: admin2@ahmedcooling.com');
    console.log('Password: admin123456');

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

createAdmin2();
