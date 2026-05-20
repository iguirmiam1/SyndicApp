-- SyndicPro — Données de démonstration
-- Mots de passe : resident123 (résidents), syndic123 (gestionnaire)
-- Hashes bcrypt générés avec rounds=10

INSERT INTO residences (nom, adresse, ville, nb_lots, annee_constr)
VALUES ('Résidence Les Orangers', '12, Rue des Orangers, Maarif', 'Casablanca', 24, 2005);

-- Gestionnaire (password: syndic123)
INSERT INTO utilisateurs (residence_id, email, password_hash, prenom, nom, telephone, lot, tantiemes, role)
VALUES (1, 'syndic@orangers.ma',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17leiO',
  'Karim','El Alami','05 22 48 00 01', NULL, 0, 'gestionnaire');

-- Résidents (password: resident123)
INSERT INTO utilisateurs (residence_id, email, password_hash, prenom, nom, telephone, lot, tantiemes, role) VALUES
(1,'m.benali@email.ma','$2a$10$TbX5pnXOY0pHM8uGj.X7LOyqjZPqA/YAd.z2f0nHIxaTHjwFLOWUq','Mohammed','Benali','06 12 34 56 78','4B',85,'resident'),
(1,'n.idrissi@email.ma','$2a$10$TbX5pnXOY0pHM8uGj.X7LOyqjZPqA/YAd.z2f0nHIxaTHjwFLOWUq','Nadia','Idrissi','06 98 76 54 32','2A',85,'resident'),
(1,'h.chaoui@email.ma','$2a$10$TbX5pnXOY0pHM8uGj.X7LOyqjZPqA/YAd.z2f0nHIxaTHjwFLOWUq','Hassan','Chaoui','06 11 22 33 44','1C',85,'resident'),
(1,'f.tazi@email.ma','$2a$10$TbX5pnXOY0pHM8uGj.X7LOyqjZPqA/YAd.z2f0nHIxaTHjwFLOWUq','Fatima','Tazi','06 55 44 33 22','3D',120,'resident'),
(1,'a.elfassi@email.ma','$2a$10$TbX5pnXOY0pHM8uGj.X7LOyqjZPqA/YAd.z2f0nHIxaTHjwFLOWUq','Ahmed','El Fassi','06 77 88 99 00','5A',85,'resident'),
(1,'n.moukrim@email.ma','$2a$10$TbX5pnXOY0pHM8uGj.X7LOyqjZPqA/YAd.z2f0nHIxaTHjwFLOWUq','Nour','Moukrim','06 22 33 44 55','6B',100,'resident'),
(1,'h.brahim@email.ma','$2a$10$TbX5pnXOY0pHM8uGj.X7LOyqjZPqA/YAd.z2f0nHIxaTHjwFLOWUq','Houda','Brahim','06 44 55 66 77','2C',95,'resident');

-- Appels de fonds
INSERT INTO appels_fonds (residence_id, periode, echeance, montant_base, description, statut, created_by) VALUES
(1,'Q2 2026','2026-05-30',10,'Charges trimestrielles Q2 2026','actif',1),
(1,'Q1 2026','2026-02-28',10,'Charges trimestrielles Q1 2026','clos',1),
(1,'Q4 2025','2025-11-30',10,'Charges trimestrielles Q4 2025','clos',1);

-- Paiements Q2 (montant = tantiemes * 10)
INSERT INTO paiements (appel_id, resident_id, montant, date_paiement, mode, statut, reference) VALUES
(1,2,850,'2026-05-18','virement','paye','VIR-2026-0541'),
(1,3,850,NULL,NULL,'retard',NULL),
(1,4,850,NULL,NULL,'impaye',NULL),
(1,5,1200,NULL,NULL,'impaye',NULL),
(1,6,850,'2026-05-10','carte','paye','CB-2026-0389'),
(1,7,1000,NULL,NULL,'impaye',NULL),
(1,8,950,NULL,NULL,'impaye',NULL);

-- Paiements Q1 (tous payés)
INSERT INTO paiements (appel_id, resident_id, montant, date_paiement, mode, statut, reference) VALUES
(2,2,850,'2026-02-15','carte','paye','CB-2026-0102'),
(2,3,850,'2026-02-10','virement','paye','VIR-2026-0098'),
(2,4,850,'2026-02-20','carte','paye','CB-2026-0145'),
(2,5,1200,'2026-02-08','virement','paye','VIR-2026-0089'),
(2,6,850,'2026-02-12','carte','paye','CB-2026-0118'),
(2,7,1000,'2026-02-18','virement','paye','VIR-2026-0134'),
(2,8,950,'2026-02-25','carte','paye','CB-2026-0201');

