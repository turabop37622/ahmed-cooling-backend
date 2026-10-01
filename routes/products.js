// backend/routes/products.js

const express    = require('express');
const router     = express.Router();
const auth       = require('../middleware/auth');
const Product    = require('../models/Products');
const cloudinary = require('../utils/cloudinary');
const upload     = require('../utils/multer');

const adminAuth = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
  next();
};

// Bad ids/values are the caller's mistake (400); anything else is logged and hidden behind a generic 500.
const fail = (res, err, where) => {
  if (err?.name === 'CastError' || err?.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: 'Invalid request data' });
  }
  console.error(`❌ Products ${where} error:`, err);
  return res.status(500).json({ success: false, message: 'Server error' });
};

// ── GET /api/products/categories ────────────────────────────
router.get('/categories', async (req, res) => {
  try {
    const CATEGORIES = [
      { id: 'ac',      label: 'AC',              emoji: '❄️',  color: '#3B82F6' },
      { id: 'led',     label: 'LED TV',          emoji: '📺',  color: '#8B5CF6' },
      { id: 'fridge',  label: 'Refrigerator',    emoji: '🧊',  color: '#06B6D4' },
      { id: 'washing', label: 'Washing Machine', emoji: '🫧',  color: '#10B981' },
    ];
    res.json({ success: true, data: CATEGORIES });
  } catch (err) {
    fail(res, err, 'categories');
  }
});

// ── GET /api/products/brands?category=ac ────────────────────
router.get('/brands', async (req, res) => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    if (!category) {
      return res.status(400).json({ success: false, message: 'category required' });
    }
    const brands = await Product.distinct('brand', { categoryId: category });
    res.json({ success: true, data: brands.sort() });
  } catch (err) {
    fail(res, err, 'brands');
  }
});

// ── GET /api/products/models?category=ac&brand=Daikin ────────
router.get('/models', async (req, res) => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    const brand = typeof req.query.brand === 'string' ? req.query.brand : '';
    if (!category || !brand) {
      return res.status(400).json({ success: false, message: 'category aur brand dono required hain' });
    }
    const models = await Product.find(
      { categoryId: category, brand },
      { model: 1, type: 1, variants: 1, _id: 0 }
    );
    res.json({ success: true, data: models });
  } catch (err) {
    fail(res, err, 'models');
  }
});

// ── GET /api/products/all ────────────────────────────────────
router.get('/all', async (req, res) => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    const filter = category ? { categoryId: category } : {};
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const [products, total] = await Promise.all([
      Product.find(filter).sort({ _id: 1 }).skip((page - 1) * limit).limit(limit),
      Product.countDocuments(filter),
    ]);
    res.json({ success: true, data: products, total, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (err) {
    fail(res, err, 'list');
  }
});

// ── POST /api/products/add ───────────────────────────────────
router.post('/add', auth, adminAuth, upload.single('image'), async (req, res) => {
  try {
    const { categoryId, brand, model, type, variants } = req.body;
    if ([categoryId, brand, model].some((v) => typeof v !== 'string' || !v.trim())) {
      return res.status(400).json({ success: false, message: 'categoryId, brand and model are required' });
    }
    let parsedVariants = [];
    if (variants) {
      try {
        parsedVariants = typeof variants === 'string' ? JSON.parse(variants) : variants;
      } catch {
        return res.status(400).json({ success: false, message: 'variants must be valid JSON' });
      }
      if (!Array.isArray(parsedVariants)) return res.status(400).json({ success: false, message: 'variants must be a list' });
    }

    let imageUrl      = '';
    let imagePublicId = '';

    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { folder: 'ahmedcooling/products' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        ).end(req.file.buffer);
      });

      imageUrl      = result.secure_url;
      imagePublicId = result.public_id;
    }

    const product = await Product.create({
      categoryId,
      brand,
      model,
      type,
      variants: parsedVariants,
      imageUrl,
      imagePublicId,
    });

    res.status(201).json({ success: true, data: product });

  } catch (err) {
    fail(res, err, 'add');
  }
});

// ── PUT /api/products/:id/image ──────────────────────────────
router.put('/:id/image', auth, adminAuth, upload.single('image'), async (req, res) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(404).json({ success: false, message: 'Product nahi mila' });
    if (!req.file) return res.status(400).json({ success: false, message: 'Image file is required' });
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product nahi mila' });
    }

    // Upload the new image FIRST; the old one is only removed once the new one is safely stored.
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'ahmedcooling/products' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(req.file.buffer);
    });

    const oldPublicId = product.imagePublicId;
    product.imageUrl      = result.secure_url;
    product.imagePublicId = result.public_id;
    await product.save();

    if (oldPublicId) {
      try { await cloudinary.uploader.destroy(oldPublicId); } catch (e) { console.warn('Old image cleanup failed:', e.message); }
    }

    res.json({ success: true, data: product });

  } catch (err) {
    fail(res, err, 'image upload');
  }
});

// ── DELETE /api/products/:id ─────────────────────────────────
router.delete('/:id', auth, adminAuth, async (req, res) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(404).json({ success: false, message: 'Product nahi mila' });
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product nahi mila' });
    }

    if (product.imagePublicId) {
      await cloudinary.uploader.destroy(product.imagePublicId);
    }

    await product.deleteOne();
    res.json({ success: true, message: 'Product delete ho gaya' });

  } catch (err) {
    fail(res, err, 'delete');
  }
});

module.exports = router;
