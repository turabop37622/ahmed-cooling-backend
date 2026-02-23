// backend/routes/products.js

const express = require('express');
const router  = express.Router();
const Product = require('../models/Product');

// ── GET /api/products/categories ────────────────────────────
// Sab categories return karta hai
router.get('/categories', async (req, res) => {
  try {
    const CATEGORIES = [
      { id: 'ac',      label: 'Air Conditioner', emoji: '❄️',  color: '#0EA5E9' },
      { id: 'led',     label: 'LED / Smart TV',  emoji: '📺',  color: '#8B5CF6' },
      { id: 'fridge',  label: 'Refrigerator',    emoji: '🧊',  color: '#06B6D4' },
      { id: 'washing', label: 'Washing Machine', emoji: '🌀',  color: '#10B981' },
    ];
    res.json({ success: true, data: CATEGORIES });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/products/brands?category=ac ────────────────────
// Kisi category ke sab brands
router.get('/brands', async (req, res) => {
  try {
    const { category } = req.query;
    if (!category) {
      return res.status(400).json({ success: false, message: 'category query param required' });
    }
    const brands = await Product.distinct('brand', { categoryId: category });
    res.json({ success: true, data: brands.sort() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/products/models?category=ac&brand=Daikin ───────
// Kisi brand ke sab models
router.get('/models', async (req, res) => {
  try {
    const { category, brand } = req.query;
    if (!category || !brand) {
      return res.status(400).json({ success: false, message: 'category and brand params required' });
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
// Sab products (admin use)
router.get('/all', async (req, res) => {
  try {
    const products = await Product.find().sort({ categoryId: 1, brand: 1 });
    res.json({ success: true, count: products.length, data: products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;