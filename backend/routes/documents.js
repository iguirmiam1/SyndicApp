const router = require('express').Router();
const auth = require('../middleware/auth');
const { query } = require('../db');
const { upload, resolveUrl, getStorageLabel } = require('../services/upload');
const { sendBulk, templates } = require('../services/email');
const { deleteFromGDrive } = require('../services/gdrive');

const APP_URL = process.env.APP_URL || 'https://syndicapp.onrender.com';

// GET /api/documents
router.get('/', auth, async (req, res) => {
  const { categorie } = req.query;
  let sql = `SELECT d.*,u.prenom||' '||u.nom AS uploaded_by_nom
             FROM documents d LEFT JOIN utilisateurs u ON u.id=d.uploaded_by
             WHERE d.residence_id=$1`;
  const params = [req.user.residence_id];
  if (categorie) { sql += ' AND d.categorie=$2'; params.push(categorie); }
  sql += ' ORDER BY d.created_at DESC';
  try {
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/documents/storage-info
router.get('/storage-info', auth.gestionnaire, (req, res) => {
  res.json({ provider: getStorageLabel() });
});

// POST /api/documents — upload avec Google Drive / Cloudinary / disque
router.post('/', auth.gestionnaire, upload.single('fichier'), async (req, res) => {
  const { nom, categorie, notifier_residents } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom du document requis' });
  try {
    const { url, downloadUrl, driveFileId, taille_ko } =
      await resolveUrl(req.file, req, req.user.residence_id);

    const { rows } = await query(
      `INSERT INTO documents (residence_id,nom,categorie,url,taille_ko,uploaded_by,drive_file_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [req.user.residence_id, nom, categorie || 'autre', url, taille_ko, req.user.id, driveFileId || null]
    );

    // Si la colonne drive_file_id n'existe pas encore, INSERT sans elle
    const doc = rows[0] || (await query(
      `INSERT INTO documents (residence_id,nom,categorie,url,taille_ko,uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.residence_id, nom, categorie || 'autre', url, taille_ko, req.user.id]
    )).rows[0];

    // Notifier les résidents
    if ((notifier_residents === 'true' || notifier_residents === true) && url) {
      const { rows: residents } = await query(
        `SELECT email,prenom,nom FROM utilisateurs
         WHERE residence_id=$1 AND role='resident' AND notif_email=true`,
        [req.user.residence_id]
      );
      if (residents.length) {
        sendBulk(residents, (data) => templates.nouveauDocument({
          ...data, nomDoc: nom, categorie: categorie || 'autre', appUrl: APP_URL
        }), {}, APP_URL).catch(console.error);
      }
    }

    res.status(201).json({ ...doc, downloadUrl, provider: getStorageLabel() });
  } catch(e) {
    console.error('Upload error:', e);
    res.status(500).json({ error: 'Erreur upload: ' + e.message });
  }
});

// DELETE /api/documents/:id
router.delete('/:id', auth.gestionnaire, async (req, res) => {
  try {
    const { rows: [doc] } = await query(
      `SELECT url, drive_file_id FROM documents WHERE id=$1 AND residence_id=$2`,
      [req.params.id, req.user.residence_id]
    );
    if (!doc) return res.status(404).json({ error: 'Document non trouvé' });

    // Supprimer le fichier distant
    if (doc.drive_file_id) {
      await deleteFromGDrive(doc.drive_file_id);
    } else if (doc.url?.includes('cloudinary')) {
      try {
        const { cloudinary } = require('../services/upload');
        if (cloudinary) {
          const publicId = doc.url.split('/').pop().replace(/\.[^.]+$/, '');
          await cloudinary.uploader.destroy(publicId);
        }
      } catch(e) { console.warn('Cloudinary delete:', e.message); }
    }

    await query(`DELETE FROM documents WHERE id=$1 AND residence_id=$2`,
      [req.params.id, req.user.residence_id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
