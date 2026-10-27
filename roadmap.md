# Plan de livraison G-Santé ERP
Mise à jour : 27 octobre 2026 (d'après l'historique du code et la base)

## Déjà fait (vérifié dans le code)
- [x] Comptabilité SYSCOHADA complète, environnement unique Santé + compta
- [x] Sécurité P0–P3 (MFA, cloisonnement, bris de glace, laboratoire)
- [x] P4 : allergies, doses pédiatriques, portail lien unique, résultats sensibles masqués, fusion deux temps, consentement signé
- [x] P5 : stocks pharmacie/réactifs, plannings/gardes/paie, rétrocessions, supervision, sauvegarde
- [x] Tablette/ordinateur, accès serveur restreint à g-sante.app, guide utilisateur
- [x] Création atomique structure + patient (22/10)

## Sprint 1 — Stabiliser (2 à 3 jours)
- [x] 7 factures bloquées : viennent de la structure de test sécurité « TEST P0 A », volontairement sans entreprise (aucune structure réelle concernée)
- [x] Alerte visible quand une facture ne passe pas en comptabilité (déjà présente, message clarifié)
- [x] Messages « Accès refusé » explicites dans tous les écrans (traduction centrale + test)
- [x] Connexion Google testée avec un vrai compte (confirmé par Ibou le 27/10)
- [x] Tous les tests relancés le 27/10 : 140 métier + 60 sécurité, tous verts

## Sprint 2 — Recette par parcours (3 à 4 jours)
- [ ] Cabinet : accueil → consultation → ordonnance → facture → caisse → compta
- [ ] Laboratoire : demande → prélèvement → résultats → validation → portail
- [ ] Tiers payant : prise en charge → facture organisme → règlement → lettrage
- [ ] Stocks, plannings, rétrocessions, clôture de caisse
- [ ] Chaque rôle testé (médecin, secrétaire, biologiste, caissier, comptable, admin)
- [ ] Impressions A4 (factures, ordonnances, comptes rendus) avec NINEA/RCCM

## Sprint 3 — Préparer la livraison (2 jours)
- [ ] Retirer « tous les rôles » du compte de test, attribuer les rôles réels
- [ ] Nettoyer les données de test, créer la structure du client
- [ ] Publier sur g-sante.app, vérifier le domaine
- [ ] Analyse de sécurité finale
- [ ] Formation + guide utilisateur remis au client

## Après livraison (selon tiers externes)
- [ ] SMS Twilio (compte payant + Sender ID G-SANTE)
- [ ] E-mails praticien/patient (domaine d'envoi)
- [ ] DGID e-facturation réelle
- [ ] Validations juriste/CDP, expert-comptable, biologiste

## Écartés
- Hospitalisation & lits ; liaison directe automates ASTM/HL7 (import fichier seulement)
