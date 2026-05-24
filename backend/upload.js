const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ── Cloudinary (optionnel) ────────────────────────────────
let cloudinary = null;
let CloudinaryStorage = null;
const isCloudinaryConfigured = () =>
  !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

if (isCloudinaryConfigured()) {
  try {
    cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key:    process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    CloudinaryStorage = require('multer-storage-cloudinary').CloudinaryStorage;
    console.log('☁️  Cloudinary configuré');
  } catch(e) { console.warn('⚠️  Cloudinary non disponible:', e.message); }
}

// ── Dossier de stockage local ─────────────────────────────
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/uploads';
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ── Disk storage (fallback local) ─────────────────────────
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

// ── Cloudinary storage ────────────────────────────────────
let cloudinaryStorage = null;
if (cloudinary && CloudinaryStorage) {
  cloudinaryStorage = new CloudinaryStorage({
    cloudinary,
    params: { folder: 'syndicpro', resource_type: 'auto' },
  });
}

// ── Multer instance ───────────────────────────────────────
const upload = multer({
  storage: cloudinaryStorage || diskStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg','image/png','image/gif',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Type non autorisé'));
  },
});

// ── URL du fichier uploadé ────────────────────────────────
const getFileUrl = (file, req) => {
  if (!file) return null;
  if (file.path && file.path.startsWith('http')) return file.path; // Cloudinary
  const filename = file.filename || path.basename(file.path || '');
  if (!filename) return null;
  const base = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  return `${base}/uploads/${filename}`;
};

module.exports = { upload, getFileUrl, cloudinary };
