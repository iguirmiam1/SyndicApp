// ══════════════════════════════════════════════════════════════
// RESERVATIONS TERRAINS — Padel & Football
// Routes: /api/reservations
// ══════════════════════════════════════════════════════════════
const router = require('express').Router();
const auth   = require('../middleware/auth');
const { query } = require('../db');
const crypto = require('crypto');

// ── Notification email ──────────────────────────────────
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
} catch(e) { console.warn('[Reservations] Nodemailer not available'); }

const sendResaEmail = async (to, subject, html) => {
  if (!transporter || !to) return;
  try {
    await transporter.sendMail({
      from: `"Syndic Jasmine Park" <${process.env.SMTP_USER}>`,
      to, subject, html
    });
  } catch(e) { console.warn('[Reservations] Email failed:', e.message); }
};

// ── Auto-migration ─────────────────────────────────────────
async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS terrains (
      id           SERIAL PRIMARY KEY,
      nom          VARCHAR(100) NOT NULL,
      type         VARCHAR(20)  NOT NULL CHECK(type IN ('padel','foot')),
      capacite     INT          NOT NULL DEFAULT 4,
      description  TEXT,
      actif        BOOLEAN      DEFAULT true,
      residence_id INT,
      created_at   TIMESTAMPTZ  DEFAULT NOW()
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS reservations_terrain (
      id           SERIAL PRIMARY KEY,
      terrain_id   INT  NOT NULL REFERENCES terrains(id),
      resident_id  INT  NOT NULL REFERENCES utilisateurs(id),
      date         DATE NOT NULL,
      heure_debut  TIME NOT NULL,
      heure_fin    TIME NOT NULL,
      nb_joueurs   INT  DEFAULT 2,
      notes        TEXT,
      statut       VARCHAR(20)  DEFAULT 'confirmee'
                   CHECK(statut IN ('confirmee','annulee','validee','expiree')),
      token_qr     VARCHAR(200) UNIQUE NOT NULL,
      validee_par  INT REFERENCES utilisateurs(id),
      validee_at   TIMESTAMPTZ,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )`);

  // Insérer les 5 terrains par défaut si pas encore fait
  const { rows } = await query(`SELECT COUNT(*) FROM terrains`);
  if (parseInt(rows[0].count) === 0) {
    await query(`INSERT INTO terrains (nom, type, capacite, description) VALUES
      ('Padel 1', 'padel', 4, 'Terrain couvert – éclairage LED'),
      ('Padel 2', 'padel', 4, 'Terrain couvert – éclairage LED'),
      ('Padel 3', 'padel', 4, 'Terrain extérieur'),
      ('Football 1', 'foot', 14, 'Terrain synthétique 5v5'),
      ('Football 2', 'foot', 14, 'Terrain synthétique 5v5')
    `);
    console.log('[Reservations] 5 terrains créés');
  }
}
migrate().catch(console.error);

// ── GET /terrains ─────────────────────────────────────────
router.get('/terrains', auth, async (req, res) => {
  const { rows } = await query(`SELECT * FROM terrains WHERE actif=true ORDER BY type,nom`);
  res.json(rows);
});

// ── GET /disponibilites?terrain_id=&date= ─────────────────
router.get('/disponibilites', auth, async (req, res) => {
  const { terrain_id, date } = req.query;
  if (!terrain_id || !date) return res.status(400).json({ error: 'terrain_id et date requis' });
  const { rows } = await query(
    `SELECT heure_debut, heure_fin, statut
     FROM reservations_terrain
     WHERE terrain_id=$1 AND date=$2 AND statut != 'annulee'
     ORDER BY heure_debut`,
    [terrain_id, date]
  );
  res.json(rows);
});

// ── GET /mes ─────────────────────────────────────────────
router.get('/mes', auth, async (req, res) => {
  const { rows } = await query(
    `SELECT r.*, t.nom as terrain_nom, t.type as terrain_type,
            u.prenom, u.nom as nom_resident
     FROM reservations_terrain r
     JOIN terrains t ON t.id = r.terrain_id
     JOIN utilisateurs u ON u.id = r.resident_id
     WHERE r.resident_id = $1
     ORDER BY r.date DESC, r.heure_debut DESC
     LIMIT 20`,
    [req.user.id]
  );
  res.json(rows);
});

// ── GET / (toutes — gestionnaire/admin) ──────────────────
router.get('/', auth, async (req, res) => {
  if (!['gestionnaire','admin'].includes(req.user.role))
    return res.status(403).json({ error: 'Accès refusé' });
  const { date, terrain_id } = req.query;
  let sql = `SELECT r.*, t.nom as terrain_nom, t.type as terrain_type,
              u.prenom, u.nom as nom_resident, u.lot, u.telephone
             FROM reservations_terrain r
             JOIN terrains t ON t.id = r.terrain_id
             JOIN utilisateurs u ON u.id = r.resident_id
             WHERE 1=1`;
  const params = [];
  if (date)       { params.push(date);       sql += ` AND r.date=$${params.length}`; }
  if (terrain_id) { params.push(terrain_id); sql += ` AND r.terrain_id=$${params.length}`; }
  sql += ' ORDER BY r.date DESC, r.heure_debut DESC LIMIT 100';
  const { rows } = await query(sql, params);
  res.json(rows);
});

// ── GET /today (sécurité entrée) ─────────────────────────
router.get('/today', auth, async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const { rows } = await query(
    `SELECT r.*, t.nom as terrain_nom, t.type as terrain_type,
            u.prenom, u.nom as nom_resident, u.lot, u.telephone
     FROM reservations_terrain r
     JOIN terrains t ON t.id = r.terrain_id
     JOIN utilisateurs u ON u.id = r.resident_id
     WHERE r.date=$1 AND r.statut != 'annulee'
     ORDER BY r.heure_debut`,
    [today]
  );
  res.json(rows);
});

// ── POST / (créer réservation) ────────────────────────────
router.post('/', auth, async (req, res) => {
  const { terrain_id, date, heure_debut, heure_fin, nb_joueurs=2, notes='' } = req.body;
  if (!terrain_id || !date || !heure_debut || !heure_fin)
    return res.status(400).json({ error: 'Champs obligatoires manquants' });

  // Vérifier disponibilité
  const { rows: conflicts } = await query(
    `SELECT id FROM reservations_terrain
     WHERE terrain_id=$1 AND date=$2 AND statut!='annulee'
       AND NOT (heure_fin <= $3 OR heure_debut >= $4)`,
    [terrain_id, date, heure_debut, heure_fin]
  );
  if (conflicts.length > 0)
    return res.status(409).json({ error: 'Ce créneau est déjà réservé' });

  // Générer token QR unique et sécurisé
  const token = crypto.randomBytes(32).toString('hex');

  const { rows } = await query(
    `INSERT INTO reservations_terrain
       (terrain_id, resident_id, date, heure_debut, heure_fin, nb_joueurs, notes, token_qr)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [terrain_id, req.user.id, date, heure_debut, heure_fin, nb_joueurs, notes, token]
  );
  const reservation = rows[0];

  // Récupérer infos terrain + résident
  const { rows: terrain } = await query(`SELECT * FROM terrains WHERE id=$1`, [terrain_id]);
  const dateLabel = new Date(date).toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });

  const emailHtml = `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
      <div style="background:#0d5c47;color:#fff;padding:1.5rem;border-radius:10px 10px 0 0;text-align:center">
        <h2 style="margin:0">🏟️ Réservation Confirmée</h2>
        <p style="margin:.5rem 0 0;opacity:.85">Résidence Jasmine Park</p>
      </div>
      <div style="padding:1.5rem;border:1px solid #e2e0d8;border-top:none;border-radius:0 0 10px 10px">
        <p>Bonjour <strong>${req.user.prenom}</strong>,</p>
        <p>Votre réservation est confirmée :</p>
        <div style="background:#f5f4ee;border-radius:8px;padding:1rem;margin:1rem 0">
          <div>🏟️ <strong>${terrain[0]?.nom}</strong></div>
          <div>📅 <strong>${dateLabel}</strong></div>
          <div>⏰ <strong>${heure_debut.slice(0,5)} – ${heure_fin.slice(0,5)}</strong></div>
          <div>👥 ${nb_joueurs} joueur(s)</div>
        </div>
        <p style="font-size:.85rem;color:#666">Présentez votre QR Code à l'entrée du terrain.</p>
      </div>
    </div>`;
  sendResaEmail(req.user.email, `✅ Réservation ${terrain[0]?.nom} – ${dateLabel}`, emailHtml);

  res.json({
    ...reservation,
    terrain_nom: terrain[0]?.nom,
    terrain_type: terrain[0]?.type,
    prenom: req.user.prenom,
    nom_resident: req.user.nom,
    lot: req.user.lot,
    dateLabel,
    qr_data: JSON.stringify({
      token,
      reservation_id: reservation.id,
      terrain: terrain[0]?.nom,
      date: dateLabel,
      heure: `${heure_debut.slice(0,5)} – ${heure_fin.slice(0,5)}`,
      resident: `${req.user.prenom} ${req.user.nom}`,
      lot: req.user.lot
    })
  });
});

