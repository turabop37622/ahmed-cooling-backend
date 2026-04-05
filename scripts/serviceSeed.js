require('dotenv').config();
const mongoose = require('mongoose');
const Service  = require('../models/Service');

const MONGO_URI = process.env.MONGODB_URI;

const SERVICES = [
  { name: 'AC Repair', nameAr: 'إصلاح المكيف', description: 'Expert diagnosis & repair for all AC brands — split, window & inverter', descriptionAr: 'تشخيص وإصلاح احترافي لجميع أنواع المكيفات', icon: '❄️', basePrice: 5000, category: 'ac', isPopular: true, isEmergency: false, estimatedDuration: '2-3 hours', warrantyDays: 30 },
  { name: 'AC Installation', nameAr: 'تركيب المكيف', description: 'Professional split & window AC installation with piping and wiring', descriptionAr: 'تركيب احترافي للمكيفات', icon: '🔧', basePrice: 3000, category: 'ac', isPopular: true, isEmergency: false, estimatedDuration: '3-4 hours', warrantyDays: 30 },
  { name: 'AC Gas Refill', nameAr: 'تعبئة غاز المكيف', description: 'Refrigerant gas recharge & leak detection for all AC types', descriptionAr: 'إعادة تعبئة غاز التبريد وكشف التسريب', icon: '💨', basePrice: 2000, category: 'ac', isPopular: false, isEmergency: false, estimatedDuration: '1-2 hours', warrantyDays: 15 },
  { name: 'AC Deep Cleaning', nameAr: 'تنظيف عميق للمكيف', description: 'Complete AC deep cleaning — filters, coils, drain & sanitization', descriptionAr: 'تنظيف عميق شامل للمكيف', icon: '🧹', basePrice: 2500, category: 'ac', isPopular: true, isEmergency: false, estimatedDuration: '2-3 hours', warrantyDays: 7 },
  { name: 'AC Compressor Repair', nameAr: 'إصلاح ضاغط المكيف', description: 'Compressor diagnosis, repair & replacement for all brands', descriptionAr: 'تشخيص وإصلاح واستبدال الضاغط', icon: '⚡', basePrice: 8000, category: 'ac', isPopular: false, isEmergency: false, estimatedDuration: '3-5 hours', warrantyDays: 60 },
  { name: 'AC PCB Repair', nameAr: 'إصلاح لوحة المكيف', description: 'PCB board repair & replacement for inverter AC units', descriptionAr: 'إصلاح واستبدال لوحة التحكم', icon: '🔌', basePrice: 4000, category: 'ac', isPopular: false, isEmergency: false, estimatedDuration: '2-3 hours', warrantyDays: 30 },
  { name: 'AC Shifting', nameAr: 'نقل المكيف', description: 'Safe AC removal, transport & re-installation at new location', descriptionAr: 'نقل المكيف بأمان وإعادة تركيبه', icon: '🚛', basePrice: 3500, category: 'ac', isPopular: false, isEmergency: false, estimatedDuration: '4-5 hours', warrantyDays: 15 },
  { name: 'Central AC Service', nameAr: 'صيانة التكييف المركزي', description: 'Commercial central AC maintenance, repair & duct cleaning', descriptionAr: 'صيانة وإصلاح التكييف المركزي', icon: '🏢', basePrice: 15000, category: 'ac', isPopular: false, isEmergency: false, estimatedDuration: '5-8 hours', warrantyDays: 30 },
  { name: 'Refrigerator Repair', nameAr: 'إصلاح الثلاجة', description: 'All refrigerator brands — compressor, thermostat, gas & general', descriptionAr: 'إصلاح جميع أنواع الثلاجات', icon: '🧊', basePrice: 3000, category: 'refrigerator', isPopular: true, isEmergency: false, estimatedDuration: '2-3 hours', warrantyDays: 30 },
  { name: 'Freezer Repair', nameAr: 'إصلاح الفريزر', description: 'Deep freezer & chest freezer repair — all brands supported', descriptionAr: 'إصلاح الفريزر العميق لجميع الماركات', icon: '🥶', basePrice: 3000, category: 'refrigerator', isPopular: false, isEmergency: false, estimatedDuration: '2-3 hours', warrantyDays: 30 },
  { name: 'Fridge Gas Refill', nameAr: 'تعبئة غاز الثلاجة', description: 'Refrigerator gas recharge with leak detection & testing', descriptionAr: 'إعادة تعبئة غاز الثلاجة مع فحص التسريب', icon: '🔋', basePrice: 2500, category: 'refrigerator', isPopular: false, isEmergency: false, estimatedDuration: '1-2 hours', warrantyDays: 15 },
  { name: 'Fridge Thermostat Fix', nameAr: 'إصلاح ترموستات الثلاجة', description: 'Thermostat replacement & temperature calibration', descriptionAr: 'استبدال الترموستات ومعايرة الحرارة', icon: '🌡️', basePrice: 1500, category: 'refrigerator', isPopular: false, isEmergency: false, estimatedDuration: '1-2 hours', warrantyDays: 30 },
  { name: 'Washing Machine Repair', nameAr: 'إصلاح الغسالة', description: 'Front load, top load & twin tub — motor, drum & drainage fix', descriptionAr: 'إصلاح جميع أنواع الغسالات', icon: '🌊', basePrice: 3500, category: 'washing-machine', isPopular: true, isEmergency: false, estimatedDuration: '2-3 hours', warrantyDays: 30 },
  { name: 'Stove & Oven Repair', nameAr: 'إصلاح الموقد والفرن', description: 'Gas stove, oven, burner & hob repair with safety inspection', descriptionAr: 'إصلاح المواقد والأفران مع فحص السلامة', icon: '🍳', basePrice: 1500, category: 'stove', isPopular: false, isEmergency: false, estimatedDuration: '1-2 hours', warrantyDays: 15 },
  { name: 'Microwave Repair', nameAr: 'إصلاح الميكروويف', description: 'Microwave oven repair — magnetron, fuse, turntable & door', descriptionAr: 'إصلاح فرن الميكروويف', icon: '📡', basePrice: 2000, category: 'stove', isPopular: false, isEmergency: false, estimatedDuration: '1-2 hours', warrantyDays: 15 },
  { name: 'Water Dispenser Repair', nameAr: 'إصلاح موزع المياه', description: 'Hot & cold water dispenser repair and maintenance', descriptionAr: 'إصلاح وصيانة موزع المياه', icon: '💧', basePrice: 1500, category: 'general', isPopular: false, isEmergency: false, estimatedDuration: '1-2 hours', warrantyDays: 15 },
  { name: 'UPS & Inverter Repair', nameAr: 'إصلاح UPS والعاكس', description: 'UPS, inverter & battery repair for home power backup', descriptionAr: 'إصلاح UPS والعاكس والبطارية', icon: '🔋', basePrice: 2500, category: 'general', isPopular: false, isEmergency: false, estimatedDuration: '2-3 hours', warrantyDays: 30 },
  { name: 'General Maintenance', nameAr: 'صيانة عامة', description: 'Preventive maintenance checkup for all home appliances', descriptionAr: 'فحص صيانة وقائية لجميع الأجهزة المنزلية', icon: '🛠️', basePrice: 2000, category: 'general', isPopular: false, isEmergency: false, estimatedDuration: '1-2 hours', warrantyDays: 7 },
  { name: 'Annual Maintenance Plan', nameAr: 'خطة الصيانة السنوية', description: 'Yearly AC & appliance maintenance contract with priority support', descriptionAr: 'عقد صيانة سنوي للمكيفات والأجهزة', icon: '📋', basePrice: 12000, category: 'general', isPopular: true, isEmergency: false, estimatedDuration: 'Yearly', warrantyDays: 365 },
  { name: '24/7 Emergency Repair', nameAr: 'إصلاح طوارئ 24/7', description: 'Round the clock emergency appliance repair — we come immediately', descriptionAr: 'خدمة إصلاح طوارئ على مدار الساعة', icon: '🚨', basePrice: 8000, category: 'general', isPopular: true, isEmergency: true, estimatedDuration: '1 hour', warrantyDays: 30 },
  { name: 'Electrical Wiring Fix', nameAr: 'إصلاح الأسلاك الكهربائية', description: 'Appliance wiring repair, socket fix & electrical safety check', descriptionAr: 'إصلاح الأسلاك الكهربائية وفحص السلامة', icon: '⚡', basePrice: 1500, category: 'general', isPopular: false, isEmergency: false, estimatedDuration: '1-2 hours', warrantyDays: 15 },
];

async function seedServices() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected!');

    await Service.deleteMany({});
    console.log('Old services cleared');

    const result = await Service.insertMany(SERVICES);
    console.log(`${result.length} services inserted!\n`);

    result.forEach(s => console.log(`   ${s.icon}  ${s.name} — Rs ${s.basePrice}`));

    const summary = await Service.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]);
    console.log('\nSummary:');
    summary.forEach(s => console.log(`   ${s._id}: ${s.count}`));

    await mongoose.disconnect();
    console.log('\nDone!');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

seedServices();
