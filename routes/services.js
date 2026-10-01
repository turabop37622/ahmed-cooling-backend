const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Service = require('../models/Service');
const { body, validationResult } = require('express-validator');

const ALLOWED_FIELDS = ['name', 'nameAr', 'description', 'descriptionAr', 'icon', 'basePrice', 'category',
  'isPopular', 'isEmergency', 'estimatedDuration', 'warrantyDays', 'images', 'active'];
// Only these fields can be written by an admin request; nothing else (_id, createdAt, ...) can be injected.
const pickFields = (body) => {
  const out = {};
  for (const key of ALLOWED_FIELDS) if (body[key] !== undefined) out[key] = body[key];
  return out;
};
const isObjectId = (v) => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v);

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
router.post('/', auth, [
  body('name').trim().notEmpty().withMessage('Service name is required'),
  body('nameAr').trim().notEmpty().withMessage('Arabic service name is required'),
  body('description').notEmpty().withMessage('Description is required'),
  body('descriptionAr').notEmpty().withMessage('Arabic description is required'),
  body('basePrice').isNumeric().withMessage('Base price must be a number'),
  body('category').isIn(['ac', 'refrigerator', 'washing-machine', 'stove', 'general']).withMessage('Invalid category')
], async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    // Validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        errors: errors.array() 
      });
    }

    const service = new Service(pickFields(req.body));
    await service.save();

    res.status(201).json({
      success: true,
      message: 'Service created successfully',
      service
    });

  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Update service (Admin only)
router.put('/:id', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    if (!isObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Service not found' });
    const service = await Service.findByIdAndUpdate(
      req.params.id,
      { $set: pickFields(req.body) },
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
    console.error('Update service error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Delete service (Admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

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
    console.error('Delete service error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
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
