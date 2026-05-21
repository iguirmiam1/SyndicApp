require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

app.use('/api/auth',      require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/residents', require('./routes/residents'));
app.use('/api/charges',   require('./routes/charges'));
app.use('/api/incidents', require('./routes/incidents'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/messages',  require('./routes/messages'));
app.use('/api/ag',        require('./routes/ag'));
app.use('/api/settings',  require('./routes/settings'));
app.use('/api/admin',     require('./routes/admin'));

app.get('/api/health', async (req, res) => {
  try {
    await require('./db').query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', ts: new Date() });
  } catch { res.status(503).json({ status: 'error', db: 'disconnected' }); }
});

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

app.use((req, res) => res.status(404).json({ error: 'Route non trouvée' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur interne serveur' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ SyndicPro API démarrée sur http://localhost:${PORT}`));
