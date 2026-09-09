require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

async function createAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    let admin = await User.findOne({ role: 'admin' });
    if (admin) {
      admin.email = 'ahmad9038@legend.com';
      admin.password = 'Ahmad389104@';
      admin.fullName = 'Ahmed Admin';
      admin.isVerified = true;
      await admin.save();
      console.log('Existing Admin credentials updated!');
    } else {
      admin = new User({
        fullName: 'Ahmed Admin',
        email: 'ahmad9038@legend.com',
        password: 'Ahmad389104@',
        role: 'admin',
        isVerified: true,
        authProvider: 'local',
      });
      await admin.save();
      console.log('Admin created!');
    }
    console.log('Email: ahmad9038@legend.com');
    console.log('Password: Ahmad389104@');

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

createAdmin();
