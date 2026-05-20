-- SyndicPro — Schéma PostgreSQL
-- ===================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Résidences ──────────────────────────────────────
CREATE TABLE residences (
  id            SERIAL PRIMARY KEY,
  nom           VARCHAR(200) NOT NULL,
  adresse       TEXT NOT NULL,
  ville         VARCHAR(100) NOT NULL DEFAULT 'Casablanca',
  nb_lots       INT NOT NULL DEFAULT 0,
  annee_constr  INT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Utilisateurs / Résidents ─────────────────────────
CREATE TABLE utilisateurs (
  id            SERIAL PRIMARY KEY,
  residence_id  INT REFERENCES residences(id) ON DELETE CASCADE,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  prenom        VARCHAR(100) NOT NULL,
  nom           VARCHAR(100) NOT NULL,
  telephone     VARCHAR(30),
  lot           VARCHAR(20),
  tantiemes     INT DEFAULT 0,
  role          VARCHAR(20) NOT NULL DEFAULT 'resident' CHECK (role IN ('resident','gestionnaire','admin')),
  notif_email   BOOLEAN DEFAULT TRUE,
  notif_sms     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Appels de fonds ──────────────────────────────────
CREATE TABLE appels_fonds (
  id            SERIAL PRIMARY KEY,
  residence_id  INT REFERENCES residences(id) ON DELETE CASCADE,
  periode       VARCHAR(50) NOT NULL,
  echeance      DATE NOT NULL,
  montant_base  NUMERIC(12,2) NOT NULL,
  description   TEXT,
  statut        VARCHAR(20) DEFAULT 'actif' CHECK (statut IN ('brouillon','actif','clos')),
  created_by    INT REFERENCES utilisateurs(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Paiements ────────────────────────────────────────
CREATE TABLE paiements (
  id            SERIAL PRIMARY KEY,
  appel_id      INT REFERENCES appels_fonds(id) ON DELETE CASCADE,
  resident_id   INT REFERENCES utilisateurs(id) ON DELETE CASCADE,
  montant       NUMERIC(12,2) NOT NULL,
  date_paiement DATE,
  mode          VARCHAR(30) DEFAULT 'carte' CHECK (mode IN ('carte','virement','especes','cheque')),
  statut        VARCHAR(20) DEFAULT 'en_attente' CHECK (statut IN ('en_attente','paye','retard','impaye')),
  reference     VARCHAR(100),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(appel_id, resident_id)
);

-- ── Incidents ────────────────────────────────────────
CREATE TABLE incidents (
  id            SERIAL PRIMARY KEY,
  residence_id  INT REFERENCES residences(id) ON DELETE CASCADE,
  resident_id   INT REFERENCES utilisateurs(id),
  type          VARCHAR(50) NOT NULL,
  localisation  VARCHAR(200),
  description   TEXT NOT NULL,
  urgence       VARCHAR(20) DEFAULT 'normal' CHECK (urgence IN ('normal','urgent','tres_urgent')),
  statut        VARCHAR(20) DEFAULT 'ouvert' CHECK (statut IN ('ouvert','en_cours','resolu','ferme')),
  prestataire   VARCHAR(200),
  cout          NUMERIC(12,2),
  date_resolution DATE,
  reference     VARCHAR(30),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Documents ────────────────────────────────────────
CREATE TABLE documents (
  id            SERIAL PRIMARY KEY,
  residence_id  INT REFERENCES residences(id) ON DELETE CASCADE,
  nom           VARCHAR(300) NOT NULL,
  categorie     VARCHAR(50) NOT NULL CHECK (categorie IN ('ag','reglementation','contrats','financier','autre')),
  url           TEXT,
  taille_ko     INT,
  uploaded_by   INT REFERENCES utilisateurs(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Messages ─────────────────────────────────────────
CREATE TABLE messages (
  id            SERIAL PRIMARY KEY,
  residence_id  INT REFERENCES residences(id) ON DELETE CASCADE,
  expediteur_id INT REFERENCES utilisateurs(id),
  canal         VARCHAR(20) NOT NULL CHECK (canal IN ('syndic','forum')),
  contenu       TEXT NOT NULL,
  lu            BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Assemblées Générales ─────────────────────────────
CREATE TABLE assemblees_generales (
  id            SERIAL PRIMARY KEY,
  residence_id  INT REFERENCES residences(id) ON DELETE CASCADE,
  date_ag       TIMESTAMPTZ NOT NULL,
  lieu          VARCHAR(300),
  type          VARCHAR(20) DEFAULT 'ordinaire' CHECK (type IN ('ordinaire','extraordinaire')),
  ordre_du_jour JSONB DEFAULT '[]',
  statut        VARCHAR(20) DEFAULT 'planifie' CHECK (statut IN ('planifie','en_cours','termine','annule')),
  pv_url        TEXT,
  created_by    INT REFERENCES utilisateurs(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Présences AG ─────────────────────────────────────
CREATE TABLE presences_ag (
  id            SERIAL PRIMARY KEY,
  ag_id         INT REFERENCES assemblees_generales(id) ON DELETE CASCADE,
  resident_id   INT REFERENCES utilisateurs(id) ON DELETE CASCADE,
  mode          VARCHAR(20) DEFAULT 'absent' CHECK (mode IN ('present','correspondance','absent')),
  UNIQUE(ag_id, resident_id)
);

-- ── Votes AG ─────────────────────────────────────────
CREATE TABLE votes_ag (
  id             SERIAL PRIMARY KEY,
  ag_id          INT REFERENCES assemblees_generales(id) ON DELETE CASCADE,
  resident_id    INT REFERENCES utilisateurs(id) ON DELETE CASCADE,
  resolution_num INT NOT NULL,
  choix          VARCHAR(20) NOT NULL CHECK (choix IN ('pour','contre','abstention')),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ag_id, resident_id, resolution_num)
);

-- ── Paramètres de résidence ───────────────────────────
CREATE TABLE parametres (
  id                       SERIAL PRIMARY KEY,
  residence_id             INT REFERENCES residences(id) ON DELETE CASCADE UNIQUE,
  relance_auto             BOOLEAN DEFAULT TRUE,
  relance_delai_jours      INT DEFAULT 15,
  appel_fonds_auto         BOOLEAN DEFAULT TRUE,
  notif_sms_residents      BOOLEAN DEFAULT TRUE,
  rapport_hebdo            BOOLEAN DEFAULT FALSE,
  archivage_auto_pv        BOOLEAN DEFAULT TRUE,
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- ── Index ─────────────────────────────────────────────
CREATE INDEX idx_paiements_appel ON paiements(appel_id);
CREATE INDEX idx_paiements_resident ON paiements(resident_id);
CREATE INDEX idx_incidents_residence ON incidents(residence_id);
CREATE INDEX idx_incidents_resident ON incidents(resident_id);
CREATE INDEX idx_messages_residence_canal ON messages(residence_id, canal);
CREATE INDEX idx_votes_ag ON votes_ag(ag_id, resident_id);

-- ── Fonction updated_at automatique ──────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_utilisateurs_updated_at
  BEFORE UPDATE ON utilisateurs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_incidents_updated_at
  BEFORE UPDATE ON incidents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
