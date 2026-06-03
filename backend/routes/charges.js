const router = require('express').Router();
const auth = require('../middleware/auth');
const { query } = require('../db');

// Chargement sécurisé email/whatsapp
let sendEmail = async () => {};
let templates = {};
try { ({ sendEmail, templates } = require('../services/email')); } catch(e) {}

const APP_URL = process.env.APP_URL || 'https://syndicapp.onrender.com';

// ── GET /api/charges ──────────────────────────────────────────────────────────
router.get('/', auth.gestionnaire, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT a.*,
         COUNT(p.id) AS nb_paiements,
         SUM(CASE WHEN p.statut='paye' THEN p.montant ELSE 0 END) AS total_encaisse,
         SUM(CASE WHEN p.statut='declare' THEN 1 ELSE 0 END) AS nb_declares
       FROM appels_fonds a LEFT JOIN paiements p ON p.appel_id=a.id
       WHERE a.residence_id=$1 GROUP BY a.id ORDER BY a.created_at DESC`,
      [req.user.residence_id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── POST /api/charges ─────────────────────────────────────────────────────────
router.post('/', auth.gestionnaire, async (req, res) => {
  const { periode, montant_base, echeance, description } = req.body;
  if (!periode || !montant_base || !echeance)
    return res.status(400).json({ error: 'Champs requis manquants' });
  try {
    const { rows: [af] } = await query(
      `INSERT INTO appels_fonds (residence_id,periode,montant_base,echeance,description,statut)
       VALUES ($1,$2,$3,$4,$5,'actif') RETURNING *`,
      [req.user.residence_id, periode, parseFloat(montant_base), echeance, description || '']
    );
    const { rows: residents } = await query(
      `SELECT id,tantiemes FROM utilisateurs WHERE residence_id=$1 AND role='resident'`,
      [req.user.residence_id]
    );
    for (const r of residents) {
      const montant = parseFloat(montant_base) * (r.tantiemes || 0) / 1000 || parseFloat(montant_base);
      await query(
        `INSERT INTO paiements (appel_id,resident_id,montant,statut) VALUES ($1,$2,$3,'en_attente')
         ON CONFLICT DO NOTHING`,
        [af.id, r.id, montant]
      );
    }
    res.status(201).json(af);
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── GET /api/charges/resident/moi ─────────────────────────────────────────────
router.get('/resident/moi', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*,a.periode,a.echeance,a.description,a.statut AS statut_appel
       FROM paiements p JOIN appels_fonds a ON a.id=p.appel_id
       WHERE p.resident_id=$1 ORDER BY a.echeance DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── GET /api/charges/:id/paiements ────────────────────────────────────────────
router.get('/:id/paiements', auth.gestionnaire, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*,u.prenom,u.nom,u.lot,u.tantiemes,u.email
       FROM paiements p JOIN utilisateurs u ON u.id=p.resident_id
       WHERE p.appel_id=$1 ORDER BY p.statut,u.nom`,
      [req.params.id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── GET /api/charges/declarations — déclarations en attente de validation ─────
router.get('/declarations/pending', auth.gestionnaire, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*,u.prenom,u.nom,u.lot,u.email,u.telephone,
              a.periode,a.echeance,a.residence_id
       FROM paiements p
       JOIN utilisateurs u ON u.id=p.resident_id
       JOIN appels_fonds a ON a.id=p.appel_id
       WHERE a.residence_id=$1 AND p.statut='declare'
       ORDER BY p.updated_at DESC`,
      [req.user.residence_id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── POST /api/charges/paiements/:id/payer — résident déclare un paiement ──────
router.post('/paiements/:id/payer', auth, async (req, res) => {
  const { mode, date_paiement, reference } = req.body;
  try {
    const { rows: [p] } = await query(`SELECT * FROM paiements WHERE id=$1`, [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Paiement non trouvé' });
    if (req.user.role === 'resident' && p.resident_id !== req.user.id)
      return res.status(403).json({ error: 'Accès refusé' });

    // Statut → 'declare' (en attente validation syndic)
    const { rows: [updated] } = await query(
      `UPDATE paiements SET
         statut='declare', mode=$1, date_paiement=$2, reference=$3, updated_at=NOW()
       WHERE id=$4 RETURNING *`,
      [mode || 'virement', date_paiement || new Date().toISOString().split('T')[0],
       reference || null, req.params.id]
    );

    // Notifier le gestionnaire
    try {
      const { rows: [gestionnaire] } = await query(
        `SELECT email,prenom,nom FROM utilisateurs
         WHERE residence_id=$1 AND role='gestionnaire' LIMIT 1`,
        [req.user.residence_id]
      );
      const { rows: [appel] } = await query(
        `SELECT periode FROM appels_fonds WHERE id=$1`, [p.appel_id]
      );
      if (gestionnaire?.email && templates.generique) {
        await sendEmail({
          to: gestionnaire.email,
          subject: `💳 Paiement déclaré — ${req.user.prenom} ${req.user.nom} (Lot ${req.user.lot||'?'})`,
          html: templates.generique({
            titre: 'Nouveau paiement à valider',
            corps: `<strong>${req.user.prenom} ${req.user.nom}</strong> (Lot ${req.user.lot||'?'}) a déclaré un paiement de <strong>${parseFloat(p.montant).toLocaleString('fr-FR')} MAD</strong> pour la période <strong>${appel?.periode||''}</strong>.<br><br>Mode : ${mode||'virement'} · Date : ${date_paiement||'aujourd\'hui'} · Réf : ${reference||'—'}`,
            action: { label: 'Valider le paiement', url: APP_URL },
          }),
        });
      }
    } catch(e) { console.warn('Notif gestionnaire:', e.message); }

    res.json(updated);
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── POST /api/charges/paiements/:id/valider — syndic valide ──────────────────
router.post('/paiements/:id/valider', auth.gestionnaire, async (req, res) => {
  const { commentaire } = req.body;
  try {
    const { rows: [p] } = await query(`SELECT * FROM paiements WHERE id=$1`, [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Non trouvé' });

    const { rows: [updated] } = await query(
      `UPDATE paiements SET statut='paye', commentaire_syndic=$1, updated_at=NOW()
       WHERE id=$2 RETURNING *`,
      [commentaire || null, req.params.id]
    );

    // Notifier le résident
    try {
      const { rows: [resident] } = await query(
        `SELECT u.email,u.prenom,u.nom,a.periode
         FROM utilisateurs u, appels_fonds a
         WHERE u.id=$1 AND a.id=$2`, [p.resident_id, p.appel_id]
      );
      if (resident?.email) {
        const tpl = templates.confirmationPaiement?.({
          prenom: resident.prenom, nom: resident.nom,
          periode: resident.periode,
          montant: parseFloat(p.montant).toLocaleString('fr-FR'),
          reference: p.reference, appUrl: APP_URL,
        });
        if (tpl) await sendEmail({ to: resident.email, ...tpl });
      }
    } catch(e) { console.warn('Notif résident validation:', e.message); }

    res.json(updated);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── POST /api/charges/paiements/:id/rejeter — syndic rejette ─────────────────
router.post('/paiements/:id/rejeter', auth.gestionnaire, async (req, res) => {
  const { motif } = req.body;
  try {
    const { rows: [p] } = await query(`SELECT * FROM paiements WHERE id=$1`, [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Non trouvé' });

    const { rows: [updated] } = await query(
      `UPDATE paiements SET statut='en_attente', commentaire_syndic=$1, updated_at=NOW()
       WHERE id=$2 RETURNING *`,
      [motif ? `❌ Rejeté : ${motif}` : '❌ Déclaration rejetée', req.params.id]
    );

    // Notifier le résident du rejet
    try {
      const { rows: [resident] } = await query(
        `SELECT u.email,u.prenom,u.nom,a.periode
         FROM utilisateurs u, appels_fonds a
         WHERE u.id=$1 AND a.id=$2`, [p.resident_id, p.appel_id]
      );
      if (resident?.email && templates.generique) {
        await sendEmail({
          to: resident.email,
          subject: `⚠️ Déclaration de paiement non confirmée — ${resident.periode}`,
          html: templates.generique({
            titre: 'Déclaration de paiement non confirmée',
            corps: `Bonjour <strong>${resident.prenom}</strong>,<br><br>Votre déclaration de paiement pour <strong>${resident.periode}</strong> n'a pas pu être confirmée.<br><br><strong>Motif :</strong> ${motif||'Veuillez contacter le syndic pour plus d\'informations.'}<br><br>Merci de soumettre à nouveau votre justificatif de paiement.`,
            action: { label: 'Déclarer à nouveau', url: APP_URL + '/finances' },
          }),
        });
      }
    } catch(e) { console.warn('Notif rejet:', e.message); }

    res.json(updated);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── PUT /api/charges/paiements/:id — modifier statut (gestionnaire) ───────────
router.put('/paiements/:id', auth.gestionnaire, async (req, res) => {
  const { statut, mode, date_paiement, reference, commentaire_syndic } = req.body;
  try {
    const { rows } = await query(
      `UPDATE paiements SET statut=$1,mode=$2,date_paiement=$3,reference=$4,
         commentaire_syndic=$5,updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [statut, mode||null, date_paiement||null, reference||null, commentaire_syndic||null, req.params.id]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
