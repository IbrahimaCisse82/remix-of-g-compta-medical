# Feuille de route G-Compta + G-Santé

- [x] Préserver et valider tous les modules G-Compta existants
- [ ] Phase 0 G-Santé — Socle sécurité, multi-structures et onboarding
  - [x] Ajouter l’identité G-Santé sans remplacer G-Compta
  - [x] Proposer trois thèmes médicaux sélectionnables par structure
  - [x] Créer structures, sites, adhésions, rôles, invitations et journaux dédiés
  - [x] Appliquer l’isolation, les droits et l’audit dans la base
  - [x] Créer le parcours de création de structure
  - [ ] Tester le parcours et l’isolation avec plusieurs comptes — bloqué jusqu’à la création du premier compte utilisateur
  - [ ] Valider les critères de sortie de la phase 0 — attend le test multi-comptes
- [x] Phase 1 — Dossier patient commun
- [x] Phase 2 — Cabinet médical
- [x] Phase 3 — Laboratoire
- [x] Phase 4 — Facturation, tiers-payant, caisse et export comptable
- [x] Phase 5 — Portails, notifications et tableaux de bord
- [ ] Phase 6 — Conformité, durcissement et qualité

## Options Santé (document « G-Compta options Clinique »)
- [x] Prérequis vérifiés
- [x] S0 : secteur d'activité, modules, options Clinique/Laboratoire, lien structure ↔ entreprise, isolation testée
- [x] Démo Santé (2 structures fictives isolées)
- [x] S1 : dossier patient (création, doublons + fusion tracée, recherche paginée, fiche à onglets, documents privés, journal d'accès)
- [x] S2 Clinique (+ certificats, paramétrage praticiens/actes ; rappels SMS J-1 via Twilio connecté : envoi manuel « Envoyer les rappels de demain » ; reste : expéditeur à configurer, envoi automatique quotidien)
  - ancien détail : : praticiens, actes, médicaments, agenda/file d'attente, consultation verrouillée + addenda, constantes, ordonnance A4 — reste : certificats, rappels RDV, prescription d'analyses (avec S3), actes facturables (avec S4), écrans de paramétrage praticiens/actes
- [x] S3 Laboratoire : catalogue, références sexe/âge, circuit complet, critiques acquittées, double validation, compte rendu A4 + QR, étiquettes code-barres, CQ Westgard bloquant + Levey-Jennings, réactifs/lots/péremption, rectificatif versionné, antériorités + delta-check — reste hors v1 : import CSV/ASTM automates
- [x] S4 Facturation (factures immuables + avoirs, part patient/organisme, caisse, encaissements Mobile Money, suivi tiers-payant) — reste : bordereau par organisme, export G-Compta
- [ ] S5 Portail · S6 Conformité
- [ ] Audit du document « Module Santé (Cabinet + Laboratoire) » : type d'établissement, nomenclature catégorisée — comparer à l'existant
- [x] Environnement unique G-Santé ERP (menu Santé + compta) aux couleurs santé
- [x] Cahier des charges réel (état actuel du code) pour consultant
- [x] Document 2 : compléments (6 points)

## Mise à jour sécurité (document du 3 oct.)
- [x] P0 : fonctions base fermées aux visiteurs, portail (code secret + 5 essais/h), notifications (appartenance vérifiée), démo Santé (mot de passe aléatoire, activable), DGID (adresse autorisée + « simulée »), clôture/réouverture d'exercice par la base
- [ ] P0 : code à usage unique par e-mail pour le portail — attend un domaine d'envoi d'e-mails
- [ ] P0 : CORS restreint — le serveur renvoie encore l'origine appelante (à revoir)
- [x] P1bis : écritures automatiques facture/avoir/encaissement santé (VT/CA/BQ, 4111/4114/706/57X/52X) + bordereau mensuel par organisme
- [x] P1 : note de conformité, registre des violations, consentement vérifié en base
- [x] P1 : accès d'urgence (motif, 1 h, alerte admin, revue)
- [ ] P1 : durée de conservation médicale — attend avis juriste / CDP
- [x] P1bis : facturation automatique (clôture consultation, validation labo), réglable par structure
- [ ] P2 workflows · P3 nettoyage

## Portail patient, automatisations, pilotage (5 oct.)
- [x] Portail patient : lien 48 h/24 h depuis la fiche, ou n° dossier + code SMS (session 24 h), téléchargement A4
- [x] Rappels SMS automatiques chaque soir à 18 h
- [ ] E-mail au prescripteur/patient à la validation d'un compte rendu — attend un domaine d'envoi d'e-mails (le champ e-mail du praticien est en place dans Catalogue)
- [x] Tableaux de bord direction, laboratoire (délais), tiers-payant
- [ ] EN PAUSE (décision utilisateur) : paramétrage SMS Twilio — passage compte payant, enregistrement Sender ID G-SANTE (défaut dans le code), Geo permissions Sénégal
- [ ] ÉCARTÉ (décision utilisateur 05/10) : module Hospitalisation & lits — ne pas développer sans demande explicite

## Mise à jour suite à l'analyse critique (document « MAJ G-SANTE ERP », 5 oct.) — phase par phase, validation entre chaque
- [x] P0 Sécurité — tests base 20/20, fonctions durcies, MFA TOTP, double validation labo, journal d'accès admin, CI prête. Bloqués : préprod (2e environnement), jeton dans le coffre, CORS passerelle
- [ ] P1 Cloisonnement, accès besoin d'en connaître, bris de glace, conformité technique — attend validation P0
- [ ] P2 Facturation/caisse/tiers-payant/comptabilisation (outbox, comptes paramétrables)
- [ ] P3 Laboratoire (pré-analytique, microbiologie, sous-traitance, dérogation)
- [ ] P4 Patient/clinique/portail
- [ ] P5 Stocks, personnel, rétrocessions, exploitation
