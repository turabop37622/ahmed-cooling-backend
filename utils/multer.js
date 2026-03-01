// backend/utils/multer.js

const multer = require('multer');

const storage = multer.memoryStorage(); // file disk pe save nahi hogi
const upload  = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Sirf images allowed hain!'), false);
  },
});

module.exports = upload;