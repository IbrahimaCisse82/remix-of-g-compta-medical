# Plan de développement G-Santé ERP — objectif 100 % fonctionnel
Mise à jour : 21 octobre 2026

## Déjà livré
- [x] Comptabilité SYSCOHADA complète (G-Compta) conservée et testée
- [x] Environnement unique Santé + compta, thèmes médicaux sombre/clair, 3 palettes
- [x] Phases 0 à 5 Santé : structures, dossier patient, clinique, laboratoire, facturation, portail, tableaux de bord
- [x] Sécurité P0–P3 (MFA, cloisonnement, bris de glace, laboratoire) — 53/53 tests base
- [x] P4 partiel : allergies, doses pédiatriques, portail lien unique, résultats sensibles masqués, remise en main propre, fusion en deux temps, date estimée, téléphone international
- [x] E-mails d'authentification déployés (notify.g-sante.app)

## Étape 1 — Corriger les blocages vus en test (priorité)
- [x] Activer automatiquement les modules à la création d'une structure (selon son type) — `sante_creer_structure` branchée sur l'onboarding (à valider à l'écran)
- [x] Rôle par défaut du créateur : administrateur + rôle métier choisi à l'onboarding (à valider à l'écran)
- [x] Messages « Accès refusé » explicites (rôle manquant, module inactif, MFA requise) — `src/lib/sante-acces.ts`, appliqué aux écrans Santé
- [ ] Connexion Google : saisir l'identifiant et la clé Google du nouvel espace de travail (action manuelle dans Lovable Cloud › Authentification)

## Étape 2 — Terminer P4 (patient, clinique, portail)
- [x] Fusion en deux temps : **bug corrigé** (0044 écrivait l'audit dans des colonnes inexistantes, aucune fusion ne pouvait aboutir) — migration 0049, tests base écrits (à exécuter : `bun run test:db`), essai à l'écran à faire
- [ ] Vérifier la liste des analyses sensibles avec le biologiste
- [x] Signature du consentement complet à l'écran — 4 textes versionnés (à valider par le juriste/CDP), signataire, signature manuscrite, empreintes SHA-256 (migration 0049)
- [x] Tests du lien unique du portail — écrits dans tests/db (à exécuter)

## Étape 3 — P5 Exploitation
- [x] Stocks pharmacie/réactifs reliés aux consultations et au labo — délivrance en consultation (sortie CUMP + écriture 6031/31x), réactifs consommés par test (FEFO) à la validation technique, alertes (migration 0050)
- [x] Personnel : plannings, gardes, lien paie — créneaux sans chevauchement, validation « effectué », forfaits garde/astreinte repris dans le brut du bulletin (migration 0052)
- [x] Rétrocessions aux praticiens — taux par catégorie, retenue à la source, relevé figé, paiement et annulation comptabilisés, sans commission sur prescription (migration 0051)
- [x] Sauvegardes, supervision, journal d'exploitation — contrôle quotidien planifié (6 h 05), tableau de supervision, journal acquittable, export mensuel de la structure (migration 0054)

## Étape 4 — Phase 6 Conformité et qualité
- [ ] Portail : code à usage unique par e-mail — **bloqué** : aucun service d'e-mail transactionnel (Lovable Emails à activer) + vérification DNS du domaine d'envoi
- [~] CORS restreint aux domaines g-sante.app — liste blanche déjà stricte ; g-sante.app et www ajoutés (code fusionné) — **déploiement des fonctions à faire via Lovable**
- [x] Nettoyage du code (P3) — module Santé entièrement typé (≈ 110 erreurs → 0), contournements du typage supprimés (`as any`, `as never`) ; 2 anomalies révélées et corrigées : prescripteur vide sur les analyses prescrites depuis la consultation, dose « 12,5 » refusée
- [ ] Workflows (P2) — reste : sélecteur d'acte santé dans Honoraires (**décision métier** : le comptable ne doit voir ni patient ni libellé d'acte), règles d'ayants droit
- [ ] Audit du document « Module Santé (Cabinet + Laboratoire) »
- [~] Parcours complet testé sur ordinateur et tablette, tous rôles — 13 écrans Santé parcourus le 22/10/2026 (ordinateur + tablette 768 px) : aucune erreur console ; débordement tablette corrigé (Personnel, Stocks, Rétrocessions). Reste : rôles autres qu'administrateur (comptes de test p0-* via `bun run test:db`)
- [ ] Réattribution des rôles réels (retirer « tous les rôles » du compte de test)

## Étape 5 — Mise en service
- [ ] Environnement de préproduction séparé
- [ ] Publication, domaine g-sante.app vérifié
- [~] Formation et documentation utilisateur — guide utilisateur par rôle rédigé le 22/10/2026 (prise en main, rôles, accueil, consultation, laboratoire, caisse, gestion, sécurité, messages d'erreur) : https://claude.ai/artifact/8gUv8ap7VN7oJLWfda53MP — reste : sessions de formation sur site

## Correctifs de sécurité
- [x] 22/10/2026 — `can_write_entreprise` / `can_admin_entreprise` renvoyaient NULL au lieu de false : 7 fonctions comptables ne bloquaient pas un utilisateur sans droit (écriture possible dans le dossier d'un autre). Corrigé (migration 0053), aucune exploitation constatée.
- [x] 22/10/2026 — même piège NULL évité dans les rétrocessions (praticien sans compte).

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
