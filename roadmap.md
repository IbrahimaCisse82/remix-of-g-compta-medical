# Plan de développement G-Santé ERP — objectif 100 % fonctionnel
Mise à jour : 22 octobre 2026

## Objectif demandé
- [ ] Rendre tous les modules du périmètre fonctionnels, avec validation de chaque étape avant la suivante ; ne pas déclarer 100 % tant que les parcours et dépendances externes ne sont pas validés.

## Déjà livré
- [x] Comptabilité SYSCOHADA complète (G-Compta) conservée et testée
- [x] Environnement unique Santé + compta, thèmes médicaux sombre/clair, 3 palettes
- [x] Phases 0 à 5 Santé : structures, dossier patient, clinique, laboratoire, facturation, portail, tableaux de bord
- [x] Sécurité P0–P3 (MFA, cloisonnement, bris de glace, laboratoire) — 53/53 tests base
- [x] P4 partiel : allergies, doses pédiatriques, portail lien unique, résultats sensibles masqués, remise en main propre, fusion en deux temps, date estimée, téléphone international
- [x] E-mails d'authentification déployés (notify.g-sante.app)

## Étape 1 — Corriger les blocages vus en test (priorité)
- [ ] Activer automatiquement les modules à la création d'une structure (selon son type)
- [ ] Rôle par défaut du créateur : administrateur + rôle métier choisi à l'onboarding
- [ ] Messages « Accès refusé » explicites (rôle manquant, module inactif, MFA requise)
- [ ] Connexion Google : saisir l'identifiant et la clé Google du nouvel espace de travail

## Étape 2 — Terminer P4 (patient, clinique, portail)
- [ ] Tests automatiques de la fusion en deux temps + essai à l'écran
- [ ] Vérifier la liste des analyses sensibles avec le biologiste
- [ ] Signature du consentement complet à l'écran
- [ ] Tests du lien unique du portail

## Étape 3 — P5 Exploitation
- [ ] Stocks pharmacie/réactifs reliés aux consultations et au labo
- [ ] Personnel : plannings, gardes, lien paie
- [ ] Rétrocessions aux praticiens
- [ ] Sauvegardes, supervision, journal d'exploitation

## Étape 4 — Phase 6 Conformité et qualité
- [ ] Portail : code à usage unique par e-mail
- [ ] CORS restreint aux domaines g-sante.app
- [ ] Workflows (P2) et nettoyage du code (P3)
- [ ] Audit du document « Module Santé (Cabinet + Laboratoire) »
- [ ] Parcours complet testé sur ordinateur et tablette, tous rôles
- [ ] Réattribution des rôles réels (retirer « tous les rôles » du compte de test)

## Étape 5 — Mise en service
- [ ] Environnement de préproduction séparé
- [ ] Publication, domaine g-sante.app vérifié
- [ ] Formation et documentation utilisateur

## En attente d'une action externe
- [ ] Vérification DNS du domaine d'envoi d'e-mails (e-mails praticien/patient)
- [ ] Twilio : compte payant, Sender ID G-SANTE, autorisation Sénégal (EN PAUSE)
- [ ] Juriste / CDP : autorisation de traitement, durée de conservation médicale
- [ ] Expert-comptable / fiscaliste : comptes santé et TVA
- [ ] Accès DGID officiels (e-facturation réelle)
- [ ] Biologiste : durée de conservation des échantillons (7 jours par défaut)

## Écartés
- Hospitalisation & lits (décision du 05/10/2026)
- Liaison directe automates ASTM/HL7 (hors v1, import fichier seulement)
