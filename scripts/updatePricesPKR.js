require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Service = require('../models/Service');

const PRICE_UPDATES = {
  'AC Repair': { basePrice: 150, pricePKR: 11250 },
  'AC Installation': { basePrice: 200, pricePKR: 15000 },
  'AC Deep Cleaning': { basePrice: 200, pricePKR: 15000 },
  'AC Gas Refill': { basePrice: 250, pricePKR: 18750 },
  'AC Compressor Repair': { basePrice: 650, pricePKR: 48750 },
  'AC PCB Repair': { basePrice: 350, pricePKR: 26250 },
  'AC Shifting': { basePrice: 250, pricePKR: 18750 },
  'Central AC Service': { basePrice: 450, pricePKR: 33750 },
  'Refrigerator Repair': { basePrice: 250, pricePKR: 18750 },
  'Freezer Repair': { basePrice: 300, pricePKR: 22500 },
  'Fridge Gas Refill': { basePrice: 200, pricePKR: 15000 },
  'Fridge Thermostat Fix': { basePrice: 150, pricePKR: 11250 },
  'Washing Machine Repair': { basePrice: 350, pricePKR: 26250 },
  'Stove & Oven Repair': { basePrice: 350, pricePKR: 26250 },
  'Microwave Repair': { basePrice: 150, pricePKR: 11250 },
  'Water Dispenser Repair': { basePrice: 250, pricePKR: 18750 },
  'Electrical Wiring Fix': { basePrice: 200, pricePKR: 15000 },
  'General Maintenance': { basePrice: 250, pricePKR: 18750 },
  'Annual Maintenance Plan': { basePrice: 3000, pricePKR: 225000 },
  '24/7 Emergency Repair': { basePrice: 350, pricePKR: 26250 },
};

async function updatePrices() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    for (const [name, prices] of Object.entries(PRICE_UPDATES)) {
      const result = await Service.updateOne(
        { name },
        { $set: { basePrice: prices.basePrice, pricePKR: prices.pricePKR } }
      );
      if (result.modifiedCount > 0) {
        console.log(`  ✅ ${name}: ${prices.basePrice} SAR / ${prices.pricePKR.toLocaleString()} PKR`);
      } else {
        console.log(`  ⚠️ ${name}: not found or already set`);
      }
    }

    console.log('\nAll prices updated with PKR!');
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

updatePrices();
