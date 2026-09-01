const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads')),
  filename: (req, file, cb) => {
    const safeName = Date.now() + '-' + file.fieldname + path.extname(file.originalname);
    cb(null, safeName);
  },
});

const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

function fileFilter(req, file, cb) {
  if (allowedTypes.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only JPG, PNG, WEBP, or PDF files are allowed'));
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = upload;
