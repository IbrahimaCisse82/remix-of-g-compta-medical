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
- [x] Cabinet : accueil → consultation → ordonnance → facture → caisse → compta (test automatique ; anomalie corrigée : exercice comptable créé automatiquement)
- [x] Laboratoire : essai écran le 27/10 (compte biologiste) — écrans Laboratoire et Qualité s'ouvrent sans erreur ; anomalie corrigée : entreprise et exercice non chargés dans l'espace santé
- [x] Laboratoire à l'écran (27/10) : demande → identification 2 éléments → prélèvement → réception → analyse → résultat saisi, sans erreur
- [x] Laboratoire à l'écran : validation technique (technicien) → validation biologique → remise avec pièce d'identité
- [x] Corrigé : fiche praticien reliable au compte (« C'est ma fiche »), ajout d'analyses à l'écran, réglage « Laboratoire avec un seul biologiste »
- [ ] Catalogue de départ pour les nouveaux laboratoires (liste + tarifs à fournir par le client)
- [x] Tiers payant à l'écran (27/10, caissier) : facture 80 % IPM → encaissement part patient → envoi → rejet → renvoi → réglé ; corrigé : envoi et rejet bloqués
- [x] Stocks : écran Qualité & réactifs (réceptions, consommations, alertes) ouvert sans erreur le 27/10 ; pharmacie via l'écran Stocks existant
- [x] Plannings & gardes : écran créé et testé à l'écran le 27/10 (ajout d'une plage, marquage effectuée, forfaits garde/astreinte)
- [x] Rétrocessions : écran créé et testé à l'écran le 27/10 (règle 30 %, simulation 10 000 → 3 000, validation, paiement espèces) ; corrigé : le calcul ne créait rien, il y a maintenant simulation puis validation
- [x] Clôture de caisse à l'écran le 27/10 : ouverture fond 20 000, clôture avec écart 0, rapport
- [x] Chaque rôle testé à l'écran (27/10) : médecin/admin (parcours cabinet), biologiste (labo complet), caissier (tiers payant, caisse), secrétaire (patients), comptable (journal) ; corrigé : le comptable et le caissier ne voyaient pas l'entreprise comptable liée (« Entreprise — », journal vide) — lecture ouverte aux rôles à vocation comptable, test ajouté (65 tests DB)
- [x] Impressions A4 avec NINEA/RCCM (27/10) : ordonnances, certificats, comptes rendus (QR de vérification), étiquettes code-barres, relances organismes déjà en place ; facture réécrite en vrai document A4 (en-tête structure, lignes détaillées, totaux, règlements, pied NINEA/RCCM) et rapport de clôture de caisse complété — testée à l'écran

## Sprint 3 — Préparer la livraison (2 jours)
- [ ] Import de relevés CSV/TSV et rapprochement bancaire persistant : contrôles de fichier, suggestions, rapprochement manuel, annulation, droits comptables et recette.
- [x] Inventaire de préparation (27/10, 22:34 UTC) : 65 structures dont 63 portant un marqueur test/essai/recette/parcours/P0 ; 64 comptes @gsante.test ; 3 adhésions actives avec plus de deux rôles. Les marqueurs ne prouvent pas que les données sont supprimables.
- [ ] Retirer « tous les rôles » et attribuer les rôles réels — attend la confirmation des fonctions de chaque personne ; aucune permission retirée automatiquement
- [ ] Isoler les données de test sans effacer les dossiers, audits ni écritures ; créer la structure du client — attend l'identification de la structure à livrer et une stratégie de conservation validée
- [ ] Publier sur g-sante.app, vérifier le domaine — attend une demande explicite de publication et la levée des points bloquants
- [x] Recette automatique relancée le 27/10 : 140 tests métier + 65 tests base réussis
- [x] Contrôle rapide de sécurité le 27/10 : une information sur la lecture publique des plans d'abonnement (catalogue commercial), aucune alerte critique de ce contrôle ; ne constitue pas une validation de sécurité complète
- [x] Analyse approfondie terminée le 27/10 : 10 avertissements (5 injections dans les impressions/rapports, 2 injections de formules dans les exports, 3 liens de fichiers restant utilisables après révocation)
- [ ] Examiner et corriger ces 10 avertissements, tester chaque protection et refaire le contrôle avant validation de livraison
- [ ] Corriger les bibliothèques signalées par le contrôle des dépendances (ws, DOMPurify/fflate, routeur, lodash, Zod), puis relancer tests et contrôle ; aucune mise à jour appliquée dans cette étape
- [x] Guide de prise en main et procédure de livraison rédigés : `docs/livraison/guide-utilisateur.md`, `docs/livraison/checklist.md`
- [ ] Formation réalisée, guide remis et procès-verbal de recette signé par le client
- [ ] Autorisation CDP et revue juridique avant toute mise en service avec de vrais patients — statut actuel à confirmer avec la structure (la note de conformité ne prouve pas l'obtention)

- [ ] Passage d'année : ouvrir l'exercice suivant au 1er janvier (sinon la compta santé se met en attente)

## Après livraison (selon tiers externes)
- [ ] SMS Twilio (compte payant + Sender ID G-SANTE)
- [ ] E-mails praticien/patient : domaine notify.g-sante.app déjà configuré dans l'historique ; vérifier les parcours de notification et la réception réelle, ne pas confondre e-mails de connexion et notifications métier
- [ ] DGID e-facturation réelle
- [ ] Validations juriste/CDP, expert-comptable, biologiste

## Écartés
- Hospitalisation & lits ; liaison directe automates ASTM/HL7 (import fichier seulement)
