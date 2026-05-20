const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

const auth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: 'Non authentifié' });
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
};

auth.gestionnaire = (req, res, next) => {
  auth(req, res, () => {
    if (!['gestionnaire','admin'].includes(req.user.role))
      return res.status(403).json({ error: 'Accès réservé au gestionnaire' });
    next();
  });
};

module.exports = auth;
