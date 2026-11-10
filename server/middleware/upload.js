const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'image/jpg'];

// Factory function: creates a multer instance for the given sub-directory
const createUploader = (subDir) => {
  const uploadDir = path.join(__dirname, '../uploads', subDir);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  });

  const fileFilter = (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('صيغة الملف غير مدعومة. يسمح فقط بالصور و PDF.'), false);
    }
  };

  return multer({
    storage: storage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB per file
    fileFilter: fileFilter
  });
};

const uploadRadiology = createUploader('radiology');
const uploadLab       = createUploader('lab');
const uploadGeneralStore = createUploader('generalStore');
const uploadOrStore      = createUploader('orStore');

module.exports = { uploadRadiology, uploadLab, uploadGeneralStore, uploadOrStore };
