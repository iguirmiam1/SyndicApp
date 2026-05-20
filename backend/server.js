require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/dashboard',  require('./routes/dashboard'));
app.use('/api/residents',  require('./routes/residents'));
app.use('/api/charges',    require('./routes/charges'));
app.use('/api/incidents',  require('./routes/incidents'));
app.use('/api/documents',  require('./routes/documents'));
app.use('/api/messages',   require('./routes/messages'));
app.use('/api/ag',         require('./routes/ag'));
app.use('/api/settings',   require('./routes/settings'));

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const { query } = require('./db');
    await query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', ts: new Date() });
  } catch (e) {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// 404
app.use((req, res) => res.status(404).json({ error: 'Route non trouvée' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur interne serveur' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ SyndicPro API démarrée sur http://localhost:${PORT}`));