-- Incidents
INSERT INTO incidents (residence_id, resident_id, type, localisation, description, urgence, statut, prestataire, cout, reference, created_at) VALUES
(1,2,'Plomberie','Couloir 3e étage','Fuite d''eau importante au niveau du joint de canalisation principale','urgent','en_cours','Plomberie Alami',1800,'INC-2026-042','2026-05-12 09:30:00'),
(1,2,'Ascenseur','Hall principal','Panne partielle de l''ascenseur, cabine bloquée entre 2 paliers','urgent','en_cours','Otis Maroc',0,'INC-2026-039','2026-05-05 14:00:00'),
(1,3,'Éclairage','Parking sous-sol','Ampoules défaillantes dans la zone parking, visibilité insuffisante','normal','resolu','Électricité Rapide',320,'INC-2026-031','2026-04-25 10:00:00'),
(1,4,'Interphone','Entrée principale','Interphone défaillant, résidents bloqués à l''entrée','urgent','resolu','Télécom Services',880,'INC-2026-018','2026-03-05 08:00:00');

-- Documents
INSERT INTO documents (residence_id, nom, categorie, uploaded_by, created_at) VALUES
(1,'PV Assemblée Générale — Avril 2026','ag',1,'2026-05-05'),
(1,'Convocation AG — 15 Juin 2026','ag',1,'2026-05-10'),
(1,'PV Assemblée Générale — Octobre 2025','ag',1,'2025-11-02'),
(1,'Règlement de copropriété','reglementation',1,'2026-01-01'),
(1,'Budget prévisionnel 2026','financier',1,'2026-01-15'),
(1,'Contrat gardiennage — Renouvellement 2026','contrats',1,'2026-03-01'),
(1,'Contrat maintenance ascenseur — Otis','contrats',1,'2026-01-01'),
(1,'Carnet d''entretien 2025 (archivé)','autre',1,'2025-12-31');

-- Messages
INSERT INTO messages (residence_id, expediteur_id, canal, contenu, created_at) VALUES
(1,1,'syndic','Bonjour M. Benali, votre appel de fonds Q2 est disponible. Montant : 850 MAD, échéance le 30 mai.','2026-05-01 09:12:00'),
(1,2,'syndic','Merci, je règle ça avant le 30. J''ai signalé une fuite au 3e étage.','2026-05-01 10:45:00'),
(1,1,'syndic','Bien noté pour la fuite. Un plombier interviendra jeudi 22 mai.','2026-05-01 11:02:00'),
(1,5,'forum','Bonjour à tous, quelqu''un a le numéro du plombier pour la fuite du 3e ?','2026-05-12 08:20:00'),
(1,3,'forum','Le syndic a déjà été contacté, intervention jeudi 👍','2026-05-12 09:00:00'),
(1,2,'forum','C''est moi qui ai signalé. Confirmation reçue du syndic.','2026-05-12 09:15:00');

-- AG
INSERT INTO assemblees_generales (residence_id, date_ag, lieu, type, ordre_du_jour, statut, created_by) VALUES
(1,'2026-06-15 18:00:00','Salle de réunion, Rez-de-chaussée','ordinaire',
'[
  {"num":1,"titre":"Approbation des comptes 2025","pour":8,"contre":1,"abstention":2},
  {"num":2,"titre":"Travaux ravalement façade — 180 000 MAD","pour":6,"contre":3,"abstention":2},
  {"num":3,"titre":"Renouvellement contrat gardiennage (+5%)","pour":9,"contre":0,"abstention":2}
]','planifie',1);

-- Présences AG
INSERT INTO presences_ag (ag_id, resident_id, mode) VALUES
(1,2,'present'),(1,3,'present'),(1,4,'correspondance'),
(1,5,'absent'),(1,6,'present'),(1,7,'correspondance'),(1,8,'absent');

-- Paramètres
INSERT INTO parametres (residence_id, relance_auto, relance_delai_jours, appel_fonds_auto, notif_sms_residents, rapport_hebdo, archivage_auto_pv)
VALUES (1, TRUE, 15, TRUE, TRUE, FALSE, TRUE);
