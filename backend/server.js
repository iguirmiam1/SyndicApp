require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ── Routes API ────────────────────────────────────────────────────────────────
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
// app.use('/api/agenda', require('./routes/agenda').router); // À activer après upload agenda.js

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await require('./db').query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', ts: new Date(), version: '2.0' });
  } catch { res.status(503).json({ status: 'error', db: 'disconnected' }); }
});

// ── Reset passwords (temporaire) ──────────────────────────────────────────────
app.get('/api/reset-passwords', async (req, res) => {
  const bcrypt = require('bcryptjs');
  const { query } = require('./db');
  try {
    const updates = [
      { email: 'iguirmia.mustapha@gmail.com',               password: 'Admin2026!' },
      { email: 'contact@servicepro-solutions.com',           password: 'Syndic2026!' },
      { email: 'iguirmia.mustapha@servicepro-solutions.com', password: 'Resident2026!' },
    ];
    for (const u of updates) {
      const hash = await bcrypt.hash(u.password, 10);
      await query(`UPDATE utilisateurs SET password_hash=$1 WHERE email=$2`, [hash, u.email]);
    }
    res.json({ success: true, message: 'Mots de passe réinitialisés' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── 404 + Error ───────────────────────────────────────────────────────────────
app.use('/api', (req, res) => res.status(404).json({ error: 'Route non trouvée' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Erreur interne serveur' }); });

// ── SPA Catch-all ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Démarrage + Cron ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ SyndicPro API v2 démarrée sur http://localhost:${PORT}`);
  startCronScheduler();
});

// ── Scheduler automatique ─────────────────────────────────────────────────────
function startCronScheduler() {
  if (process.env.NODE_ENV === 'test') return;
  try {
    const cron = require('node-cron');
    const { query } = require('./db');
    const { executeAgendaRule } = require('./routes/agenda');

    // Exécuter chaque heure à :00
    cron.schedule('0 * * * *', async () => {
      console.log('🕐 Vérification agenda notifications...');
      try {
        const heureActuelle = new Date().getHours().toString().padStart(2,'0') + ':00';
        const { rows: rules } = await query(
          `SELECT a.* FROM agenda_notifications a
           WHERE a.actif=true
             AND (a.derniere_execution IS NULL OR a.derniere_execution < CURRENT_DATE)
             AND TO_CHAR(a.heure_envoi, 'HH24:MI') = $1`,
          [heureActuelle]
        );
        console.log(`📋 ${rules.length} règle(s) à exécuter`);
        for (const rule of rules) {
          await executeAgendaRule(rule, rule.residence_id).catch(console.error);
        }
      } catch(e) { console.error('Erreur cron:', e.message); }
    });

    console.log('⏰ Planificateur de notifications activé (vérification toutes les heures)');
  } catch(e) {
    console.warn('⚠️  node-cron non disponible:', e.message);
  }
}
