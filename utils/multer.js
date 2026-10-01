// backend/utils/multer.js

const multer = require('multer');

// Only plain raster formats: SVG (scriptable) and gif are rejected.
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const storage = multer.memoryStorage(); // file disk pe save nahi hogi
const upload  = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Sirf images allowed hain!'), false);
  },
});

module.exports = upload;