const router = require('express').Router();
const auth = require('../middleware/auth');
const { query } = require('../db');
const { upload, getFileUrl } = require('../services/upload');
const { sendBulk, templates } = require('../services/email');

const APP_URL = process.env.APP_URL || 'https://syndicapp.onrender.com';

// GET /api/documents
router.get('/', auth, async (req, res) => {
  const { categorie } = req.query;
  let sql = `SELECT d.*,u.prenom||' '||u.nom AS uploaded_by_nom
             FROM documents d LEFT JOIN utilisateurs u ON u.id=d.uploaded_by
             WHERE d.residence_id=$1`;
  const params = [req.user.residence_id];
  if (categorie) { sql += ` AND d.categorie=$2`; params.push(categorie); }
  sql += ' ORDER BY d.created_at DESC';
  try {
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/documents — avec upload fichier
router.post('/', auth.gestionnaire, upload.single('fichier'), async (req, res) => {
  const { nom, categorie, notifier_residents } = req.body;
  try {
    let url = null;
    let taille_ko = null;

    if (req.file) {
      url = getFileUrl(req.file);
      taille_ko = Math.round((req.file.size || 0) / 1024);
    }

    const { rows } = await query(
      `INSERT INTO documents (residence_id,nom,categorie,url,taille_ko,uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.residence_id, nom, categorie, url, taille_ko, req.user.id]
    );

    // Notifier les résidents si demandé
    if (notifier_residents === 'true' || notifier_residents === true) {
      const { rows: residents } = await query(
        `SELECT email,prenom,nom FROM utilisateurs
         WHERE residence_id=$1 AND role='resident' AND notif_email=true`,
        [req.user.residence_id]
      );
      if (residents.length) {
        sendBulk(residents, (data) => templates.nouveauDocument({
          ...data, nomDoc: nom, categorie, appUrl: APP_URL
        }), {}, APP_URL).catch(console.error);
      }
    }

    res.status(201).json(rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

// DELETE /api/documents/:id
router.delete('/:id', auth.gestionnaire, async (req, res) => {
  try {
    const { rows: [doc] } = await query(
      `SELECT url FROM documents WHERE id=$1 AND residence_id=$2`,
      [req.params.id, req.user.residence_id]
    );
    if (doc?.url && doc.url.includes('cloudinary')) {
      const { cloudinary } = require('../services/upload');
      const publicId = doc.url.split('/').pop().split('.')[0];
      cloudinary.uploader.destroy(publicId).catch(() => {});
    }
    await query(`DELETE FROM documents WHERE id=$1 AND residence_id=$2`, [req.params.id, req.user.residence_id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
