const router = require('express').Router();
const auth = require('../middleware/auth');
const { query } = require('../db');
const { sendBulk, templates } = require('../services/email');
const { sendBulkSMS } = require('../services/sms');

const APP_URL = process.env.APP_URL || 'https://syndicapp.onrender.com';

// ── GET /api/agenda ───────────────────────────────────────────────────────────
router.get('/', auth.gestionnaire, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT a.*,
         (SELECT COUNT(*) FROM agenda_executions e WHERE e.agenda_id=a.id) AS nb_executions_total,
         (SELECT created_at FROM agenda_executions e WHERE e.agenda_id=a.id ORDER BY created_at DESC LIMIT 1) AS derniere_exec
       FROM agenda_notifications a WHERE a.residence_id=$1 ORDER BY a.actif DESC, a.type_event, a.jours_offset`,
      [req.user.residence_id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── POST /api/agenda ──────────────────────────────────────────────────────────
router.post('/', auth.gestionnaire, async (req, res) => {
  const { nom, description, type_event, canal, declencheur, jours_offset, heure_envoi } = req.body;
  if (!nom || !type_event || !declencheur) return res.status(400).json({ error: 'Champs requis manquants' });
  try {
    const { rows } = await query(
      `INSERT INTO agenda_notifications (residence_id,nom,description,type_event,canal,declencheur,jours_offset,heure_envoi)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.residence_id, nom, description, type_event, canal || 'email', declencheur, jours_offset || 0, heure_envoi || '09:00']
    );
    res.status(201).json(rows[0]);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── PUT /api/agenda/:id ───────────────────────────────────────────────────────
