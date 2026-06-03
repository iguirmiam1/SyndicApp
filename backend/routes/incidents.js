const router = require('express').Router();
const auth = require('../middleware/auth');
const { query } = require('../db');

let sendEmail = async () => {};
let sendWhatsApp = async () => {};
let templates = {};
try { ({ sendEmail, templates } = require('../services/email')); } catch(e) {}
try { ({ sendWhatsApp } = require('../services/whatsapp')); } catch(e) {}

const APP_URL = process.env.APP_URL || 'https://syndicapp.onrender.com';

// ── GET /api/incidents ────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    let sql, params;
    if (req.user.role === 'resident') {
      sql = `SELECT i.*,u.prenom,u.nom,u.lot FROM incidents i
             JOIN utilisateurs u ON u.id=i.resident_id
             WHERE i.resident_id=$1 ORDER BY i.created_at DESC`;
      params = [req.user.id];
    } else {
      sql = `SELECT i.*,u.prenom,u.nom,u.lot FROM incidents i
             JOIN utilisateurs u ON u.id=i.resident_id
             WHERE i.residence_id=$1 ORDER BY i.created_at DESC`;
      params = [req.user.residence_id];
    }
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── POST /api/incidents ───────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  const { type, localisation, description, urgence, prestataire, cout, statut } = req.body;
  if (!type) return res.status(400).json({ error: 'Type requis' });
  try {
    const { rows } = await query(
      `INSERT INTO incidents
         (residence_id,resident_id,type,localisation,description,urgence,prestataire,cout,statut)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.residence_id, req.user.id, type,
       localisation||'', description||'', urgence||'normal',
       prestataire||null, cout?parseFloat(cout):null, statut||'ouvert']
    );

    // Notifier le gestionnaire du nouveau signalement (email)
    try {
      const { rows: [gest] } = await query(
        `SELECT email,prenom FROM utilisateurs
         WHERE residence_id=$1 AND role='gestionnaire' LIMIT 1`,
        [req.user.residence_id]
      );
      if (gest?.email && templates.generique) {
        const urgIcons = { normal:'🟡', urgent:'🟠', tres_urgent:'🔴' };
        await sendEmail({
          to: gest.email,
          subject: `${urgIcons[urgence||'normal']} Nouvelle réclamation — ${type} (Lot ${req.user.lot||'?'})`,
          html: templates.generique({
            titre: 'Nouvelle réclamation signalée',
            corps: `<strong>${req.user.prenom} ${req.user.nom}</strong> (Lot ${req.user.lot||'?'}) a signalé :<br><br>
              <strong>Type :</strong> ${type}<br>
              <strong>Localisation :</strong> ${localisation||'—'}<br>
              <strong>Urgence :</strong> ${urgence||'normal'}<br>
              <strong>Description :</strong> ${description||'—'}`,
            action: { label: 'Voir les réclamations', url: APP_URL },
          }),
        });
      }
    } catch(e) { console.warn('Notif gestionnaire incident:', e.message); }

    res.status(201).json(rows[0]);
  } catch(e) { res.status(500).json({ error: 'Erreur: ' + e.message }); }
});

// ── PUT /api/incidents/:id ────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  const { type, localisation, description, urgence, prestataire,
          cout, statut, date_resolution, commentaire_syndic } = req.body;
  try {
    const { rows: [ancien] } = await query(`SELECT * FROM incidents WHERE id=$1`, [req.params.id]);
    if (!ancien) return res.status(404).json({ error: 'Non trouvé' });
    if (req.user.role === 'resident' && ancien.resident_id !== req.user.id)
      return res.status(403).json({ error: 'Accès refusé' });

    const ancienStatut = ancien.statut;
    const nouveauStatut = statut || ancienStatut;
    const statutChange = ancienStatut !== nouveauStatut;
    const commentaireChange = commentaire_syndic && commentaire_syndic !== ancien.commentaire_syndic;

    const { rows } = await query(
      `UPDATE incidents SET
         type=COALESCE($1,type),
         localisation=COALESCE($2,localisation),
         description=COALESCE($3,description),
         urgence=COALESCE($4,urgence),
         prestataire=$5,
         cout=$6,
         statut=COALESCE($7,statut),
         date_resolution=$8,
         commentaire_syndic=$9,
         updated_at=NOW()
       WHERE id=$10 RETURNING *`,
      [type, localisation, description, urgence,
       prestataire!==undefined?(prestataire||null):ancien.prestataire,
       cout!==undefined?(cout?parseFloat(cout):null):ancien.cout,
       statut,
       date_resolution||(statut==='resolu'?new Date().toISOString().split('T')[0]:ancien.date_resolution),
       commentaire_syndic!==undefined?(commentaire_syndic||null):ancien.commentaire_syndic,
       req.params.id]
    );
    const updated = rows[0];

    // ── Notifier le résident si statut ou commentaire changé ──────────────────
    if ((statutChange || commentaireChange) && (req.user.role === 'gestionnaire' || req.user.role === 'admin')) {
      try {
        const { rows: [resident] } = await query(
          `SELECT u.email,u.prenom,u.nom,u.telephone,u.notif_email,u.notif_sms
           FROM utilisateurs u WHERE u.id=$1`, [ancien.resident_id]
        );

        if (resident) {
          const statutLabels = {
            ouvert:'🔵 Ouvert', en_cours:'🟠 En cours de traitement',
            resolu:'✅ Résolu', ferme:'⛔ Fermé'
          };
          const statutLabel = statutLabels[nouveauStatut] || nouveauStatut;

          // Email
          if (resident.notif_email && resident.email && templates.generique) {
            let corps = `Bonjour <strong>${resident.prenom}</strong>,<br><br>
              Votre réclamation concernant <strong>${updated.type}</strong>${updated.localisation?' ('+updated.localisation+')':''} a été mise à jour.<br><br>`;

            if (statutChange) corps += `<strong>Nouveau statut :</strong> ${statutLabel}<br>`;
            if (commentaireChange) corps += `<br><strong>Commentaire du syndic :</strong><br>
              <div style="background:#f5f5f5;border-left:4px solid #0d5c47;padding:10px;margin:8px 0;border-radius:0 8px 8px 0">${commentaire_syndic}</div>`;
            if (updated.prestataire && statutChange) corps += `<br><strong>Prestataire :</strong> ${updated.prestataire}`;
            if (updated.date_resolution && nouveauStatut === 'resolu')
              corps += `<br><strong>Date de résolution :</strong> ${new Date(updated.date_resolution).toLocaleDateString('fr-FR')}`;

            await sendEmail({
              to: resident.email,
              subject: `📋 Réclamation mise à jour — ${updated.type} → ${statutLabel}`,
              html: templates.generique({
                titre: 'Mise à jour de votre réclamation',
                corps,
                action: { label: 'Voir mes réclamations', url: APP_URL + '/#r-incidents' },
              }),
            });
          }

          // WhatsApp
          if (resident.notif_sms && resident.telephone) {
            const msg = `📋 *SyndicPro — Réclamation mise à jour*\n\nBonjour *${resident.prenom}*,\n\nVotre réclamation *${updated.type}* est maintenant : *${statutLabel}*${commentaireChange?'\n\n💬 '+commentaire_syndic:''}\n\nConnectez-vous pour voir le détail.`;
            await sendWhatsApp({ to: resident.telephone, message: msg });
          }
        }
      } catch(e) { console.warn('Notif incident update:', e.message); }
    }

    res.json(updated);
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── DELETE /api/incidents/:id ─────────────────────────────────────────────────
router.delete('/:id', auth.gestionnaire, async (req, res) => {
  try {
    await query(`DELETE FROM incidents WHERE id=$1 AND residence_id=$2`,
      [req.params.id, req.user.residence_id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
