// ── Upload service v3 : Google Drive + fallback disque ───────────────────────
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Cloudinary (optionnel, priorité 2)
let cloudinary = null;
let CloudinaryStorage = null;
const isCloudinaryConfigured = () =>
  !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY);

// Google Drive (priorité 1)
const gdrive = require('./gdrive');

// Multer : mémoire si Drive ou Cloudinary, sinon disque
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/uploads';
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const getStorage = () => {
  if (gdrive.isConfigured()) {
    return multer.memoryStorage(); // On upload en mémoire puis vers Drive
  }
  if (isCloudinaryConfigured()) {
    try {
      cloudinary = require('cloudinary').v2;
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key:    process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
      const { CloudinaryStorage: CS } = require('multer-storage-cloudinary');
      return new CS({ cloudinary, params: { folder: 'syndicpro', resource_type: 'auto' } });
    } catch(e) { console.warn('Cloudinary indisponible:', e.message); }
  }
  // Fallback : disque local
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  });
};

const upload = multer({
  storage: getStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg','image/png','image/gif','image/webp',
    ];
    allowed.includes(file.mimetype) ? cb(null, true)
      : cb(new Error(`Type non autorisé: ${file.mimetype}`));
  },
});

// ── Résoudre l'URL finale selon le moteur de stockage ────────────────────────
const resolveUrl = async (file, req, residenceId) => {
  if (!file) return { url: null, taille_ko: 0 };
  const taille_ko = Math.round((file.size || 0) / 1024);

  // 1. Google Drive
  if (file.buffer && gdrive.isConfigured()) {
    const result = await gdrive.uploadToGDrive(file, residenceId);
    if (result) return { url: result.url, downloadUrl: result.downloadUrl, driveFileId: result.driveFileId, taille_ko };
  }
  // 2. Cloudinary (path commence par http)
  if (file.path && file.path.startsWith('http')) {
    return { url: file.path, taille_ko };
  }
  // 3. Disque local
  if (file.filename) {
    const base = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    return { url: `${base}/uploads/${file.filename}`, taille_ko };
  }
  return { url: null, taille_ko };
};

const getStorageLabel = () => {
  if (gdrive.isConfigured()) return 'Google Drive';
  if (isCloudinaryConfigured()) return 'Cloudinary';
  return 'Stockage local (temporaire)';
};

module.exports = { upload, resolveUrl, cloudinary, getStorageLabel };