router.put('/:id', auth.gestionnaire, async (req, res) => {
  const { nom, description, canal, jours_offset, heure_envoi, actif } = req.body;
  try {
    const { rows } = await query(
      `UPDATE agenda_notifications SET nom=$1,description=$2,canal=$3,jours_offset=$4,heure_envoi=$5,actif=$6
       WHERE id=$7 AND residence_id=$8 RETURNING *`,
      [nom, description, canal, jours_offset, heure_envoi, actif, req.params.id, req.user.residence_id]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── DELETE /api/agenda/:id ────────────────────────────────────────────────────
router.delete('/:id', auth.gestionnaire, async (req, res) => {
  try {
    await query(`DELETE FROM agenda_notifications WHERE id=$1 AND residence_id=$2`, [req.params.id, req.user.residence_id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── POST /api/agenda/:id/executer — exécution manuelle ───────────────────────
router.post('/:id/executer', auth.gestionnaire, async (req, res) => {
  try {
    const { rows: [agenda] } = await query(
      `SELECT * FROM agenda_notifications WHERE id=$1 AND residence_id=$2`,
      [req.params.id, req.user.residence_id]
    );
    if (!agenda) return res.status(404).json({ error: 'Règle agenda non trouvée' });
    const result = await executeAgendaRule(agenda, req.user.residence_id);
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/agenda/executions — historique ───────────────────────────────────
router.get('/executions', auth.gestionnaire, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT e.*,a.nom AS agenda_nom,a.type_event
       FROM agenda_executions e
       JOIN agenda_notifications a ON a.id=e.agenda_id
       WHERE a.residence_id=$1 ORDER BY e.created_at DESC LIMIT 50`,
      [req.user.residence_id]
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ── Logique d'exécution ───────────────────────────────────────────────────────
async function executeAgendaRule(agenda, residenceId) {
  let nb = 0;
  const type = agenda.type_event;
  const canal = agenda.canal;
  const jours = agenda.jours_offset;

  try {
    let residents = [];
    let emailData = {};
    let smsKey = null;

    if (type === 'appel_fonds' || type === 'rappel_paiement') {
      const operateur = agenda.declencheur === 'avant_echeance' ? '<=' : '>=';
      const direction = agenda.declencheur === 'avant_echeance' ? '-' : '+';
      const { rows } = await query(
        `SELECT p.*,u.email,u.prenom,u.nom,u.telephone,u.notif_email,u.notif_sms,
                a.periode,a.echeance,r.nom AS residence_nom
         FROM paiements p
         JOIN utilisateurs u ON u.id=p.resident_id
         JOIN appels_fonds a ON a.id=p.appel_id
         JOIN residences r ON r.id=a.residence_id
         WHERE a.residence_id=$1 AND a.statut='actif'
           AND p.statut IN ('en_attente','retard','impaye')
           AND ABS(CURRENT_DATE - a.echeance) BETWEEN ${jours-1} AND ${jours+1}`,
        [residenceId]
      );
      residents = rows;

      if (type === 'appel_fonds') {
        for (const r of residents) {
          if (!r.notif_email) continue;
          const { sendEmail, templates } = require('../services/email');
          const tpl = templates.appelFonds({
            prenom: r.prenom, nom: r.nom, periode: r.periode,
            montant: parseFloat(r.montant).toLocaleString('fr-FR'),
            echeance: new Date(r.echeance).toLocaleDateString('fr-FR'),
            residenceNom: r.residence_nom, appUrl: APP_URL,
          });
          await sendEmail({ to: r.email, ...tpl });
          nb++;
        }
        smsKey = 'appelFonds';
      } else {
        for (const r of residents) {
          if (!r.notif_email) continue;
          const { sendEmail, templates } = require('../services/email');
          const joursRetard = Math.abs(Math.round((new Date() - new Date(r.echeance)) / 86400000));
          const tpl = templates.rappelPaiement({
            prenom: r.prenom, nom: r.nom, periode: r.periode,
            montant: parseFloat(r.montant).toLocaleString('fr-FR'),
            joursRetard, echeance: new Date(r.echeance).toLocaleDateString('fr-FR'),
            appUrl: APP_URL,
          });
          await sendEmail({ to: r.email, ...tpl });
          nb++;
        }
        smsKey = 'rappelPaiement';
      }

      // SMS
      if (canal === 'sms' || canal === 'les_deux') {
        const smsTargets = residents.filter(r => r.notif_sms && r.telephone);
        await sendBulkSMS(smsTargets, smsKey, {
          periode: residents[0]?.periode || '',
          montant: residents[0] ? parseFloat(residents[0].montant).toLocaleString('fr-FR') : 0,
          echeance: residents[0] ? new Date(residents[0].echeance).toLocaleDateString('fr-FR') : '',
          joursRetard: jours,
        });
      }

    } else if (type === 'convocation_ag') {
      const { rows: ags } = await query(
        `SELECT a.*,r.nom AS residence_nom FROM assemblees_generales a
         JOIN residences r ON r.id=a.residence_id
         WHERE a.residence_id=$1 AND a.statut='planifie'
           AND ABS(DATE(a.date_ag) - CURRENT_DATE) BETWEEN ${jours-1} AND ${jours+1}`,
        [residenceId]
      );
      for (const ag of ags) {
        const { rows: res } = await query(
          `SELECT email,prenom,nom,telephone,notif_email,notif_sms
           FROM utilisateurs WHERE residence_id=$1 AND role='resident'`, [residenceId]
        );
        const { sendEmail, templates } = require('../services/email');
        const dateAG = new Date(ag.date_ag).toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});
        const heureAG = new Date(ag.date_ag).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
        for (const r of res) {
          if (!r.notif_email) continue;
          const tpl = templates.convocationAG({ prenom: r.prenom, nom: r.nom, dateAG, heureAG, lieu: ag.lieu, type: ag.type, ordreJour: ag.ordre_du_jour || [], appUrl: APP_URL });
          await sendEmail({ to: r.email, ...tpl });
          nb++;
        }
        if (canal === 'sms' || canal === 'les_deux') {
          await sendBulkSMS(res.filter(r => r.notif_sms && r.telephone), 'convocationAG', { dateAG, heureAG, lieu: ag.lieu });
        }
      }
    }

    await query(
      `UPDATE agenda_notifications SET derniere_execution=NOW(), nb_executions=nb_executions+1 WHERE id=$1`,
      [agenda.id]
    );
    await query(
      `INSERT INTO agenda_executions (agenda_id,statut,nb_envoyes) VALUES ($1,'success',$2)`,
      [agenda.id, nb]
    );
    return { success: true, nb_envoyes: nb };
  } catch(e) {
    await query(`INSERT INTO agenda_executions (agenda_id,statut,nb_envoyes,erreur) VALUES ($1,'failed',0,$2)`, [agenda.id, e.message]);
    throw e;
  }
}

module.exports = { router, executeAgendaRule };
