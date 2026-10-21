# G-Santé ERP

ERP dédié aux structures de santé du Sénégal (cabinets médicaux, cliniques, laboratoires, structures mixtes), avec la comptabilité SYSCOHADA intégrée (ex-G-Compta). Éditeur : GROW HUB SARL.

- Production : https://g-sante.app
- Feuille de route détaillée : [`roadmap.md`](roadmap.md)
- Règles d'architecture : [`AGENTS.md`](AGENTS.md)
- Rapports sécurité : `docs/securite/P0..P3-rapport.md` · Conformité : `docs/conformite-donnees-sante.md`

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
