const router = require('express').Router();
const auth = require('../middleware/auth');
const { query } = require('../db');

let sendEmail=async()=>{}, templates={};
try{({sendEmail,templates}=require('../services/email'));}catch(e){}
const APP_URL=process.env.APP_URL||'https://syndicapp.onrender.com';

// Helper : exécuter une requête avec fallback si colonne manquante
const safeQuery = async (sql, vals, fallbackSql, fallbackVals) => {
  try { return await query(sql, vals); }
  catch(e) {
    if(fallbackSql && (e.message.includes('column') || e.message.includes('does not exist'))) {
      console.warn('Colonne manquante, fallback SQL:', e.message);
      return await query(fallbackSql, fallbackVals);
    }
    throw e;
  }
};

// GET /api/charges
router.get('/', auth.gestionnaire, async (req,res)=>{
  try{
    const {rows}=await query(
      `SELECT a.*,
         COUNT(p.id) AS nb_paiements,
         SUM(CASE WHEN p.statut='paye' THEN p.montant ELSE 0 END) AS total_encaisse,
         SUM(CASE WHEN p.statut='declare' THEN 1 ELSE 0 END) AS nb_declares
       FROM appels_fonds a LEFT JOIN paiements p ON p.appel_id=a.id
       WHERE a.residence_id=$1 GROUP BY a.id ORDER BY a.created_at DESC`,
      [req.user.residence_id]
    );
    res.json(rows);
  }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});

// POST /api/charges
router.post('/', auth.gestionnaire, async (req,res)=>{
  const{periode,montant_base,echeance,description}=req.body;
  if(!periode||!montant_base||!echeance)
    return res.status(400).json({error:'Champs requis manquants'});
  try{
    const{rows:[af]}=await query(
      `INSERT INTO appels_fonds(residence_id,periode,montant_base,echeance,description,statut)
       VALUES($1,$2,$3,$4,$5,'actif') RETURNING *`,
      [req.user.residence_id,periode,parseFloat(montant_base),echeance,description||'']
    );
    const{rows:residents}=await query(
      `SELECT id,tantiemes FROM utilisateurs WHERE residence_id=$1 AND role='resident'`,
      [req.user.residence_id]
    );
    for(const r of residents){
      const montant=parseFloat(montant_base)*(r.tantiemes||0)/1000||parseFloat(montant_base);
      await query(
        `INSERT INTO paiements(appel_id,resident_id,montant,statut)
         VALUES($1,$2,$3,'en_attente') ON CONFLICT DO NOTHING`,
        [af.id,r.id,montant]
      );
    }
    res.status(201).json(af);
  }catch(e){console.error(e);res.status(500).json({error:'Erreur serveur'});}
});

// GET /api/charges/resident/moi
router.get('/resident/moi', auth, async (req,res)=>{
  try{
    const{rows}=await query(
      `SELECT p.*,a.periode,a.echeance,a.description,a.statut AS statut_appel
       FROM paiements p JOIN appels_fonds a ON a.id=p.appel_id
       WHERE p.resident_id=$1 ORDER BY a.echeance DESC`,
      [req.user.id]
    );
    res.json(rows);
  }catch(e){res.status(500).json({error:'Erreur serveur'});}
});

// GET /api/charges/declarations/pending
router.get('/declarations/pending', auth.gestionnaire, async (req,res)=>{
  try{
    const{rows}=await query(
      `SELECT p.*,u.prenom,u.nom,u.lot,u.email,a.periode,a.echeance
       FROM paiements p
       JOIN utilisateurs u ON u.id=p.resident_id
       JOIN appels_fonds a ON a.id=p.appel_id
       WHERE a.residence_id=$1 AND p.statut='declare'
       ORDER BY p.updated_at DESC NULLS LAST`,
      [req.user.residence_id]
    );
    res.json(rows);
  }catch(e){
    // Si updated_at n'existe pas, retry sans ORDER BY updated_at
    try{
      const{rows}=await query(
        `SELECT p.*,u.prenom,u.nom,u.lot,u.email,a.periode,a.echeance
         FROM paiements p
         JOIN utilisateurs u ON u.id=p.resident_id
         JOIN appels_fonds a ON a.id=p.appel_id
         WHERE a.residence_id=$1 AND p.statut='declare'`,
        [req.user.residence_id]
      );
      res.json(rows);
    }catch(e2){res.status(500).json({error:'Erreur serveur'});}
  }
});

// GET /api/charges/:id/paiements
router.get('/:id/paiements', auth.gestionnaire, async (req,res)=>{
  try{
    const{rows}=await query(
      `SELECT p.*,u.prenom,u.nom,u.lot,u.tantiemes,u.email
       FROM paiements p JOIN utilisateurs u ON u.id=p.resident_id
       WHERE p.appel_id=$1 ORDER BY p.statut,u.nom`,
      [req.params.id]
    );
    res.json(rows);
  }catch(e){res.status(500).json({error:'Erreur serveur'});}
});

