const router = require('express').Router();
const auth = require('../middleware/auth');
const { query } = require('../db');

// Email autonome (sans dépendre de templates externes)
const sendNotifEmail = async (to, subject, html) => {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;
    const nodemailer = require('nodemailer');
    const t = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await t.sendMail({ from: `"SyndicPro" <${process.env.SMTP_USER}>`, to, subject, html });
    console.log(`📧 Notif envoyée → ${to}`);
  } catch(e) { console.warn('Email notif:', e.message); }
};

const emailBase = (titre, corps, btnLabel, btnUrl) => `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f6f2;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
<tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
  <tr><td style="background:#0d5c47;border-radius:12px 12px 0 0;padding:22px 32px">
    <span style="font-size:22px;font-weight:bold;color:#fff">SyndicPro</span>
  </td></tr>
  <tr><td style="background:#fff;padding:32px;border:1px solid #e2e0d8;border-top:none">
    <h2 style="margin:0 0 16px;color:#0d5c47;font-size:20px">${titre}</h2>
    <div style="font-size:13px;color:#5a5750;line-height:1.8">${corps}</div>
    ${btnLabel ? `<div style="text-align:center;margin:24px 0">
      <a href="${btnUrl}" style="background:#0d5c47;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">${btnLabel}</a>
    </div>` : ''}
  </td></tr>
  <tr><td style="background:#f0efe9;border-radius:0 0 12px 12px;border:1px solid #e2e0d8;border-top:none;padding:14px 32px;text-align:center">
    <p style="margin:0;font-size:11px;color:#9a9590">Message automatique SyndicPro — Ne pas répondre</p>
  </td></tr>
</table></td></tr></table></body></html>`;

const APP_URL = process.env.APP_URL || 'https://syndicapp.onrender.com';
const statutLabels = {
  ouvert:'Ouvert', en_cours:'En cours de traitement',
  resolu:'Résolu', ferme:'Fermé'
};
const urgIcons = { normal:'🟡', urgent:'🟠', tres_urgent:'🔴' };

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
    // Notifier le gestionnaire
    try {
      const { rows:[g] } = await query(
        `SELECT email FROM utilisateurs WHERE residence_id=$1 AND role='gestionnaire' LIMIT 1`,
        [req.user.residence_id]
      );
      if (g?.email) {
        await sendNotifEmail(g.email,
          `${urgIcons[urgence||'normal']} Nouvelle réclamation — ${type} (Lot ${req.user.lot||'?'})`,
          emailBase('Nouvelle réclamation signalée',
            `<strong>${req.user.prenom} ${req.user.nom}</strong> (Lot ${req.user.lot||'?'}) a signalé :<br><br>
            <b>Type :</b> ${type}<br><b>Localisation :</b> ${localisation||'—'}<br>
            <b>Urgence :</b> ${urgIcons[urgence||'normal']} ${urgence||'normal'}<br>
            <b>Description :</b> ${description||'—'}`,
            'Voir les réclamations', APP_URL)
        );
      }
    } catch(e) { console.warn('Notif gestionnaire:', e.message); }
    res.status(201).json(rows[0]);
  } catch(e) { res.status(500).json({ error: 'Erreur: '+e.message }); }
});

