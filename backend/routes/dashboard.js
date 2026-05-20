const router = require('express').Router();
const auth = require('../middleware/auth');
const { query } = require('../db');

// GET /api/dashboard/resident
router.get('/resident', auth, async (req, res) => {
  const { id, residence_id } = req.user;
  try {
    const [chargesRes, incidentsRes, docsRes, agRes, userRes] = await Promise.all([
      query(`SELECT a.periode, a.echeance, a.montant_base,
               p.montant, p.statut, p.date_paiement, p.mode
             FROM appels_fonds a
             LEFT JOIN paiements p ON p.appel_id=a.id AND p.resident_id=$1
             WHERE a.residence_id=$2 ORDER BY a.created_at DESC LIMIT 6`, [id, residence_id]),
      query(`SELECT id,type,localisation,statut,urgence,reference,created_at
             FROM incidents WHERE resident_id=$1 ORDER BY created_at DESC LIMIT 5`, [id]),
      query(`SELECT COUNT(*) AS total FROM documents WHERE residence_id=$1`, [residence_id]),
      query(`SELECT id,date_ag,lieu,type,statut FROM assemblees_generales
             WHERE residence_id=$1 ORDER BY date_ag DESC LIMIT 1`, [residence_id]),
      query(`SELECT prenom,nom,lot,tantiemes,email,telephone,notif_email,notif_sms
             FROM utilisateurs WHERE id=$1`, [id])
    ]);

    const prochainAppel = chargesRes.rows.find(r => r.statut !== 'paye') || null;
    const totalPaye = chargesRes.rows.filter(r => r.statut === 'paye')
      .reduce((s, r) => s + parseFloat(r.montant || 0), 0);

    res.json({
      user: userRes.rows[0],
      prochainAppel,
      totalPaye,
      historiquePaiements: chargesRes.rows,
      incidentsOuverts: incidentsRes.rows.filter(i => i.statut !== 'resolu').length,
      incidentsRecents: incidentsRes.rows,
      nbDocuments: parseInt(docsRes.rows[0]?.total || 0),
      prochaineAG: agRes.rows[0] || null,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/dashboard/gestionnaire
router.get('/gestionnaire', auth.gestionnaire, async (req, res) => {
  const { residence_id } = req.user;
  try {
    const [residentsRes, paiementsRes, incidentsRes, impayes, budget] = await Promise.all([
      query(`SELECT COUNT(*) AS total FROM utilisateurs WHERE residence_id=$1 AND role='resident'`, [residence_id]),
      query(`SELECT p.statut, COUNT(*) AS cnt, SUM(p.montant) AS total
             FROM paiements p JOIN appels_fonds a ON a.id=p.appel_id
             WHERE a.residence_id=$1 AND a.statut='actif'
             GROUP BY p.statut`, [residence_id]),
      query(`SELECT statut, COUNT(*) AS cnt FROM incidents WHERE residence_id=$1 GROUP BY statut`, [residence_id]),
      query(`SELECT u.prenom,u.nom,u.lot,p.montant,p.statut,
               CURRENT_DATE - a.echeance AS jours_retard
             FROM paiements p
             JOIN utilisateurs u ON u.id=p.resident_id
             JOIN appels_fonds a ON a.id=p.appel_id
             WHERE a.residence_id=$1 AND p.statut IN ('retard','impaye') AND a.statut='actif'
             ORDER BY jours_retard DESC`, [residence_id]),
      query(`SELECT SUM(montant_base * 24) AS budget_total FROM appels_fonds
             WHERE residence_id=$1 AND statut='actif'`, [residence_id]),
    ]);

    const paiStats = {};
    paiementsRes.rows.forEach(r => { paiStats[r.statut] = { cnt: +r.cnt, total: parseFloat(r.total || 0) }; });
    const incStats = {};
    incidentsRes.rows.forEach(r => { incStats[r.statut] = +r.cnt; });
    const totalResidents = +residentsRes.rows[0]?.total || 0;
    const aJour = +(paiStats.paye?.cnt || 0);

    res.json({
      totalResidents,
      aJour,
      tauxRecouvrement: totalResidents ? Math.round(aJour / totalResidents * 100) : 0,
      totalImpayes: impayes.rows.reduce((s, r) => s + parseFloat(r.montant || 0), 0),
      nbImpayes: impayes.rows.length,
      budgetAnnuel: parseFloat(budget.rows[0]?.budget_total || 245000),
      incidentsActifs: (incStats.ouvert || 0) + (incStats.en_cours || 0),
      paiStats,
      incStats,
      impayesDetail: impayes.rows,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
