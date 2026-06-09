// ══════════════════════════════════════════════════════════════
// QR CODES VISITEURS — Génération & Validation
// Routes: /api/qrcodes
// ══════════════════════════════════════════════════════════════
const router = require('express').Router();
const auth   = require('../middleware/auth');
const { query } = require('../db');
const crypto = require('crypto');

// ── Email ─────────────────────────────────────────────────────
let transporter = null;
try {
  const nodemailer = require('nodemailer');
  if (process.env.SMTP_USER) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
} catch(e) {}
const sendMail = async (to, subject, html) => {
  if (!transporter || !to) return;
  try { await transporter.sendMail({ from: `"Syndic Jasmine Park" <${process.env.SMTP_USER}>`, to, subject, html }); }
  catch(e) { console.warn('[QR] Mail failed:', e.message); }
};

// ── Auto-migration ────────────────────────────────────────────
(async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS qr_visiteurs (
        id           SERIAL PRIMARY KEY,
        resident_id  INT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
        token        VARCHAR(200) UNIQUE NOT NULL,
        visiteur_nom VARCHAR(200),
        motif        VARCHAR(100) DEFAULT 'visite',
        valide_du    TIMESTAMPTZ NOT NULL,
        valide_au    TIMESTAMPTZ NOT NULL,
        statut       VARCHAR(20) DEFAULT 'actif'
                     CHECK(statut IN ('actif','utilise','expire','annule')),
        validee_par  INT REFERENCES utilisateurs(id),
        validee_at   TIMESTAMPTZ,
        nb_usages    INT DEFAULT 0,
        max_usages   INT DEFAULT 1,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      )`);

    // Ajouter rôle sécurité si pas dans la contrainte
    await query(`
      ALTER TABLE utilisateurs DROP CONSTRAINT IF EXISTS utilisateurs_role_check
    `).catch(()=>{});
    await query(`
      ALTER TABLE utilisateurs ADD CONSTRAINT utilisateurs_role_check
      CHECK(role IN ('admin','gestionnaire','resident','securite'))
    `).catch(()=>{});

    console.log('[QRCodes] Tables OK');
  } catch(e) { console.warn('[QRCodes] Migration:', e.message); }
})();

// ── Middleware : autoriser residents ET securite ───────────────
const authResident = (req, res, next) => {
  if (!['admin','gestionnaire','resident','securite'].includes(req.user?.role))
    return res.status(403).json({ error: 'Accès refusé' });
  next();
};

// ── GET /today — QR actifs du jour (sécurité + gestionnaire) ──
router.get('/today', auth, async (req, res) => {
  if (!['gestionnaire','admin','securite'].includes(req.user.role))
    return res.status(403).json({ error: 'Accès refusé' });
  const now = new Date();
  const { rows } = await query(
    `SELECT q.*, u.prenom, u.nom, u.lot, u.telephone
     FROM qr_visiteurs q
     JOIN utilisateurs u ON u.id = q.resident_id
     WHERE q.statut = 'actif'
       AND q.valide_du <= NOW()
       AND q.valide_au >= NOW()
     ORDER BY q.valide_du`
  );
  res.json(rows);
});

// ── GET /mes — QR codes du résident connecté ──────────────────
router.get('/mes', auth, async (req, res) => {
  const { rows } = await query(
    `SELECT q.*, u.prenom, u.nom, u.lot
     FROM qr_visiteurs q
     JOIN utilisateurs u ON u.id = q.resident_id
     WHERE q.resident_id = $1
     ORDER BY q.created_at DESC LIMIT 20`,
    [req.user.id]
  );
  res.json(rows);
});

// ── GET / — Tous les QR (gestionnaire/admin) ──────────────────
router.get('/', auth, async (req, res) => {
  if (!['gestionnaire','admin'].includes(req.user.role))
    return res.status(403).json({ error: 'Accès refusé' });
  const { rows } = await query(
    `SELECT q.*, u.prenom, u.nom, u.lot
     FROM qr_visiteurs q
     JOIN utilisateurs u ON u.id = q.resident_id
     ORDER BY q.created_at DESC LIMIT 50`
  );
  res.json(rows);
});

// ── POST / — Générer un QR code ───────────────────────────────
router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'resident' && req.user.role !== 'admin' && req.user.role !== 'gestionnaire')
    return res.status(403).json({ error: 'Réservé aux résidents' });

  const {
    visiteur_nom = 'Visiteur',
    motif = 'visite',
    valide_du,
    valide_au,
    max_usages = 1
  } = req.body;

  if (!valide_du || !valide_au)
    return res.status(400).json({ error: 'Dates de validité requises' });

  const token = crypto.randomBytes(24).toString('hex');

  // Récupérer infos résident
  const { rows: [u] } = await query(
    `SELECT prenom, nom, lot FROM utilisateurs WHERE id=$1`, [req.user.id]
  );

  const { rows: [qr] } = await query(
    `INSERT INTO qr_visiteurs
       (resident_id, token, visiteur_nom, motif, valide_du, valide_au, max_usages)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.user.id, token, visiteur_nom, motif, valide_du, valide_au, max_usages]
  );

  const valide_du_label = new Date(valide_du).toLocaleDateString('fr-FR',
    { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  const valide_au_label = new Date(valide_au).toLocaleDateString('fr-FR',
    { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

  // Email de confirmation au résident
  const tokenFormatted = token.toUpperCase().match(/.{1,6}/g)?.join('-') || token.toUpperCase();
  const debutLabel = new Date(valide_du).toLocaleString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  const finLabel = new Date(valide_au).toLocaleString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  sendMail(u.email,
    `🔐 QR Code visiteur généré — ${visiteur_nom}`,
    `<div style="font-family:Arial,sans-serif;max-width:500px">
      <div style="background:#7c3aed;color:#fff;padding:1.25rem;border-radius:10px 10px 0 0;text-align:center">
        <h2 style="margin:0">🔐 QR Code d'accès visiteur</h2>
        <p style="margin:.4rem 0 0;opacity:.85">Résidence Jasmine Park</p>
      </div>
      <div style="padding:1.25rem;border:1px solid #e2e0d8;border-top:none;border-radius:0 0 10px 10px">
        <p>Bonjour <strong>${u.prenom}</strong>,</p>
        <p>Un code d'accès a été généré pour :</p>
        <div style="background:#f3e8ff;border-radius:8px;padding:1rem;margin:1rem 0">
          <div>👤 Visiteur : <strong>${visiteur_nom}</strong></div>
          <div>📋 Motif : ${motif}</div>
          <div>📅 Valide du ${debutLabel} au ${finLabel}</div>
        </div>
        <div style="background:#0a3d2e;color:#fff;padding:1rem;border-radius:8px;text-align:center;font-family:monospace;font-size:1.1rem;letter-spacing:.08em;margin:1rem 0">
          🔑 <strong>${tokenFormatted}</strong>
        </div>
        <p style="font-size:.85rem;color:#666">Partagez ce code avec votre visiteur. La sécurité le demandera à l'entrée.</p>
      </div>
    </div>`
  );

  res.json({
    ...qr,
    prenom: u.prenom, nom: u.nom, lot: u.lot,
    qr_data: JSON.stringify({
      token,
      type: 'visiteur',
      resident: `${u.prenom} ${u.nom}`,
      lot: u.lot,
      visiteur: visiteur_nom,
      motif,
      valide_du: valide_du_label,
      valide_au: valide_au_label,
      residence: 'Jasmine Park'
    })
  });
});

// ── POST /valider — Sécurité valide un QR ─────────────────────
router.post('/valider', auth, async (req, res) => {
  let { token } = req.body;
  if (!token) return res.status(400).json({ valid: false, error: 'Token requis' });
  // Normaliser : supprimer tirets/espaces, mettre en minuscules
  const tokenNorm = token.replace(/[-\s]/g, '').toLowerCase();

  const { rows } = await query(
    `SELECT q.*, u.prenom, u.nom, u.lot, u.telephone, u.email as resident_email
     FROM qr_visiteurs q
     JOIN utilisateurs u ON u.id = q.resident_id
     WHERE LOWER(REPLACE(q.token, '-', '')) = $1`,
    [tokenNorm]
  );

  if (!rows.length)
    return res.status(404).json({ valid: false, error: 'QR Code introuvable ou invalide' });

  const qr = rows[0];
  const now = new Date();

  if (qr.statut === 'annule')
    return res.status(400).json({ valid: false, error: 'QR Code annulé par le résident', qr });
  if (qr.nb_usages >= qr.max_usages)
    return res.status(400).json({ valid: false, error: 'QR Code déjà utilisé', qr });
  if (now < new Date(qr.valide_du))
    return res.status(400).json({ valid: false, error: `QR Code valide à partir du ${new Date(qr.valide_du).toLocaleDateString('fr-FR')}`, qr });
  if (now > new Date(qr.valide_au))
    return res.status(400).json({ valid: false, error: 'QR Code expiré', qr });

  // Valider
  await query(
    `UPDATE qr_visiteurs SET nb_usages=nb_usages+1, validee_par=$1, validee_at=NOW(),
     statut=CASE WHEN nb_usages+1>=max_usages THEN 'utilise' ELSE 'actif' END
     WHERE id=$2`,
    [req.user.id, qr.id]
  );

  res.json({
    valid: true,
    message: 'Accès autorisé',
    qr: { ...qr, nb_usages: qr.nb_usages + 1 }
  });
});

// ── DELETE /:id — Annuler un QR ───────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  await query(
    `UPDATE qr_visiteurs SET statut='annule'
     WHERE id=$1 AND (resident_id=$2 OR $3 IN ('gestionnaire','admin'))`,
    [req.params.id, req.user.id, req.user.role]
  );
  res.json({ success: true });
});

module.exports = router;
