const router = require('express').Router();
const auth = require('../middleware/auth');
const { query } = require('../db');

// GET /api/settings/residence
router.get('/residence', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT r.*,p.relance_auto,p.relance_delai_jours,p.appel_fonds_auto,
              p.notif_sms_residents,p.rapport_hebdo,p.archivage_auto_pv
       FROM residences r LEFT JOIN parametres p ON p.residence_id=r.id
       WHERE r.id=$1`, [req.user.residence_id]
    );
    res.json(rows[0] || {});
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// PUT /api/settings/residence
router.put('/residence', auth.gestionnaire, async (req, res) => {
  const { nom, adresse, ville, nb_lots, annee_constr } = req.body;
  const params = req.body;
  try {
    await query(
      `UPDATE residences SET nom=$1,adresse=$2,ville=$3,nb_lots=$4,annee_constr=$5 WHERE id=$6`,
      [nom, adresse, ville, nb_lots, annee_constr, req.user.residence_id]
    );
    await query(
      `INSERT INTO parametres (residence_id,relance_auto,relance_delai_jours,appel_fonds_auto,
         notif_sms_residents,rapport_hebdo,archivage_auto_pv)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (residence_id) DO UPDATE SET
         relance_auto=$2,relance_delai_jours=$3,appel_fonds_auto=$4,
         notif_sms_residents=$5,rapport_hebdo=$6,archivage_auto_pv=$7,updated_at=NOW()`,
      [req.user.residence_id,
       params.relance_auto ?? true, params.relance_delai_jours ?? 15,
       params.appel_fonds_auto ?? true, params.notif_sms_residents ?? true,
       params.rapport_hebdo ?? false, params.archivage_auto_pv ?? true]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
