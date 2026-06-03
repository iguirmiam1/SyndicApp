require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Servir les uploads locaux (fallback sans Cloudinary)
const uploadDir = process.env.UPLOAD_DIR || '/tmp/uploads';
require('fs').mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', require('express').static(uploadDir));
console.log('📁 Uploads servis depuis:', uploadDir);

app.use((req, res, next) => { console.log(`${new Date().toISOString()} ${req.method} ${req.path}`); next(); });

// ── Routes ────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/dashboard',     require('./routes/dashboard'));
app.use('/api/residents',     require('./routes/residents'));
app.use('/api/charges',       require('./routes/charges'));
app.use('/api/incidents',     require('./routes/incidents'));
app.use('/api/documents',     require('./routes/documents'));
app.use('/api/messages',      require('./routes/messages'));
app.use('/api/ag',            require('./routes/ag'));
app.use('/api/settings',      require('./routes/settings'));
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/notifications', require('./routes/notifications'));

// Agenda — chargement sécurisé
try {
  const { router: agendaRouter, executeAgendaRule } = require('./routes/agenda');
  app.use('/api/agenda', agendaRouter);
  console.log('✅ Agenda router chargé');
  // Cron scheduler
  try {
    const cron = require('node-cron');
    const { query } = require('./db');
    cron.schedule('0 * * * *', async () => {
      console.log('⏰ Vérification agenda...');
      try {
        const h = new Date().getHours().toString().padStart(2,'0') + ':00';
        const { rows } = await query(
          `SELECT * FROM agenda_notifications WHERE actif=true
           AND (derniere_execution IS NULL OR derniere_execution::date < CURRENT_DATE)
           AND TO_CHAR(heure_envoi,'HH24:MI')=$1`, [h]
        );
        for (const r of rows) await executeAgendaRule(r, r.residence_id).catch(console.error);
      } catch(e) { console.error('Cron error:', e.message); }
    });
    console.log('⏰ Cron planificateur actif');
  } catch(e) { console.warn('⚠️  node-cron non disponible:', e.message); }
} catch(e) {
  console.warn('⚠️  routes/agenda.js non trouvé — fonctionnalité désactivée');
  app.use('/api/agenda', (req, res) => res.status(503).json({ error: 'Module agenda non disponible — uploadez routes/agenda.js' }));
}

// ── Health ─────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try { await require('./db').query('SELECT 1'); res.json({ status:'ok', db:'connected', v:'2.0' }); }
  catch { res.status(503).json({ status:'error', db:'disconnected' }); }
});

app.get('/api/reset-passwords', async (req, res) => {
  const bcrypt = require('bcryptjs'); const { query } = require('./db');
  try {
    for (const u of [
      { email:'iguirmia.mustapha@gmail.com',      password:'Admin2026!'    },
      { email:'iguirmiamustapha.new@gmail.com',    password:'Syndic2026!'   },
      { email:'awatif.chakib15@gmail.com',         password:'Resident2026!' },
    ]) { const h = await bcrypt.hash(u.password,10); await query(`UPDATE utilisateurs SET password_hash=$1 WHERE email=$2`,[h,u.email]); }
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.use('/api', (req,res) => res.status(404).json({ error:'Route non trouvée' }));
app.use((err,req,res,next) => { console.error(err); res.status(500).json({ error:'Erreur interne' }); });
app.get('*', (req,res) => res.sendFile(path.join(__dirname,'public','index.html')));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ SyndicPro API v2 → http://localhost:${PORT}`));