// ── POST /valider (sécurité scanne QR) ───────────────────
router.post('/valider', auth, async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token requis' });

  const { rows } = await query(
    `SELECT r.*, t.nom as terrain_nom, t.type as terrain_type,
            u.prenom, u.nom as nom_resident, u.lot, u.telephone
     FROM reservations_terrain r
     JOIN terrains t ON t.id = r.terrain_id
     JOIN utilisateurs u ON u.id = r.resident_id
     WHERE r.token_qr = $1`,
    [token]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'QR Code invalide ou introuvable' });

  const resa = rows[0];
  const today = new Date().toISOString().split('T')[0];

  if (resa.statut === 'annulee')  return res.status(400).json({ error: 'Réservation annulée', reservation: resa });
  if (resa.statut === 'validee')  return res.status(400).json({ error: 'QR déjà utilisé', reservation: resa });
  if (resa.date.toISOString?.().split('T')[0] !== today && String(resa.date).split('T')[0] !== today)
    return res.status(400).json({ error: `Réservation prévue le ${resa.date} — pas aujourd'hui`, reservation: resa });

  await query(
    `UPDATE reservations_terrain SET statut='validee', validee_par=$1, validee_at=NOW() WHERE id=$2`,
    [req.user.id, resa.id]
  );

  res.json({ success: true, message: '✅ Accès autorisé', reservation: { ...resa, statut: 'validee' } });
});

// ── PUT /:id/annuler ──────────────────────────────────────
router.put('/:id/annuler', auth, async (req, res) => {
  const { rows } = await query(
    `UPDATE reservations_terrain SET statut='annulee'
     WHERE id=$1 AND (resident_id=$2 OR $3 IN ('gestionnaire','admin'))
     RETURNING *`,
    [req.params.id, req.user.id, req.user.role]
  );
  if (!rows.length) return res.status(404).json({ error: 'Réservation introuvable' });
  // Email annulation
  try {
    const resa = rows[0];
    const { rows: [u] } = await query(`SELECT email, prenom FROM utilisateurs WHERE id=$1`, [resa.resident_id]);
    if (u?.email) {
      sendResaEmail(u.email,
        '❌ Réservation annulée – Jasmine Park',
        `<p>Bonjour ${u.prenom},</p><p>Votre réservation du <strong>${resa.date}</strong> (${String(resa.heure_debut).slice(0,5)} – ${String(resa.heure_fin).slice(0,5)}) a été annulée.</p>`
      );
    }
  } catch(e) {}
  res.json(rows[0]);
});

module.exports = router;