// POST /api/charges/paiements/:id/payer — résident déclare
router.post('/paiements/:id/payer', auth, async (req,res)=>{
  const{mode,date_paiement,reference}=req.body;
  try{
    const{rows:[p]}=await query(`SELECT * FROM paiements WHERE id=$1`,[req.params.id]);
    if(!p)return res.status(404).json({error:'Paiement non trouvé'});
    if(req.user.role==='resident'&&p.resident_id!==req.user.id)
      return res.status(403).json({error:'Accès refusé'});

    // Essai avec toutes les colonnes optionnelles
    let updated;
    try{
      const{rows}=await query(
        `UPDATE paiements SET statut='declare',mode=$1,date_paiement=$2,reference=$3,updated_at=NOW()
         WHERE id=$4 RETURNING *`,
        [mode||'virement',date_paiement||new Date().toISOString().split('T')[0],reference||null,req.params.id]
      );
      updated=rows[0];
    }catch(colErr){
      // Fallback : juste changer le statut si colonnes manquantes
      console.warn('Colonnes optionnelles manquantes, fallback:', colErr.message);
      const{rows}=await query(
        `UPDATE paiements SET statut='declare' WHERE id=$1 RETURNING *`,
        [req.params.id]
      );
      updated=rows[0];
    }

    // Notifier le gestionnaire
    try{
      const{rows:[gest]}=await query(
        `SELECT email,prenom FROM utilisateurs
         WHERE residence_id=$1 AND role='gestionnaire' LIMIT 1`,
        [req.user.residence_id]
      );
      const{rows:[appel]}=await query(
        `SELECT periode FROM appels_fonds WHERE id=$1`,[p.appel_id]
      );
      if(gest?.email){
        const modeLabel={virement:'Virement bancaire',versement:'Versement espèces',cheque:'Chèque',carte:'Carte'}[mode]||mode||'—';
        await sendEmail({
          to:gest.email,
          subject:`💳 Paiement à valider — ${req.user.prenom} ${req.user.nom} (Lot ${req.user.lot||'?'})`,
          html:`<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px">
            <div style="background:#0d5c47;color:#fff;padding:20px;border-radius:8px 8px 0 0">
              <h2 style="margin:0">💳 Nouveau paiement à valider</h2>
            </div>
            <div style="background:#fff;border:1px solid #e2e0d8;padding:20px;border-radius:0 0 8px 8px">
              <p><strong>${req.user.prenom} ${req.user.nom}</strong> (Lot ${req.user.lot||'?'}) a déclaré un paiement :</p>
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Période</td><td style="padding:8px">${appel?.periode||'—'}</td></tr>
                <tr><td style="padding:8px;font-weight:bold">Montant</td><td style="padding:8px">${parseFloat(p.montant||0).toLocaleString('fr-FR')} MAD</td></tr>
                <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Mode</td><td style="padding:8px">${modeLabel}</td></tr>
                <tr><td style="padding:8px;font-weight:bold">Date</td><td style="padding:8px">${date_paiement||'—'}</td></tr>
                <tr><td style="padding:8px;background:#f5f5f5;font-weight:bold">Référence</td><td style="padding:8px">${reference||'—'}</td></tr>
              </table>
              <div style="margin-top:20px;text-align:center">
                <a href="${APP_URL}" style="background:#0d5c47;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">
                  Valider sur SyndicPro
                </a>
              </div>
            </div>
          </body></html>`
        });
      }
    }catch(e){console.warn('Notif gestionnaire:', e.message);}

    res.json(updated);
  }catch(e){console.error('payer error:',e);res.status(500).json({error:'Erreur serveur: '+e.message});}
});

