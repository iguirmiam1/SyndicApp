# SyndicPro — Application de Gestion de Copropriété

Stack : **Node.js + Express** (backend) · **PostgreSQL** (BDD) · **HTML/CSS/JS Vanilla** (frontend) · **Docker Compose** (orchestration)

## Démarrage rapide

```bash
# 1. Cloner / décompresser le projet
cd syndicpro

# 2. Configurer l'environnement
cp .env.example .env
# Modifier .env si nécessaire

# 3. Lancer tous les services
docker compose up --build

# L'application est disponible sur :
# Frontend  → http://localhost:3000
# API       → http://localhost:4000/api
# BDD       → localhost:5432
```

## Comptes de démonstration

| Rôle         | Email                    | Mot de passe |
|--------------|--------------------------|--------------|
| Résident     | `m.benali@email.ma`      | `resident123`|
| Gestionnaire | `syndic@orangers.ma`     | `syndic123`  |

## Architecture

```
syndicpro/
├── docker-compose.yml      # Orchestration des 3 services
├── nginx.conf              # Proxy frontend → API
├── .env.example            # Variables d'environnement
│
├── backend/
│   ├── server.js           # Point d'entrée Express
│   ├── db.js               # Pool PostgreSQL (pg)
│   ├── schema.sql          # Schéma de la BDD (auto-chargé)
│   ├── seed.sql            # Données de démo (auto-chargées)
│   ├── middleware/
│   │   └── auth.js         # JWT middleware
│   └── routes/
│       ├── auth.js         # Login, register, profil
│       ├── dashboard.js    # KPIs résident & gestionnaire
│       ├── residents.js    # CRUD résidents
│       ├── charges.js      # Appels de fonds & paiements
│       ├── incidents.js    # Signalements & interventions
│       ├── documents.js    # Bibliothèque documentaire
│       ├── messages.js     # Messagerie (syndic + forum)
│       ├── ag.js           # AG, présences, votes
│       └── settings.js     # Paramètres résidence
│
└── frontend/
    ├── index.html          # SPA — HTML + structure
    └── app.js              # Toute la logique client (fetch API)
```

## API REST — Endpoints principaux

| Méthode | Endpoint                          | Description                      |
|---------|-----------------------------------|----------------------------------|
| POST    | `/api/auth/login`                 | Authentification JWT             |
| GET     | `/api/auth/me`                    | Profil utilisateur connecté      |
| GET     | `/api/dashboard/resident`         | KPIs tableau de bord résident    |
| GET     | `/api/dashboard/gestionnaire`     | KPIs tableau de bord gestionnaire|
| GET     | `/api/charges/resident/moi`       | Paiements du résident connecté   |
| POST    | `/api/charges/paiements/:id/payer`| Payer une charge en ligne        |
| GET     | `/api/incidents`                  | Liste des incidents               |
| POST    | `/api/incidents`                  | Signaler un incident              |
| GET     | `/api/ag`                         | Liste des AG                     |
| POST    | `/api/ag/:id/votes`               | Voter en ligne                   |
| GET     | `/api/settings/residence`         | Paramètres de la résidence       |

Toutes les routes (sauf `/api/auth/login`) nécessitent un header :
```
Authorization: Bearer <token>
```

## Sans Docker (développement local)

```bash
# Prérequis : Node.js 20+, PostgreSQL 15+

# 1. Base de données
psql -U postgres -c "CREATE DATABASE syndicpro;"
psql syndicpro < backend/schema.sql
psql syndicpro < backend/seed.sql

# 2. Backend
cd backend
npm install
DATABASE_URL=postgres://localhost/syndicpro JWT_SECRET=dev npm start

# 3. Frontend
# Ouvrir frontend/index.html dans un navigateur
# ou : npx serve frontend
```

## Variables d'environnement

| Variable          | Défaut              | Description                |
|-------------------|---------------------|----------------------------|
| `POSTGRES_DB`     | `syndicpro`         | Nom de la base de données  |
| `POSTGRES_USER`   | `syndicpro`         | Utilisateur PostgreSQL     |
| `POSTGRES_PASSWORD`| `syndicpro2026`    | Mot de passe PostgreSQL    |
| `JWT_SECRET`      | `changeme_...`      | Clé secrète JWT (**À changer en prod**) |
| `BCRYPT_ROUNDS`   | `10`                | Rounds de hachage bcrypt   |
| `NODE_ENV`        | `development`       | Environnement              |
| `PORT`            | `4000`              | Port du backend            |
