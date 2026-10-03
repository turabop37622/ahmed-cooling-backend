const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Service = require('../models/Service');
const { body, validationResult } = require('express-validator');
const { slugForService } = require('../utils/slug');

const ALLOWED_FIELDS = ['name', 'nameAr', 'description', 'descriptionAr', 'icon', 'basePrice', 'category',
  'isPopular', 'isEmergency', 'estimatedDuration', 'warrantyDays', 'images', 'active'];
// Only these fields can be written by an admin request; nothing else (_id, slug, createdAt, ...) can be injected.
const pickFields = (body) => {
  const out = {};
  for (const key of ALLOWED_FIELDS) if (body[key] !== undefined) out[key] = body[key];
  return out;
};
const isObjectId = (v) => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v);

const CATEGORIES = ['ac', 'refrigerator', 'washing-machine', 'stove', 'general'];
const MAX_PRICE = 100000;

// Validation for POST (required = true: the mandatory fields must be present) and PUT (only the fields sent).
// Every rule rejects the wrong type outright (no silent coercion of arrays/objects/booleans).
const text = (field, label, { min = 0, max, required }) => {
  let chain = body(field);
  if (!required) chain = chain.optional();
  return chain
    .isString().withMessage(`${label} must be text`).bail()
    .trim()
    .isLength({ min: Math.max(min, required ? 1 : 0), max })
    .withMessage(min ? `${label} must be ${min}-${max} characters` : `${label} must be 1-${max} characters`);
};
const isBool = (field) => body(field).optional().custom((v) => typeof v === 'boolean').withMessage(`${field} must be true or false`);
// A real, finite number (Infinity / NaN / '' / booleans are refused); numeric strings are accepted.
const isPrice = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== ''))
  && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= MAX_PRICE;
