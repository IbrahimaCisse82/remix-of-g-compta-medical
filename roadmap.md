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
- [ ] Phase 1 — Dossier patient commun
- [ ] Phase 2 — Cabinet médical
- [ ] Phase 3 — Laboratoire
- [ ] Phase 4 — Facturation, tiers-payant, caisse et export comptable
- [ ] Phase 5 — Portails, notifications et tableaux de bord
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
