require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Service = require('../models/Service');

const SERVICES_TO_REMOVE = [
  'Dryer Repair',
  'Washer Motor Repair',
  'Gas Leak Detection',
  'Water Heater Repair',
];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  for (const name of SERVICES_TO_REMOVE) {
    const result = await Service.deleteOne({ name });
    if (result.deletedCount > 0) {
      console.log(`✅ Deleted: ${name}`);
    } else {
      console.log(`⚠️ Not found: ${name}`);
    }
  }

  const remaining = await Service.countDocuments();
  console.log(`\nDone. ${remaining} services remaining in database.`);
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
