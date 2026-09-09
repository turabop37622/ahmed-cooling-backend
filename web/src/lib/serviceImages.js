/**
 * Authentic real photography service images featuring professional Asian / South Asian
 * technicians performing genuine HVAC, refrigeration, and appliance repairs.
 */
export const SERVICE_IMAGES = {
  // AC Services
  'AC Repair': '/services/ac-repair.jpg',
  'AC Installation': '/services/ac-installation.jpg',
  'AC Deep Cleaning': '/services/ac-cleaning.jpg',
  'AC Gas Refill': '/services/ac-gas-refill.jpg',
  'AC Compressor Repair': '/services/ac-repair.jpg',
  'AC PCB Repair': '/services/electrical-repair.jpg',
  'AC Shifting': '/services/ac-installation.jpg',
  'Central AC Service': '/services/central-ac.jpg',

  // Refrigerator & Freezer Services
  'Refrigerator Repair': '/services/refrigerator-repair.jpg',
  'Freezer Repair': '/services/refrigerator-repair.jpg',
  'Fridge Gas Refill': '/services/refrigerator-repair.jpg',
  'Fridge Thermostat Fix': '/services/refrigerator-repair.jpg',

  // Washing Machine
  'Washing Machine Repair': '/services/washing-machine-repair.jpg',

  // Cooking & Kitchen Appliances
  'Stove & Oven Repair': '/services/stove-repair.jpg',
  'Microwave Repair': '/services/stove-repair.jpg',
  'Water Dispenser Repair': '/services/refrigerator-repair.jpg',

  // Electrical & Power
  'Electrical Wiring Fix': '/services/electrical-repair.jpg',
  'UPS & Inverter Repair': '/services/electrical-repair.jpg',
};

export const CATEGORY_FALLBACKS = {
  ac: '/services/ac-repair.jpg',
  refrigerator: '/services/refrigerator-repair.jpg',
  'washing-machine': '/services/washing-machine-repair.jpg',
  washer: '/services/washing-machine-repair.jpg',
  stove: '/services/stove-repair.jpg',
  general: '/services/electrical-repair.jpg',
};

export const DEFAULT_SERVICE_IMAGE = '/services/ac-repair.jpg';

export const getServiceImage = (serviceName, category) => {
  if (!serviceName && !category) return DEFAULT_SERVICE_IMAGE;

  // 1. Direct name match in SERVICE_IMAGES dictionary
  if (serviceName && SERVICE_IMAGES[serviceName]) {
    return SERVICE_IMAGES[serviceName];
  }

  // 2. Intelligent keyword & substring match (prioritizing specific appliances)
  if (serviceName) {
    const s = String(serviceName).toLowerCase();

    // Washing Machine (checked before generic "wash")
    if (s.includes('washing') || s.includes('washer') || s.includes('غسال')) {
      return SERVICE_IMAGES['Washing Machine Repair'];
    }

    // Refrigerator & Freezer
    if (s.includes('refrigerator') || s.includes('fridge') || s.includes('freezer') || s.includes('ثلاج') || s.includes('فريزر')) {
      return SERVICE_IMAGES['Refrigerator Repair'];
    }

    // Stove & Oven
    if (s.includes('stove') || s.includes('oven') || s.includes('cooker') || s.includes('فرن') || s.includes('بوتاجاز')) {
      return SERVICE_IMAGES['Stove & Oven Repair'];
    }

    // Electrical Wiring & Power
    if (s.includes('wiring') || s.includes('electric') || s.includes('كهرب') || s.includes('قواطع')) {
      return SERVICE_IMAGES['Electrical Wiring Fix'];
    }

    // Central AC / Ducted
    if (s.includes('central') || s.includes('duct') || s.includes('مركزي') || s.includes('دكت')) {
      return SERVICE_IMAGES['Central AC Service'];
    }

    // AC Deep Cleaning / Wash (after washing machine check)
    if (s.includes('cleaning') || s.includes('deep clean') || s.includes('تنظيف') || s.includes('غسيل')) {
      return SERVICE_IMAGES['AC Deep Cleaning'];
    }

    // AC Gas Refill
    if (s.includes('gas') || s.includes('refill') || s.includes('freon') || s.includes('فريون') || s.includes('شحن')) {
      return SERVICE_IMAGES['AC Gas Refill'];
    }

    // AC Installation / Mounting
    if (s.includes('install') || s.includes('mount') || s.includes('تركيب')) {
      return SERVICE_IMAGES['AC Installation'];
    }

    // General AC Repair
    if (s.includes('ac') || s.includes('air cond') || s.includes('تكييف') || s.includes('مكيف')) {
      return SERVICE_IMAGES['AC Repair'];
    }
  }

  // 3. Category Fallback
  if (category) {
    const cat = String(category).toLowerCase();
    if (CATEGORY_FALLBACKS[cat]) return CATEGORY_FALLBACKS[cat];
    if (cat.includes('ac')) return CATEGORY_FALLBACKS.ac;
    if (cat.includes('fridge') || cat.includes('refrigerator')) return CATEGORY_FALLBACKS.refrigerator;
    if (cat.includes('wash')) return CATEGORY_FALLBACKS['washing-machine'];
    if (cat.includes('stove') || cat.includes('oven')) return CATEGORY_FALLBACKS.stove;
  }

  return DEFAULT_SERVICE_IMAGE;
};
