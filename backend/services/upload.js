const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// ── Config Cloudinary ─────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const isCloudinaryConfigured = () =>
  !!(process.env.CLOUDINARY_CLOUD_NAME &&
     process.env.CLOUDINARY_API_KEY &&
     process.env.CLOUDINARY_API_SECRET);

// ── Storage Cloudinary (v1 API) ───────────────────────────────────────────────
const cloudinaryStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'syndicpro',
    resource_type: 'auto',
    allowed_formats: ['pdf','doc','docx','xls','xlsx','jpg','jpeg','png'],
  },
});

// ── Fallback stockage mémoire si Cloudinary non configuré ────────────────────
const memoryStorage = multer.memoryStorage();

// ── Middleware multer ─────────────────────────────────────────────────────────
const upload = multer({
  storage: isCloudinaryConfigured() ? cloudinaryStorage : memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg', 'image/png', 'image/gif',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Type non autorisé (PDF, Word, Excel, images uniquement)'));
  },
});

const getFileUrl = (file) => {
  if (file.path) return file.path; // Cloudinary
  return null; // mémoire — pas de stockage persistant sans Cloudinary
};

module.exports = { upload, getFileUrl, cloudinary };
