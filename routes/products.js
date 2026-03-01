// backend/routes/products.js

const express    = require('express');
const router     = express.Router();
const Product    = require('../models/Products');
const cloudinary = require('../utils/cloudinary');
const upload     = require('../utils/multer');

// ── (tumhare existing routes waise hi rahenge) ───────────────

router.get('/categories', async (req, res) => { /* ... */ });
router.get('/brands',     async (req, res) => { /* ... */ });
router.get('/models',     async (req, res) => { /* ... */ });
router.get('/all',        async (req, res) => { /* ... */ });

// ── POST /api/products/add ───────────────────────────────────
// Naya product + image upload
router.post('/add', upload.single('image'), async (req, res) => {
  try {
    const { categoryId, brand, model, type, variants } = req.body;

    let imageUrl      = '';
    let imagePublicId = '';

    // Agar image bheji hai toh Cloudinary pe upload karo
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
// Existing product ki image update karo
router.put('/:id/image', upload.single('image'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product nahi mila' });
    }

    // Purani image Cloudinary se delete karo
    if (product.imagePublicId) {
      await cloudinary.uploader.destroy(product.imagePublicId);
    }

    // Nayi image upload karo
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
// Product + uski image dono delete karo
router.delete('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product nahi mila' });
    }

    // Cloudinary se image bhi hatao
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