const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// ── Config Cloudinary ─────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Storage Cloudinary ────────────────────────────────────────────────────────
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: `syndicpro/${req.user?.residence_id || 'uploads'}`,
    resource_type: 'auto',
    allowed_formats: ['pdf','doc','docx','xls','xlsx','jpg','jpeg','png','gif'],
    public_id: `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`,
  }),
});

// ── Fallback : stockage local si Cloudinary non configuré ─────────────────────
const localStorage = multer.diskStorage({
  destination: '/tmp/uploads/',
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const isCloudinaryConfigured = () =>
  !!(process.env.CLOUDINARY_CLOUD_NAME &&
     process.env.CLOUDINARY_API_KEY &&
     process.env.CLOUDINARY_API_SECRET);

// ── Middleware multer ─────────────────────────────────────────────────────────
const upload = multer({
  storage: isCloudinaryConfigured() ? storage : localStorage,
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
    else cb(new Error('Type de fichier non autorisé (PDF, Word, Excel, images uniquement)'));
  },
});

const getFileUrl = (file) => {
  if (isCloudinaryConfigured()) return file.path;
  return `/uploads/${file.filename}`;
};

module.exports = { upload, getFileUrl, cloudinary };
