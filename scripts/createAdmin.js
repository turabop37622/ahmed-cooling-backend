require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

async function createAdmin() {
  const { MONGODB_URI, ADMIN_SEED_EMAIL, ADMIN_SEED_PASSWORD } = process.env;
  if (!MONGODB_URI || !ADMIN_SEED_EMAIL || !ADMIN_SEED_PASSWORD || ADMIN_SEED_PASSWORD.length < 12) {
    throw new Error('Set MONGODB_URI, ADMIN_SEED_EMAIL and a strong ADMIN_SEED_PASSWORD first');
  }
  try {
    await mongoose.connect(MONGODB_URI);
    const existing = await User.findOne({ $or: [{ email: ADMIN_SEED_EMAIL }, { role: 'admin' }] });
    if (existing) throw new Error('Admin already exists; use the admin security page to change its password');
    await User.create({ fullName: 'Ahmed Admin', email: ADMIN_SEED_EMAIL, password: ADMIN_SEED_PASSWORD, role: 'admin', isVerified: true, authProvider: 'local' });
    console.log('Admin account created');
  } finally {
    await mongoose.disconnect();
  }
}

createAdmin().catch((error) => { console.error(error.message); process.exitCode = 1; });