// ── PUT /api/incidents/:id ────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  const { type, localisation, description, urgence,
          prestataire, cout, statut, date_resolution, commentaire_syndic } = req.body;
  try {
    const { rows:[old] } = await query(`SELECT * FROM incidents WHERE id=$1`, [req.params.id]);
    if (!old) return res.status(404).json({ error: 'Non trouvé' });
    if (req.user.role === 'resident' && old.resident_id !== req.user.id)
      return res.status(403).json({ error: 'Accès refusé' });

    const ancienStatut = old.statut;
    const nouveauStatut = statut || ancienStatut;

    // Construire le SET dynamiquement pour éviter erreur si colonne manquante
    const updates = [];
    const vals = [];
    const add = (col, val) => { vals.push(val); updates.push(`${col}=$${vals.length}`); };

    if (type)          add('type', type);
    if (localisation !== undefined) add('localisation', localisation);
    if (description !== undefined)  add('description', description);
    if (urgence)       add('urgence', urgence);
    add('prestataire', prestataire !== undefined ? (prestataire||null) : old.prestataire);
    add('cout', cout !== undefined ? (cout ? parseFloat(cout) : null) : old.cout);
    if (statut)        add('statut', statut);
    add('date_resolution',
      date_resolution || (statut === 'resolu' ? new Date().toISOString().split('T')[0] : old.date_resolution)
    );
    // commentaire_syndic : essayer, ignorer si colonne absente
    let hasCommentCol = true;
    if (commentaire_syndic !== undefined) add('commentaire_syndic', commentaire_syndic || null);
    updates.push('updated_at=NOW()');

    vals.push(req.params.id);
    let sql = `UPDATE incidents SET ${updates.join(',')} WHERE id=$${vals.length} RETURNING *`;
    let result;
    try {
      ({ rows: [result] } = await query(sql, vals));
    } catch(e) {
      if (e.message.includes('commentaire_syndic')) {
        // colonne pas encore créée → retry sans commentaire
        const updates2 = updates.filter(u => !u.includes('commentaire_syndic'));
        const vals2 = vals.filter((_, i) => !updates[i]?.includes('commentaire_syndic'));
        vals2.push(req.params.id);
        sql = `UPDATE incidents SET ${updates2.join(',')} WHERE id=$${vals2.length} RETURNING *`;
        ({ rows: [result] } = await query(sql, vals2));
        hasCommentCol = false;
      } else throw e;
    }

    // ── Notifier le résident si statut OU commentaire a changé ────────────────
    const statutChange = ancienStatut !== nouveauStatut;
    const commentaireChange = hasCommentCol && commentaire_syndic && commentaire_syndic !== old.commentaire_syndic;

    if ((statutChange || commentaireChange) &&
        (req.user.role === 'gestionnaire' || req.user.role === 'admin')) {
      try {
        const { rows:[res] } = await query(
          `SELECT u.email,u.prenom,u.nom,u.telephone,u.notif_email,u.notif_sms
           FROM utilisateurs u WHERE u.id=$1`, [old.resident_id]
        );
        if (res?.email && res.notif_email !== false) {
          const newLabel = statutLabels[nouveauStatut] || nouveauStatut;
          let corps = `Bonjour <strong>${res.prenom}</strong>,<br><br>`;
          corps += `Votre réclamation <strong>${result.type}`;
          if (result.localisation) corps += ` — ${result.localisation}`;
          corps += `</strong> a été mise à jour.<br><br>`;
          if (statutChange)
            corps += `<table style="width:100%;border-collapse:collapse;margin:8px 0">
              <tr><td style="padding:8px 12px;background:#f0efe9;font-size:13px;color:#5a5750;width:40%">Nouveau statut</td>
              <td style="padding:8px 12px;background:#f0efe9;font-size:13px;font-weight:700;color:#0d5c47">${nouveauStatut==='resolu'?'✅':nouveauStatut==='en_cours'?'🔧':'📋'} ${newLabel}</td></tr>
              ${result.prestataire?`<tr><td style="padding:8px 12px;font-size:13px;color:#5a5750">Prestataire</td><td style="padding:8px 12px;font-size:13px;font-weight:600">${result.prestataire}</td></tr>`:''}
              ${result.date_resolution&&nouveauStatut==='resolu'?`<tr><td style="padding:8px 12px;background:#f0efe9;font-size:13px;color:#5a5750">Résolu le</td><td style="padding:8px 12px;background:#f0efe9;font-size:13px;font-weight:600">${new Date(result.date_resolution).toLocaleDateString('fr-FR')}</td></tr>`:''}
            </table>`;
          if (commentaireChange)
            corps += `<div style="background:#e6f4ef;border-left:4px solid #0d5c47;padding:12px 16px;border-radius:0 8px 8px 0;margin-top:12px">
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#0d5c47">MESSAGE DU SYNDIC</p>
              <p style="margin:0;font-size:13px;color:#1a1917">${commentaire_syndic}</p>
            </div>`;

          await sendNotifEmail(res.email,
            `📋 Réclamation mise à jour — ${result.type} → ${newLabel}`,
            emailBase('Mise à jour de votre réclamation', corps, 'Voir mes réclamations', APP_URL)
          );
        }
        // WhatsApp
        if (res?.telephone && res.notif_sms) {
          try {
            const { sendWhatsApp } = require('../services/whatsapp');
            const msg = `📋 *SyndicPro*\n\nBonjour *${res.prenom}*,\n\nVotre réclamation *${result.type}* : *${statutLabels[nouveauStatut]||nouveauStatut}*${commentaireChange?'\n\n💬 '+commentaire_syndic:''}\n\nConnectez-vous pour voir le détail.`;
            await sendWhatsApp({ to: res.telephone, message: msg });
          } catch(e) { console.warn('WA incident:', e.message); }
        }
      } catch(e) { console.warn('Notif résident incident:', e.message); }
    }

    res.json(result);
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
