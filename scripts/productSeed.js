// backend/scripts/productSeed.js
// Run karo: node scripts/productSeed.js
// Yeh ek baar chalao — sab products MongoDB mein insert ho jayenge

require('dotenv').config();
const mongoose = require('mongoose');
const Product  = require('../models/Products');

const MONGO_URI = process.env.MONGODB_URI;

const PRODUCTS = [
  // ── AIR CONDITIONER ──────────────────────────────────────
  { categoryId: 'ac', brand: 'American Standard', model: 'Gold 17',    type: 'Split Inverter', variants: ['1 Ton','1.5 Ton','2 Ton'] },
  { categoryId: 'ac', brand: 'American Standard', model: 'Silver 16',  type: 'Split',          variants: ['1 Ton','1.5 Ton'] },
  { categoryId: 'ac', brand: 'AUX',               model: 'Q-Smart',    type: 'Split Inverter', variants: ['1 Ton','1.5 Ton','2 Ton'] },
  { categoryId: 'ac', brand: 'AUX',               model: 'Freedom',    type: 'Split',          variants: ['1 Ton','1.5 Ton'] },
  { categoryId: 'ac', brand: 'Blue Star Limited',  model: 'BS-18TIG',  type: 'Inverter Split', variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'Blue Star Limited',  model: 'BS-24TIG',  type: 'Inverter Split', variants: ['2 Ton'] },
  { categoryId: 'ac', brand: 'Bosch',              model: 'Climate 5000',  type: 'Split',          variants: ['1 Ton','1.5 Ton'] },
  { categoryId: 'ac', brand: 'Bosch',              model: 'Climate 8000i', type: 'Inverter Split', variants: ['1 Ton','1.5 Ton','2 Ton'] },
  { categoryId: 'ac', brand: 'Carrier',            model: 'Comfort 38QNC012', type: 'Split',    variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'Carrier',            model: 'Comfort 38QNC018', type: 'Split',    variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'Carrier',            model: 'Infinity 38QVP012', type: 'Inverter', variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'Carrier',            model: 'Infinity 38QVP018', type: 'Inverter', variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'Changhong Ruba',     model: 'CSH-12HTR1', type: 'Split',     variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'Changhong Ruba',     model: 'CSH-18HTR1', type: 'Split',     variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'Changhong Ruba',     model: 'CSA-12HTR1', type: 'Inverter',  variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'Changhong Ruba',     model: 'CSA-18HTR1', type: 'Inverter',  variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'Daikin',             model: 'FTXM09', type: 'Inverter Split', variants: ['0.75 Ton'] },
  { categoryId: 'ac', brand: 'Daikin',             model: 'FTXM12', type: 'Inverter Split', variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'Daikin',             model: 'FTXM18', type: 'Inverter Split', variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'Daikin',             model: 'FTXM24', type: 'Inverter Split', variants: ['2 Ton'] },
  { categoryId: 'ac', brand: 'Daikin',             model: 'FTXS12', type: 'Split (Old)',    variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'Daikin',             model: 'VRV IV', type: 'Commercial',     variants: ['3 Ton','4 Ton','5 Ton'] },
  { categoryId: 'ac', brand: 'Dawlance',           model: 'ENERCON-09',  type: 'Split',          variants: ['0.75 Ton'] },
  { categoryId: 'ac', brand: 'Dawlance',           model: 'ENERCON-12',  type: 'Split',          variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'Dawlance',           model: 'ENERCON-18',  type: 'Split',          variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'Dawlance',           model: 'INVERTER-12', type: 'Inverter Split', variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'Dawlance',           model: 'INVERTER-18', type: 'Inverter Split', variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'Dawlance',           model: 'CHROME-30',   type: 'Inverter Plus',  variants: ['2.5 Ton'] },
  { categoryId: 'ac', brand: 'Fujitsu',            model: 'ASYG09LMCA', type: 'Inverter Split', variants: ['0.75 Ton'] },
  { categoryId: 'ac', brand: 'Fujitsu',            model: 'ASYG12LMCA', type: 'Inverter Split', variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'Fujitsu',            model: 'ASYG18LMCA', type: 'Inverter Split', variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'Gree',               model: 'U-Crown GWH09UB', type: 'Inverter Split', variants: ['0.75 Ton'] },
  { categoryId: 'ac', brand: 'Gree',               model: 'U-Crown GWH12UB', type: 'Inverter Split', variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'Gree',               model: 'U-Crown GWH18UB', type: 'Inverter Split', variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'Gree',               model: 'Fairy GWC09QB',   type: 'Split (Old)',    variants: ['0.75 Ton'] },
  { categoryId: 'ac', brand: 'Gree',               model: 'Fairy GWC12QB',   type: 'Split (Old)',    variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'Haier',              model: 'HSU-09HT03',   type: 'Split',    variants: ['0.75 Ton'] },
  { categoryId: 'ac', brand: 'Haier',              model: 'HSU-12HT03',   type: 'Split',    variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'Haier',              model: 'HSU-18HT03',   type: 'Split',    variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'Haier',              model: 'Tundra HSU-12TUN', type: 'Inverter', variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'Haier',              model: 'Tundra HSU-18TUN', type: 'Inverter', variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'Kenwood',            model: 'KES-1228S', type: 'Split',    variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'Kenwood',            model: 'KES-1828S', type: 'Split',    variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'Kenwood',            model: 'KET-1228S', type: 'Inverter', variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'Kenwood',            model: 'KET-1828S', type: 'Inverter', variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'LG',                 model: 'Dual Inverter LS-Q09CNZA', type: 'Inverter', variants: ['0.75 Ton'] },
  { categoryId: 'ac', brand: 'LG',                 model: 'Dual Inverter LS-Q12CNZA', type: 'Inverter', variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'LG',                 model: 'Dual Inverter LS-Q18CNZA', type: 'Inverter', variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'LG',                 model: 'Artcool LS-Q18CNZA',       type: 'Dual Inverter', variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'Midea',              model: 'MSAFA-12CRN1', type: 'Split',    variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'Midea',              model: 'MSAFA-18CRN1', type: 'Split',    variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'Midea',              model: 'Mission Inverter 12', type: 'Inverter', variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'Mitsubishi Electric', model: 'MSZ-FH25VE', type: 'Inverter Split', variants: ['0.85 Ton'] },
  { categoryId: 'ac', brand: 'Mitsubishi Electric', model: 'MSZ-FH35VE', type: 'Inverter Split', variants: ['1.2 Ton'] },
  { categoryId: 'ac', brand: 'Mitsubishi Electric', model: 'MSZ-LN25VG', type: 'Inverter Split', variants: ['0.85 Ton'] },
  { categoryId: 'ac', brand: 'Orient',             model: 'OS-12AMCL', type: 'Split',    variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'Orient',             model: 'OS-18AMCL', type: 'Split',    variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'Orient',             model: 'OI-12AMCL', type: 'Inverter', variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'Orient',             model: 'OI-18AMCL', type: 'Inverter', variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'Panasonic',          model: 'CS-S18PKH',    type: 'Split',    variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'Panasonic',          model: 'CS-YS18SKY',   type: 'Inverter', variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'PEL',                model: 'PAC-12K',         type: 'Split',    variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'PEL',                model: 'PAC-18K',         type: 'Split',    variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'PEL',                model: 'PINVERTER-12K',   type: 'Inverter', variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'PEL',                model: 'PINVERTER-18K',   type: 'Inverter', variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'Samsung',            model: 'AR9500T AR12TSSCDWK', type: 'WindFree',  variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'Samsung',            model: 'AR9500T AR18TSSCDWK', type: 'WindFree',  variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'Samsung',            model: 'WindFree AR12TWSCD',  type: 'Inverter',  variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'Samsung',            model: 'Smart Inverter AR12TXHZAWK', type: 'Inverter', variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'Super Asia',         model: 'SAC-1200',  type: 'Split',    variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'Super Asia',         model: 'SAC-1800',  type: 'Split',    variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'Super Asia',         model: 'SACI-1200', type: 'Inverter', variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'TCL',                model: 'TAC-12 Split',  type: 'Split',    variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'TCL',                model: 'TAC-18 Split',  type: 'Split',    variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'TCL',                model: 'Elite TAC-12E', type: 'Inverter', variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'TCL',                model: 'Elite TAC-18E', type: 'Inverter', variants: ['1.5 Ton'] },
  { categoryId: 'ac', brand: 'Toshiba',            model: 'RAS-10N3KVR-E', type: 'Inverter Split', variants: ['0.85 Ton'] },
  { categoryId: 'ac', brand: 'Toshiba',            model: 'RAS-13N3KVR-E', type: 'Inverter Split', variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'York',               model: 'YHF12', type: 'Split',    variants: ['1 Ton'] },
  { categoryId: 'ac', brand: 'York',               model: 'YHF18', type: 'Split',    variants: ['1.5 Ton'] },

  // ── LED TV ───────────────────────────────────────────────
  { categoryId: 'led', brand: 'Samsung',  model: 'QLED QN90A',        type: 'QLED 4K',       variants: ['43"','55"','65"','75"'] },
  { categoryId: 'led', brand: 'Samsung',  model: 'Crystal UHD TU8000',type: '4K UHD',        variants: ['43"','50"','55"','65"'] },
  { categoryId: 'led', brand: 'Samsung',  model: 'The Frame LS03T',   type: 'Lifestyle TV',  variants: ['32"','43"','55"','65"'] },
  { categoryId: 'led', brand: 'LG',       model: 'OLED C2',           type: 'OLED 4K',       variants: ['42"','48"','55"','65"','77"'] },
  { categoryId: 'led', brand: 'LG',       model: 'OLED B2',           type: 'OLED 4K',       variants: ['55"','65"','77"'] },
  { categoryId: 'led', brand: 'LG',       model: 'NanoCell NANO86',   type: '4K NanoCell',   variants: ['50"','55"','65"'] },
  { categoryId: 'led', brand: 'LG',       model: 'QNED90',            type: '4K QNED',       variants: ['55"','65"','75"'] },
  { categoryId: 'led', brand: 'Sony',     model: 'Bravia X90J',       type: '4K Full Array', variants: ['55"','65"','75"'] },
  { categoryId: 'led', brand: 'Sony',     model: 'Bravia X80K',       type: '4K LED',        variants: ['43"','50"','55"','65"'] },
  { categoryId: 'led', brand: 'Sony',     model: 'Bravia A90K',       type: 'OLED 4K',       variants: ['48"','55"','65"'] },
  { categoryId: 'led', brand: 'TCL',      model: '6-Series R646',     type: 'QLED Gaming',   variants: ['55"','65"','75"'] },
  { categoryId: 'led', brand: 'TCL',      model: '5-Series S546',     type: '4K QLED',       variants: ['50"','55"','65"'] },
  { categoryId: 'led', brand: 'Hisense',  model: 'U8H',               type: 'ULED 4K',       variants: ['55"','65"','75"'] },
  { categoryId: 'led', brand: 'Hisense',  model: 'U7H',               type: '4K ULED',       variants: ['55"','65"'] },
  { categoryId: 'led', brand: 'Haier',    model: 'L Series L65U',     type: '4K Smart',      variants: ['65"'] },
  { categoryId: 'led', brand: 'Haier',    model: 'L Series L55U',     type: '4K Smart',      variants: ['55"'] },
  { categoryId: 'led', brand: 'Panasonic',model: 'HX550',             type: '4K HDR',        variants: ['40"','49"','55"','65"'] },
  { categoryId: 'led', brand: 'Xiaomi',   model: 'Mi TV 5X',          type: '4K Smart',      variants: ['43"','55"','65"'] },
  { categoryId: 'led', brand: 'Orient',   model: 'OR-55',             type: 'Smart LED',     variants: ['43"','50"','55"'] },
  { categoryId: 'led', brand: 'Orient',   model: 'OR-65',             type: '4K Smart',      variants: ['65"'] },
  { categoryId: 'led', brand: 'Dawlance', model: 'DW-50',             type: 'Smart LED',     variants: ['50"'] },
  { categoryId: 'led', brand: 'Dawlance', model: 'DW-55',             type: 'Smart LED',     variants: ['55"'] },
  { categoryId: 'led', brand: 'PEL',      model: 'PEL-50',            type: 'Smart LED',     variants: ['50"'] },
  { categoryId: 'led', brand: 'PEL',      model: 'PEL-55',            type: '4K Smart',      variants: ['55"'] },
  { categoryId: 'led', brand: 'EcoStar',  model: 'ES-50',             type: 'Smart LED',     variants: ['50"'] },
  { categoryId: 'led', brand: 'EcoStar',  model: 'ES-55',             type: 'Smart LED',     variants: ['55"'] },

  // ── WASHING MACHINE ──────────────────────────────────────
  { categoryId: 'washing', brand: 'Samsung',   model: 'WW90J5410FX',      type: 'Front Load',      variants: ['7kg','8kg','9kg'] },
  { categoryId: 'washing', brand: 'Samsung',   model: 'AddWash WW90K5410UX', type: 'Front Load',   variants: ['9kg'] },
  { categoryId: 'washing', brand: 'LG',        model: 'TWINWash F4J9JHP2T',  type: 'Twin Drum',    variants: ['9kg+3.5kg'] },
  { categoryId: 'washing', brand: 'LG',        model: 'Smart Inverter F4J5VYP2T', type: 'Front Load', variants: ['7kg','8kg'] },
  { categoryId: 'washing', brand: 'Haier',     model: 'HWM80-1209',       type: 'Top Load',        variants: ['8kg'] },
  { categoryId: 'washing', brand: 'Haier',     model: 'HWFT80-1209',      type: 'Front Load',      variants: ['8kg'] },
  { categoryId: 'washing', brand: 'Whirlpool', model: 'FreshCare FWF81252W', type: 'Front Load',   variants: ['8kg'] },
  { categoryId: 'washing', brand: 'Bosch',     model: 'Serie 6 WAT28400IN',  type: 'Front Load',   variants: ['7kg','8kg'] },
  { categoryId: 'washing', brand: 'Bosch',     model: 'Serie 8 WGB256A40',   type: 'Front Load',   variants: ['10kg'] },
  { categoryId: 'washing', brand: 'Dawlance',  model: 'DW-6100C',         type: 'Twin Tub',        variants: ['6kg'] },
  { categoryId: 'washing', brand: 'Dawlance',  model: 'DW-8500',          type: 'Front Load',      variants: ['8kg'] },
  { categoryId: 'washing', brand: 'PEL',       model: 'PWM-7500',         type: 'Front Load',      variants: ['7.5kg'] },
  { categoryId: 'washing', brand: 'PEL',       model: 'PWMS-1050',        type: 'Top Load',        variants: ['10kg'] },
  { categoryId: 'washing', brand: 'Orient',    model: 'OWM-8001',         type: 'Fully Auto',      variants: ['8kg'] },
  { categoryId: 'washing', brand: 'Orient',    model: 'OWMF-8001',        type: 'Front Load',      variants: ['8kg'] },
  { categoryId: 'washing', brand: 'Super Asia',model: 'SA-620',           type: 'Twin Tub',        variants: ['6kg'] },
  { categoryId: 'washing', brand: 'Super Asia',model: 'SA-1000',          type: 'Top Load',        variants: ['10kg'] },
  { categoryId: 'washing', brand: 'EcoStar',   model: 'WM-FL80',          type: 'Front Load',      variants: ['8kg'] },

  // ── REFRIGERATOR ─────────────────────────────────────────
  { categoryId: 'fridge', brand: 'Samsung',   model: 'Family Hub RF28R7201SR', type: 'Smart French Door', variants: ['830L'] },
  { categoryId: 'fridge', brand: 'Samsung',   model: 'Side-by-Side RS25J500DSR', type: 'Side by Side',   variants: ['670L'] },
  { categoryId: 'fridge', brand: 'LG',        model: 'InstaView LFXS26973S',   type: 'French Door Smart', variants: ['740L'] },
  { categoryId: 'fridge', brand: 'LG',        model: 'Door-in-Door LFXS28968S',type: 'French Door',       variants: ['790L'] },
  { categoryId: 'fridge', brand: 'Haier',     model: 'HRF-362',                type: 'Double Door',       variants: ['362L'] },
  { categoryId: 'fridge', brand: 'Haier',     model: 'HRF-389',                type: 'Double Door',       variants: ['389L'] },
  { categoryId: 'fridge', brand: 'Whirlpool', model: 'IF278',                  type: 'Frost Free',        variants: ['265L'] },
  { categoryId: 'fridge', brand: 'Whirlpool', model: 'IF300',                  type: 'Frost Free',        variants: ['292L'] },
  { categoryId: 'fridge', brand: 'Bosch',     model: 'Serie 6 KGN39VL35',      type: 'Frost Free',        variants: ['366L'] },
  { categoryId: 'fridge', brand: 'Dawlance',  model: 'DW-300',                 type: 'Single Door',       variants: ['300L'] },
  { categoryId: 'fridge', brand: 'Dawlance',  model: 'DW-350',                 type: 'Double Door',       variants: ['350L'] },
  { categoryId: 'fridge', brand: 'Dawlance',  model: 'DW-580 WB',              type: 'Inverter',          variants: ['580L'] },
  { categoryId: 'fridge', brand: 'PEL',       model: 'PEL-300',                type: 'Single Door',       variants: ['300L'] },
  { categoryId: 'fridge', brand: 'PEL',       model: 'PEL-350',                type: 'Double Door',       variants: ['350L'] },
  { categoryId: 'fridge', brand: 'Orient',    model: 'OR-300',                 type: 'Single Door',       variants: ['300L'] },
  { categoryId: 'fridge', brand: 'Orient',    model: 'OR-350',                 type: 'Double Door',       variants: ['350L'] },
  { categoryId: 'fridge', brand: 'EcoStar',   model: 'ES-300',                 type: 'Single Door',       variants: ['300L'] },
  { categoryId: 'fridge', brand: 'EcoStar',   model: 'ES-350',                 type: 'Double Door',       variants: ['350L'] },
  { categoryId: 'fridge', brand: 'Super Asia', model: 'SA-300',                type: 'Single Door',       variants: ['300L'] },
  { categoryId: 'fridge', brand: 'Super Asia', model: 'SA-350',                type: 'Double Door',       variants: ['350L'] },
];

async function seedProducts() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected!');

    // Purane products delete karo
    await Product.deleteMany({});
    console.log('🗑️  Old products cleared');

    // Naye insert karo
    const result = await Product.insertMany(PRODUCTS);
    console.log(`✅ ${result.length} products inserted successfully!`);

    // Summary
    const summary = await Product.aggregate([
      { $group: { _id: '$categoryId', count: { $sum: 1 } } }
    ]);
    console.log('\n📊 Summary:');
    summary.forEach(s => console.log(`   ${s._id}: ${s.count} products`));

    await mongoose.disconnect();
    console.log('\n✅ Done! Database seeded.');
  } catch (err) {
    console.error('❌ Seed error:', err.message);
    process.exit(1);
  }
}

seedProducts();