# G-Santé ERP

ERP dédié aux structures de santé du Sénégal (cabinets médicaux, cliniques, laboratoires, structures mixtes), avec la comptabilité SYSCOHADA intégrée (ex-G-Compta). Éditeur : GROW HUB SARL.

- Domaine cible de livraison : https://g-sante.app (publication et disponibilité à vérifier)
- Feuille de route détaillée : [`roadmap.md`](roadmap.md)
- Règles d'architecture : [`AGENTS.md`](AGENTS.md)
- Rapports sécurité : `docs/securite/P0..P3-rapport.md` · Conformité : `docs/conformite-donnees-sante.md`
- Livraison : [`checklist`](docs/livraison/checklist.md) · [`guide utilisateur`](docs/livraison/guide-utilisateur.md)

## État de livraison — 27 octobre 2026

Sprint 3 en cours, pas encore de validation de mise en production. Dernière recette : **140 tests métier et 65 tests base réussis**. L'analyse approfondie de sécurité a relevé **10 avertissements** sur les impressions, exports et liens de fichiers après révocation ; le contrôle des dépendances signale également des bibliothèques à corriger. Les rôles réels, la structure cliente, la conservation des données de test et les formalités CDP restent à confirmer ; voir la checklist pour les critères de décision.

## Modules

**Santé (menu principal)**
- Structures, sites, membres, rôles (admin, médecin, biologiste, technicien, préleveur, secrétaire, caissier, comptable, lecteur, tiers payant), invitations, audit.
- Dossier patient : doublons, fusion en deux temps annulable, date de naissance estimée, téléphone international, consentement, documents, journal d'accès, bris de glace.
- Clinique : agenda, file d'attente, consultation verrouillée + addenda, constantes, ordonnance A4 (contrôle allergies et doses pédiatriques), certificats.
- Laboratoire : catalogue, valeurs de référence, prélèvement, double validation, CQ Westgard, réactifs, compte rendu A4 + QR vérifiable, remise en main propre.
- Facturation : factures immuables, avoirs, tiers-payant, caisse, Mobile Money, bordereaux, écritures comptables automatiques.
- Portail patient (lien unique / code SMS), rappels SMS, tableaux de bord.

**Comptabilité SYSCOHADA** : plan comptable, saisie/validation, journal, grand livre, balance, bilan, résultat, TFT, notes annexes, liasse, FEC, lettrage, rapprochement, TVA, immobilisations, provisions, paie, stocks, budget, analytique, clôture, mode Cabinet.

## Sécurité
Isolation par structure (RLS), rôles côté serveur, MFA TOTP imposée en base, accès clinique limité (relation de soin), journaux immuables.

## Stack
React 18 + Vite + TypeScript + Tailwind, Lovable Cloud (base, authentification, fonctions, stockage), Twilio (SMS).

## Développement
```sh
npm i
npm run dev        # application
bun run test       # tests métier (Vitest)
bun run test:db    # tests sécurité base (comptes p0-*@gsante.test)
```

**Attention aux tests base :** ils écrivent des comptes, structures, dossiers, factures et écritures persistants. Cette instance sert la prévisualisation et la version publiée. Ne pas les relancer après livraison sur des données réelles sans environnement de recette isolé et procédure validée. Ne pas supprimer les écritures, les dossiers ou leurs audits pour « nettoyer » les tests : la conservation comptable est de 10 ans et les contraintes d'audit doivent être préservées.