// POST /api/charges/paiements/:id/valider
router.post('/paiements/:id/valider', auth.gestionnaire, async (req,res)=>{
  const{commentaire}=req.body;
  try{
    const{rows:[p]}=await query(`SELECT * FROM paiements WHERE id=$1`,[req.params.id]);
    if(!p)return res.status(404).json({error:'Non trouvé'});

    let updated;
    try{
      const{rows}=await query(
        `UPDATE paiements SET statut='paye',commentaire_syndic=$1,updated_at=NOW() WHERE id=$2 RETURNING *`,
        [commentaire||null,req.params.id]
      );
      updated=rows[0];
    }catch(e){
      const{rows}=await query(
        `UPDATE paiements SET statut='paye' WHERE id=$1 RETURNING *`,[req.params.id]
      );
      updated=rows[0];
    }

    // Notifier le résident
    try{
      const{rows:[res_info]}=await query(
        `SELECT u.email,u.prenom,u.nom,a.periode,a.montant_base
         FROM utilisateurs u,appels_fonds a
         WHERE u.id=$1 AND a.id=$2`,[p.resident_id,p.appel_id]
      );
      if(res_info?.email){
        await sendEmail({
          to:res_info.email,
          subject:`✅ Paiement confirmé — ${res_info.periode}`,
          html:`<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px">
            <div style="background:#0d5c47;color:#fff;padding:20px;border-radius:8px 8px 0 0">
              <h2 style="margin:0">✅ Paiement confirmé</h2>
            </div>
            <div style="background:#fff;border:1px solid #e2e0d8;padding:20px;border-radius:0 0 8px 8px">
              <p>Bonjour <strong>${res_info.prenom}</strong>,</p>
              <p>Votre paiement pour <strong>${res_info.periode}</strong> a été <strong style="color:#0d5c47">confirmé par le syndic</strong>.</p>
              <p>Montant : <strong>${parseFloat(p.montant||0).toLocaleString('fr-FR')} MAD</strong></p>
              ${commentaire?`<div style="background:#e6f4ef;border-left:4px solid #0d5c47;padding:12px;margin:12px 0;border-radius:0 6px 6px 0"><strong>Message du syndic :</strong><br>${commentaire}</div>`:''}
              <div style="margin-top:20px;text-align:center">
                <a href="${APP_URL}" style="background:#0d5c47;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none">Voir mes paiements</a>
              </div>
            </div>
          </body></html>`
        });
      }
    }catch(e){console.warn('Notif validation:', e.message);}

    res.json(updated);
  }catch(e){res.status(500).json({error:'Erreur serveur'});}
});

// POST /api/charges/paiements/:id/rejeter
router.post('/paiements/:id/rejeter', auth.gestionnaire, async (req,res)=>{
  const{motif}=req.body;
  try{
    const{rows:[p]}=await query(`SELECT * FROM paiements WHERE id=$1`,[req.params.id]);
    if(!p)return res.status(404).json({error:'Non trouvé'});

    let updated;
    try{
      const{rows}=await query(
        `UPDATE paiements SET statut='en_attente',commentaire_syndic=$1,updated_at=NOW() WHERE id=$2 RETURNING *`,
        [`Rejeté : ${motif}`,req.params.id]
      );
      updated=rows[0];
    }catch(e){
      const{rows}=await query(
        `UPDATE paiements SET statut='en_attente' WHERE id=$1 RETURNING *`,[req.params.id]
      );
      updated=rows[0];
    }

    // Notifier le résident du rejet
    try{
      const{rows:[res_info]}=await query(
        `SELECT u.email,u.prenom,a.periode FROM utilisateurs u,appels_fonds a
         WHERE u.id=$1 AND a.id=$2`,[p.resident_id,p.appel_id]
      );
      if(res_info?.email){
        await sendEmail({
          to:res_info.email,
          subject:`⚠️ Déclaration non confirmée — ${res_info.periode}`,
          html:`<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px">
            <div style="background:#c0392b;color:#fff;padding:20px;border-radius:8px 8px 0 0">
              <h2 style="margin:0">⚠️ Déclaration non confirmée</h2>
            </div>
            <div style="background:#fff;border:1px solid #e2e0d8;padding:20px;border-radius:0 0 8px 8px">
              <p>Bonjour <strong>${res_info.prenom}</strong>,</p>
              <p>Votre déclaration pour <strong>${res_info.periode}</strong> n'a pas été confirmée.</p>
              <div style="background:#fdf1f0;border-left:4px solid #c0392b;padding:12px;margin:12px 0;border-radius:0 6px 6px 0">
                <strong>Motif :</strong> ${motif||'Contactez votre syndic.'}
              </div>
              <div style="margin-top:20px;text-align:center">
                <a href="${APP_URL}" style="background:#c0392b;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none">Re-déclarer</a>
              </div>
            </div>
          </body></html>`
        });
      }
    }catch(e){console.warn('Notif rejet:', e.message);}

    res.json(updated);
  }catch(e){res.status(500).json({error:'Erreur serveur'});}
});

// PUT /api/charges/paiements/:id
router.put('/paiements/:id', auth.gestionnaire, async (req,res)=>{
  const{statut,mode,date_paiement,reference}=req.body;
  try{
    const{rows}=await safeQuery(
      `UPDATE paiements SET statut=$1,mode=$2,date_paiement=$3,reference=$4,updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [statut,mode||null,date_paiement||null,reference||null,req.params.id],
      `UPDATE paiements SET statut=$1 WHERE id=$2 RETURNING *`,
      [statut,req.params.id]
    );
    res.json(rows[0]);
  }catch(e){res.status(500).json({error:'Erreur serveur'});}
});

module.exports=router;
