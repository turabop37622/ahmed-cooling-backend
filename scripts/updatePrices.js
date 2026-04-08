require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Service = require('../models/Service');

const PRICE_UPDATES = {
  'Annual Maintenance Plan': 3000,
  '24/7 Emergency Repair': 350,
  'Washing Machine Repair': 350,
  'Refrigerator Repair': 250,
  'AC Deep Cleaning': 200,
  'AC Installation': 200,
  'AC Repair': 150,
  'Electrical Wiring Fix': 200,
  'General Maintenance': 250,
  'Water Dispenser Repair': 250,
  'Microwave Repair': 150,
  'Stove & Oven Repair': 350,
  'Fridge Thermostat Fix': 150,
  'Fridge Gas Refill': 200,
  'Freezer Repair': 300,
  'Central AC Service': 450,
  'AC Shifting': 250,
  'AC PCB Repair': 350,
  'AC Compressor Repair': 650,
  'AC Gas Refill': 250,
};

async function updatePrices() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    for (const [name, price] of Object.entries(PRICE_UPDATES)) {
      const result = await Service.updateOne(
        { name },
        { $set: { basePrice: price } }
      );
      if (result.modifiedCount > 0) {
        console.log(`  ✅ ${name}: ${price} SAR`);
      } else {
        console.log(`  ⚠️ ${name}: not found or already ${price}`);
      }
    }

    console.log('\nAll prices updated!');
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

updatePrices();