const serviceRules = (required) => [
  text('name', 'Service name', { min: 2, max: 120, required }),
  text('nameAr', 'Arabic service name', { min: 2, max: 120, required }),
  text('description', 'Description', { max: 2000, required }),
  text('descriptionAr', 'Arabic description', { max: 2000, required }),
  (required ? body('basePrice') : body('basePrice').optional())
    .custom(isPrice).withMessage(`Base price must be a number from 0 to ${MAX_PRICE}`),
  (required ? body('category') : body('category').optional()).isIn(CATEGORIES).withMessage('Invalid category'),
  body('icon').optional().isString().withMessage('Icon must be text').bail().trim().isLength({ max: 32 }).withMessage('Icon is too long'),
  body('estimatedDuration').optional().isString().withMessage('Duration must be text').bail()
    .trim().isLength({ min: 1, max: 50 }).withMessage('Duration must be 1-50 characters'),
  body('warrantyDays').optional().custom((v) => Number.isInteger(v) && v >= 0 && v <= 3650)
    .withMessage('Warranty must be a whole number of days from 0 to 3650'),
  body('images').optional()
    .custom((v) => Array.isArray(v) && v.length <= 20 && v.every((u) => typeof u === 'string' && u.length <= 500 && /^https?:\/\//i.test(u)))
    .withMessage('Images must be a list of up to 20 http(s) URLs'),
  isBool('isPopular'), isBool('isEmergency'), isBool('active'),
];

// Sends the 400 and returns true when the request did not pass serviceRules.
const validationFailed = (req, res) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  const list = errors.array();
  res.status(400).json({ success: false, message: list[0].msg, errors: list });
  return true;
};

// The validated, whitelisted fields of the request (basePrice as a number).
const serviceFields = (reqBody) => {
  const out = pickFields(reqBody);
  if (out.basePrice !== undefined) out.basePrice = Number(out.basePrice);
  return out;
};

// Bad input that only the model catches is still the client's fault: 400, never 500.
const sendError = (res, error, label) => {
  if (error && error.name === 'ValidationError') {
    const errors = Object.values(error.errors || {}).map((e) => ({ path: e.path, msg: e.message }));
    return res.status(400).json({ success: false, message: errors[0]?.msg || 'Invalid service data', errors });
  }
  if (error && error.name === 'CastError') {
    return res.status(400).json({ success: false, message: `Invalid value for ${error.path}`, errors: [{ path: error.path, msg: 'Invalid value' }] });
  }
  if (error && error.code === 11000) {
    return res.status(409).json({ success: false, message: 'A service with this slug already exists' });
  }
  console.error(label, error);
  return res.status(500).json({ success: false, message: 'Server error' });
};

const adminOnly = (req, res) => {
  if (req.user.role === 'admin') return false;
  res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
  return true;
};

// Get all services
router.get('/', async (req, res) => {
  try {
    const { category, popular, emergency } = req.query;

    // The public list only ever shows active services.
    const query = { active: true };

    if (typeof category === 'string' && category) {
      query.category = category;
    }

    if (popular === 'true') {
      query.isPopular = true;
    }

    if (emergency === 'true') {
      query.isEmergency = true;
    }

    const services = await Service.find(query).sort({ isPopular: -1, createdAt: -1 });

    res.json({
      success: true,
      services
    });

  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Get single service
router.get('/:id', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Service not found' });
    const service = await Service.findById(req.params.id);

    if (!service || !service.active) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    res.json({
      success: true,
      service
    });

  } catch (error) {
    console.error('Get service error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Create service (Admin only)
router.post('/', auth, serviceRules(true), async (req, res) => {
  try {
    if (adminOnly(req, res)) return;
    if (validationFailed(req, res)) return;

    const service = new Service(serviceFields(req.body));
    // The slug comes from the English name and stays with the service for good (a rename keeps it).
    const slug = await slugForService(Service, service);
    if (slug) service.slug = slug;
    await service.save();

    res.status(201).json({
      success: true,
      message: 'Service created successfully',
      service
    });

  } catch (error) {
    sendError(res, error, 'Create service error:');
  }
});

// Update service (Admin only). Also (de)activates: PUT { active: true|false }.
router.put('/:id', auth, serviceRules(false), async (req, res) => {
  try {
    if (adminOnly(req, res)) return;
    if (!isObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Service not found' });
    if (validationFailed(req, res)) return;

    const fields = serviceFields(req.body);
    if (!Object.keys(fields).length) return res.status(400).json({ success: false, message: 'Nothing to update', errors: [] });

    // A rename never changes the URL. A service created before slugs were stored first gets the slug of its
    // CURRENT (old) name, so the link that is live today keeps working after the rename.
    if (fields.name !== undefined) {
      const existing = await Service.findById(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: 'Service not found' });
      if (!existing.slug) {
        const slug = await slugForService(Service, existing);
        if (slug) fields.slug = slug;
      }
    }

    const service = await Service.findByIdAndUpdate(
      req.params.id,
      { $set: fields },
      { new: true, runValidators: true }
    );

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    res.json({
      success: true,
      message: 'Service updated successfully',
      service
    });

  } catch (error) {
    sendError(res, error, 'Update service error:');
  }
});

// "Delete" service (Admin only) = deactivate. The record stays (old bookings point at it); PUT { active: true } restores it.
router.delete('/:id', auth, async (req, res) => {
  try {
    if (adminOnly(req, res)) return;

    if (!isObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Service not found' });
    const service = await Service.findByIdAndUpdate(
      req.params.id,
      { active: false },
      { new: true }
    );

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    res.json({
      success: true,
      message: 'Service deactivated successfully',
      service
    });

  } catch (error) {
    sendError(res, error, 'Delete service error:');
  }
});

// Search services
router.get('/search/:query', async (req, res) => {
  try {
    const raw = String(req.params.query).slice(0, 100);
    const query = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const services = await Service.find({
      active: true,
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { nameAr: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { descriptionAr: { $regex: query, $options: 'i' } },
        { category: { $regex: query, $options: 'i' } }
      ]
    });

    res.json({
      success: true,
      services
    });

  } catch (error) {
    console.error('Search services error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;
