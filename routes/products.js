// backend/routes/products.js

const express    = require('express');
const router     = express.Router();
const Product    = require('../models/Products');
const cloudinary = require('../utils/cloudinary');
const upload     = require('../utils/multer');

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
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/products/brands?category=ac ────────────────────
router.get('/brands', async (req, res) => {
  try {
    const { category } = req.query;
    if (!category) {
      return res.status(400).json({ success: false, message: 'category required' });
    }
    const brands = await Product.distinct('brand', { categoryId: category });
    res.json({ success: true, data: brands.sort() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/products/models?category=ac&brand=Daikin ────────
router.get('/models', async (req, res) => {
  try {
    const { category, brand } = req.query;
    if (!category || !brand) {
      return res.status(400).json({ success: false, message: 'category aur brand dono required hain' });
    }
    const models = await Product.find(
      { categoryId: category, brand },
      { model: 1, type: 1, variants: 1, _id: 0 }
    );
    res.json({ success: true, data: models });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/products/all ────────────────────────────────────
router.get('/all', async (req, res) => {
  try {
    const { category } = req.query;
    const filter = category ? { categoryId: category } : {};
    const products = await Product.find(filter);
    res.json({ success: true, data: products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/products/add ───────────────────────────────────
router.post('/add', upload.single('image'), async (req, res) => {
  try {
    const { categoryId, brand, model, type, variants } = req.body;

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
      variants: variants ? JSON.parse(variants) : [],
      imageUrl,
      imagePublicId,
    });

    res.status(201).json({ success: true, data: product });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/products/:id/image ──────────────────────────────
router.put('/:id/image', upload.single('image'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product nahi mila' });
    }

    if (product.imagePublicId) {
      await cloudinary.uploader.destroy(product.imagePublicId);
    }

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'ahmedcooling/products' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(req.file.buffer);
    });

    product.imageUrl      = result.secure_url;
    product.imagePublicId = result.public_id;
    await product.save();

    res.json({ success: true, data: product });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/products/:id ─────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
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
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;