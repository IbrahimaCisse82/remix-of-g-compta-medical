# Plan de livraison G-Santé ERP
Mise à jour : 31 octobre 2026

## Plan de finalisation (31/10) — livraison cible 30/11/2026
Plan détaillé : https://claude.ai/artifact/LgypZNrvjZCinpMdBUxv1W
- [x] Lot 1 — Catalogue SOLABSEN : fiche analyse branchée sur Catalogue & tarifs (paramètres, valeurs de référence, case « résultat sensible »), avancement de la validation et filtres (PR #12). Reste : saisie et activation par le biologiste.
- [x] Lot 2 — Écrans manquants reconstruits (PR #13) : délivrance en consultation, alertes de stock et consommation de réactifs par analyse, plannings rattachés aux salariés + primes de garde dans le bulletin, supervision/journal/export + alerte de passage d'année.
- [ ] Lot 3 — Paramétrage réel SOLABSEN et KAMAANO (données clients).
  - [x] Outil : import tableur des paramètres et valeurs de référence du catalogue + activation groupée (PR #15, migration 0080).
  - [x] Outils : invitations de l'équipe et actes/tarifs importables depuis un tableur ; invitations contrôlées en base (MFA, rôle compatible, sans doublon — PR #17, migration 0081).
  - [ ] Données : rôles réels, MFA, catalogues, références biologiques, organismes, consentements.
- [ ] Lot 4 — Recette métier avec les utilisateurs réels. Cahier de recette (29 scénarios, fiche d'anomalie, PV) : https://claude.ai/artifact/WVqxYZJgx3j5CKMMqCsGuq
- [ ] Lot 5 — Comptabilité SYSCOHADA : visa expert-comptable.
- [ ] Lot 6 — Mise en service (DNS e-mails, préproduction, sauvegarde/restauration, publication, formation, PV, CDP).

## Checklist des éléments restants — modules santé
Suivi de la liste transmise le 29/10. Une case cochée indique un élément finalisé et déjà vérifié ; les validations réelles non obtenues restent ouvertes. Cette mise à jour du suivi ne constitue pas une nouvelle recette ni une certification.
- [ ] Demande du 29/10 à 00:25 (relancée le 30/10) : conventions tiers payant terminées et testées le 30/10. Reste les e-mails métier : domaine notify.g-sante.app toujours « en attente » DNS au 30/10 13:15 — attend l'ajout des enregistrements DNS chez le fournisseur du domaine, puis le choix des notifications à envoyer.

### Structure, sites et équipe
- [x] Créer les espaces réels SOLABSEN SARL et LE MEDICAL KAMAANO SUARL et leurs comptes administrateurs compatibles.
- [x] Sauvegarder automatiquement la configuration, reprendre après connexion et vérifier l’isolation des deux entreprises.
- [ ] Faire terminer la configuration réelle par chaque administrateur : coordonnées, mentions légales et paramètres.
- [ ] Confirmer les fonctions des collaborateurs et attribuer leurs rôles réels ; activer la MFA des administrateurs.

### Dossiers patients
- [x] Vérifier création, modification, fusion/restauration, documents et consentement signé.
- [x] Bibliothèque des textes de consentement (31/10, migration 0079) : l’administrateur (MFA) enregistre une fois chaque texte validé et versionné, sans modification possible ensuite (archivage + nouvelle version) ; le soignant choisit le texte dans une liste, type/version/texte/empreinte repris du modèle par le serveur ; saisie libre conservée seulement si la bibliothèque est vide. 16 cas vérifiés en base (transaction annulée), 6 tests API écrits, 7 tests unitaires.
- [ ] Obtenir les textes de consentement validés et les règles de conservation approuvées. — à saisir ensuite dans Paramètres › Bibliothèque des textes de consentement.

### Agenda et consultations
- [x] Vérifier rendez-vous, anti-chevauchement, sauvegarde/clôture et addendum.
- [ ] Faire valider les documents et pratiques par les soignants.

### Laboratoire et catalogue réel
- [x] Vérifier le parcours jusqu’à la remise, les résultats typés et les corrections historisées.
- [x] 31/10 : nomenclature SOLABSEN 2022 importée dans le catalogue réel de SOLABSEN (192 analyses désactivées « à valider », tarif particulier + 576 tarifs des grilles 2022 Société/Assurance, IPM, Hôpital ; section provisoire biochimie, aucun paramètre ni référence inventés).
- [ ] Confirmer les tarifs 2022, corriger sections, ajouter paramètres/unités/valeurs de référence/tubes, puis activer les analyses validées ; rattacher les grilles aux vrais organismes.
- [ ] Obtenir la validation du biologiste sur ces données et le parcours réel.

### Catalogue Labotest
- [x] Intégrer les 192 lignes de démonstration, la recherche et les quatre grilles en lecture seule, sans modifier les catalogues réels.
- [ ] Valider séparément le catalogue réel du laboratoire ; la démonstration ne remplace pas cette validation.

### Qualité et réactifs
- [x] Vérifier réception, consommation concurrente, péremption, contrôle qualité, EEQ et clôture des non-conformités.
- [ ] Faire approuver les paramètres et procédures par le laboratoire.

### Facturation et caisse
- [x] Vérifier facture, encaissement, avoir, remboursement, comptabilisation et clôture sans écart.
- [ ] Confirmer les tarifs réels, mentions légales et règles fiscales avec la structure et son conseil.

### Tiers payant
- [x] Vérifier organismes, couverture, ventilation patient/organisme, règlements partiels et historique.
- [x] Partager les ajouts au répertoire entre SOLABSEN et KAMAANO sans partager conventions, patients ou finances.
- [x] Renforcer les rejets, exclure les factures annulées des bordereaux et tester la bascule du reliquat vers le patient.
- [x] Recette technique des conventions (30/10) : conventions expirées ou futures n'appliquent plus leur franchise/plafond, exclusion, combinaison franchise + plafond + remise + plafond assurance, assurance expirée refusée, bon de prise en charge verrouillé contre deux factures simultanées et bon épuisé ne couvrant plus rien. 6 tests API + 19 tests de non-régression réussis.
- [ ] Recette avec les conventions réelles des organismes clients (taux, plafonds, exclusions) — attend leurs conventions signées.

### Import des règlements organismes
- [x] Vérifier import, rapprochement, confirmation explicite, enregistrement atomique et réimport sans doublon à l’écran.
- [ ] Tester les formats de relevés réellement utilisés par les organismes clients.

### Balance âgée
- [x] Vérifier les tranches 0–30, 31–60, 61–90 et plus de 90 jours, les totaux et le classement des cinq principaux débiteurs.
- [ ] Faire rapprocher les soldes d’ouverture et créances réelles par le responsable financier.

### Portail patient et e-mails
- [x] Tester lien à usage unique, expiration, session et révocation des liens et sessions ; renforcer le contrôle de remise en ligne.
- [x] Vérifier le journal des e-mails réservé aux administrateurs de leur structure.
- [ ] Compléter la recette finale de remise en ligne avec les conditions métier réelles.
- [ ] Vérifier la validation du domaine notify.g-sante.app, raccorder les notifications métier et prouver leur réception réelle.

### Plannings, gardes et rétrocessions
- [x] Vérifier les gardes intermois, refus de chevauchement concurrent et forfaits FCFA entiers.
- [x] Tester calcul, validation, paiement, refus du double paiement et annulation d’une rétrocession validée non payée.
- [ ] Terminer la recette complète avec les règles réelles de garde, rémunération et annulation approuvées par la structure.

Les modules avec des cases ouvertes ne sont pas finalisés pour une mise en service réelle. Twilio/SMS et abonnements commerciaux restent exclus.

## Livraison module par module — périmètre décidé par Ibou le 28/10
Twilio/SMS et l’option commerciale abonnement sont exclus de la livraison. Les écritures récurrentes comptables restent dans le périmètre. Aucun historique financier ni droit d’accès ne doit être supprimé pour masquer ces options.
- [x] Retirer les options abonnement et SMS de l’expérience livrée, sans affaiblir les contrôles serveur : offres commerciales masquées, route tarifs retirée, rappels et codes SMS refusés côté serveur (410), lien patient conservé ; historique et protections inchangés.
- [x] 1. Structure, sites et équipe : création, ajout de site, invitation avec lien et acceptation par le destinataire testés à l’écran ; gestion des rôles/suspension/réactivation et révocation des invitations via RPC admin/MFA avec audit et protection du dernier administrateur. 216 tests métier + 15 tests API ciblés réussis. Aucun rôle réel modifié.
- [x] 2. Patients : coordonnées modifiables selon les droits existants, recueil signé du consentement (texte de la structure, accord/refus et empreintes), nettoyage des fichiers sans fiche, fusion/restauration des documents sans déplacement physique. Création → modification → signature → recherche testé à l’écran ; 5 tests API doublons/consentement/fusion/restauration/nettoyage réussis ; un document lié ne peut pas être effacé par ce nettoyage. Texte légal définitif toujours à fournir/valider par la structure.
- [x] 3. Agenda et consultations : durée 45 min relue à l’écran, chevauchements et praticien incompatible refusés côté serveur ; échec d’enregistrement bloque désormais la clôture. Rendez-vous → arrivée → consultation → échec simulé → sauvegarde/clôture → addendum testé à l’écran ; ordonnance/facture/caisse/compta validées par les 5 tests du parcours cabinet, 4 tests agenda et 3 tests clôture ajoutés. 219 tests métier réussis. Validation clinique des documents reste professionnelle.
- [ ] 4. Laboratoire/catalogue : parcours technique corrigé et vérifié à l’écran le 28/10 : création atomique analyse + paramètre → demande → identification/prélèvement → sous-traitance/retour reçu → saisie → validation technique/biologique → rectificatif v2 avec alerte traitement → remise relue. Rectificatif débloqué sans ouvrir les demandes validées aux modifications directes ; verrou transactionnel/MFA, historique et empreinte conservés. Résultats texte respectés, nombres non finis refusés et saisies simultanées dédupliquées. 223 tests métier, 54 tests sécurité et 4 tests API dédiés réussis. Reste bloquant : catalogue, tarifs et références réels à fournir, puis validation du biologiste ; aucune donnée clinique réelle inventée.
- [x] 5. Qualité et réactifs : réception 10,5 mL → consommation 1,5 → solde 9 relu, dépassement refusé et lot périmé exclu à l’écran ; consommation concurrente protégée par verrou serveur, réactif désactivé/MFA/quantité non finie refusés. CQ cible/écart avec virgule, rejet puis retour accepté testés ; absence de CQ configurée « bloquer » effectivement bloquante. EEQ z=4 → non-conformité → action → clôture testés à l’écran ; 4 tests API dédiés et 3 tests numériques réussis. Paramètres et procédure de qualité du laboratoire restent à valider professionnellement.
- [x] 6. Facturation/caisse : facture fictive 10 000 → encaissement → avoir → remboursement affiché sans rechargement → approbation/paiement par formulaire → comptabilisation → clôture fond 5 000, remboursement 10 000, écart zéro et rapport relus à l’écran. Session personnelle filtrée même avec plusieurs caissiers ; mouvements/verrou de clôture synchronisés côté serveur, fonds et montants FCFA entiers, immuables et MFA protégés. 228 tests métier, 54 tests sécurité et 5 tests API caisse réussis. Tarifs, mentions légales et paramétrage fiscal réels restent à confirmer par la structure et son conseil ; aucune certification comptable annoncée.
- [ ] 7. Tiers payant : conventions, prises en charge, rejets et règlements partiels.
- [ ] Demande du 28/10 à 19:32 : tiers payant renforcé (rejet par dialogue, FCFA entiers/MFA, bordereaux sans factures annulées, validation taux/plafond/franchise), règlement 3 000 puis bascule patient 5 000 sans reliquat testé. Plannings chevauchant le mois et verrou anti-course corrigés ; forfaits entiers contrôlés. Rétrocessions paiement/référence, annulation avec motif serveur et erreurs de chargement clarifiés. Portail : révocation de liens/sessions ajoutée, MFA à la création et remise en ligne fail-closed ; lien unique, expiration et révocation testés sur la fonction déployée. 31 tests métier + 26 API réussis ; écran import organismes, garde intermois, rétrocession payée et révocation patient vérifiés. Restent : recette des conventions réelles, catalogue/références biologiques et e-mails métier (aucun modèle ni déclencheur encore branché ; domaine notify.g-sante.app toujours en attente DNS au 28/10 19:32).
- [x] Répertoire partagé activé pour SOLABSEN et KAMAANO : ajouts manuels/CSV propagés atomiquement (nom/type seulement), fiches opérationnelles isolées et réglages locaux conservés. 4 tests API et 6 tests import réussis ; ajout dans un laboratoire de test puis lecture dans le cabinet associé vérifiés à l’écran. Aucun organisme fictif ajouté aux deux structures réelles ; leur répertoire reste à renseigner par les administrateurs.
- [x] Configuration entreprise en trois étapes : brouillon automatiquement sauvegardé par structure/administrateur, reprise après nouvelle connexion vérifiée à l’écran avec coordonnées et étape 2 conservées ; validation finale atomique santé/comptabilité et conflits de révision refusés. Nettoyage des données en mémoire au lancement/changement/déconnexion, écrans rattachés à l’entreprise ; changement direct de lien entreprise étrangère refusé et MFA renforcée sur structures/sites/comptes paramétrés. Deux comptes réels sans adhésion croisée constatés ; 24 tests API de configuration/isolation/création/équipe/répertoire réussis, compilation OK. Aucun renseignement réel modifié.
- [x] Demande du 28/10 à 18:49 : import CSV/TSV (modèle fourni), référence facture ou montant exact non ambigu, choix manuel et confirmation par ligne avant enregistrement atomique. RPC MFA/structure, références dédupliquées et reprise idempotente, fraction/surpaiement/organisme incompatible refusés ; annulation complète si une ligne échoue. Balance âgée existante complétée avec totaux, quatre tranches et top 5 débiteurs. 15 tests métier + 7 API réels réussis (limites 30/31/60/61/90/91, concurrence et doublons). Parcours connecté : import 1 000 FCFA → confirmation → enregistrement → créance 51 000 à 50 000 relue à l’écran ; compilation OK. Une ligne du relevé représente une imputation sur une facture ; pour un virement multif factures, répéter sa référence avec les factures et montants ventilés.
- [ ] Complément confié le 28/10 à 18:45 : import CSV des organismes avec prévisualisation et sans écrasement ajouté, indicateur de validité dans Assurances et recherche des créances âgées existantes ajoutés. 13 tests ciblés réussis, compilation OK. Recette connectée encore à réaliser : session personnelle non disponible et lancement démo resté sur l’accueil. Aucun organisme réel ajouté automatiquement ; liste officielle d’IPM et conventions non inventées.
- [x] Demande du 28/10 à 18:21 : onglet Tiers payant, création organismes selon droits existants, couverture patient avec taux/plafond/validité, facture ventilée par serveur et règlements partiels avec historique et soldes actualisés. Essai connecté isolé : organisme → couverture 80 % → facture 10 000 (patient 2 000 / organisme 8 000) → règlement 3 000 → reste 5 000 et historique relus, sans erreur ; résumé des créances rafraîchi sans doublon. Onglet Labotest en lecture seule, recherche et 4 grilles, AFP IPM 17 600 testé dans une structure non démo sans ajout au catalogue. 20 tests ciblés réussis ; aucune règle serveur de permissions modifiée. L’estimation avant émission ne remplace pas la répartition définitive selon conventions et bons. Recette exhaustive des rejets et validation des conventions réelles restent au module 7.
- [x] Nomenclature Labotest fournie le 28/10 : 192 lignes conservées dans PME 1 uniquement, tarif particulier + 576 tarifs Société/Assurance, IPM et Hôpital ; 14 codes absents et 3 codes répétés préservés avec identifiants par ligne. Création via RPC authentifiée, second lancement sans doublons ; 7 tests réussis et 192 analyses/AFP 20 800 FCFA relues après réouverture à l’écran, sans erreur. Aucun catalogue réel modifié. Section biochimie et délai 24 h purement fictifs ; observation texte sans référence clinique, échantillon/tube/unité non inventés. Ce fichier tarifaire de démonstration ne lève pas la validation professionnelle du module 4.
- [ ] 8. Portail patient et e-mails : remise, expiration, révocation et réception réelle (validation du domaine externe).
- [ ] 9. Plannings, gardes et rétrocessions : bases, calcul, validation, paiement et annulation.
- [ ] 10. Comptabilité SYSCOHADA : poursuivre les corrections ci-dessous ; certification suspendue aux références officielles et au visa professionnel.
- [ ] 11. Banque, stocks/pharmacie, paie, immobilisations, provisions, lettrage, budget et analytique : recette complète de chaque module successivement.
- [ ] 12. Livraison : structure réelle, rôles réels, sauvegarde/restauration, recette client et autorisation de publication.
- [x] SOLABSEN SARL (laboratoire) et LE MEDICAL KAMAANO SUARL (cabinet) créés avec leurs comptes administrateurs désignés, tous rôles compatibles attribués par RPC auditée et entreprise/exercice associés. Connexions réussies, ouverture des deux espaces et refus de lecture croisée vérifiés. Zéro patient, facture ou analyse démo. Restent coordonnées/mentions légales, catalogue/tarifs réels et activation MFA par les administrateurs. Les mots de passe fournis ne sont pas conservés dans le projet et doivent être changés après première connexion.
Un module n’est clos qu’après correction et vérification de ses parcours ; les validations externes restent explicitement bloquantes.

## Déjà fait (vérifié dans le code)
- [x] Environnement unique Santé + compta ; conformité SYSCOHADA complète non démontrée (audit du 28/10)
- [x] Sécurité P0–P3 (MFA, cloisonnement, bris de glace, laboratoire)
- [x] P4 : allergies, doses pédiatriques, portail lien unique, résultats sensibles masqués, fusion deux temps, consentement signé
- [x] P5 : stocks pharmacie/réactifs, plannings/gardes/paie, rétrocessions, supervision, sauvegarde (écrans effacés par la synchronisation du 22/10, reconstruits le 31/10 — PR #13)
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
- [x] Journal des e-mails (28/10) dans Structure & équipe : accès administrateur avec MFA, événements gérés corrélés aux identifiants fournisseur des rappels e-mail existants, filtres et diagnostics, aucun stockage parallèle. 5 tests métier + 4 tests endpoint réel réussis ; écran et actualisation vérifiés avec administrateur connecté. Aucun envoi métier rattaché actuellement ; domaine en vérification et déclencheurs e-mail métier non branchés, donc réception/envoi réel non vérifié. Les e-mails de connexion restent dans Plus → E-mails car ils ne sont pas attribuables à une structure.
- [x] Démonstration PME 1 peuplée (28/10) : 12 patients fictifs, 4 actes, 6 analyses et paramètres fictifs, 6 consultations/factures, 3 encaissements, 4 demandes labo (facturation automatique), 6 rendez-vous, 3 lots de réactifs, 3 plannings, 1 organisme et 1 règle de rétrocession. Second peuplement sans doublons ; patients/factures vérifiés à l’écran et bouton démo testé avec l’origine d’aperçu autorisée ; 2 tests d’isolation réussis ; outbox comptabilisée et écritures équilibrées. Aucune donnée des structures réelles ni rôle existant modifié. Tarifs de démonstration uniquement, sans résultats cliniques validés ni notifications externes.
- [x] Twilio/SMS retiré du périmètre de livraison à la demande d’Ibou le 28/10 ; aucune connexion ni émission à activer.
- [x] Import de relevés CSV/TSV et rapprochement bancaire persistant (27/10) : sélection des colonnes, contrôle dates/montants, doublons bloqués, propositions non ambiguës, rapprochement manuel, annulation et audit. Parcours connecté testé à l'écran avec une écriture de 10 000 FCFA, persistance après réouverture ; 146 tests métier et 70 tests base réussis.
- [x] Menu latéral filtré par type de structure (cabinet/laboratoire/mixte) et par rôle (27/10) : matrice de visibilité centralisée, rôles lus depuis la base à l'entrée dans l'espace santé, protections serveur inchangées ; 19 tests couvrant les 30 combinaisons type × rôle ; vérifié à l'écran avec un caissier (pas de Patients ni saisie comptable) et une secrétaire (pas de caisse ni comptabilité)
- [x] Accès direct aux modules testé en base (27/10) : 225 tests prouvant qu'un utilisateur qui contourne le menu est refusé par la base, pour chaque type de structure × rôle (patients, consultations, demandes d'analyses, factures, comptabilité, journaux d'accès, paramètres, création de patient) ; 292 tests base au total, tous verts
- [x] Tests écran Playwright complets (28/10) : 60 tests du menu par rôle × type de structure (10 rôles × 3 types, sessions réelles) séparés en deux assertions — modules interdits absents (groupes fermés puis ouverts) et modules autorisés visibles après ouverture de leur groupe — + 2 tests d'actualisation (secrétaire → comptable, cabinet → laboratoire, menu mis à jour au rechargement) — 62/62 réussis ; 104 tests d'appels directs aux fonctions serveur par rôle × type également réussis
- [x] Inventaire de préparation (27/10, 22:34 UTC) : 65 structures dont 63 portant un marqueur test/essai/recette/parcours/P0 ; 64 comptes @gsante.test ; 3 adhésions actives avec plus de deux rôles. Les marqueurs ne prouvent pas que les données sont supprimables.
- [ ] Retirer « tous les rôles » et attribuer les rôles réels — attend la confirmation des fonctions de chaque personne ; aucune permission retirée automatiquement
- [ ] Isoler les données de test sans effacer les dossiers, audits ni écritures ; créer la structure du client — attend l'identification de la structure à livrer et une stratégie de conservation validée
- [ ] Publier sur g-sante.app, vérifier le domaine — attend une demande explicite de publication et la levée des points bloquants
- [x] Recette automatique relancée le 27/10 : 140 tests métier + 65 tests base réussis
- [x] Contrôle rapide de sécurité le 27/10 : une information sur la lecture publique des plans d'abonnement (catalogue commercial), aucune alerte critique de ce contrôle ; ne constitue pas une validation de sécurité complète
- [x] Analyse approfondie terminée le 27/10 : 10 avertissements (5 injections dans les impressions/rapports, 2 injections de formules dans les exports, 3 liens de fichiers restant utilisables après révocation)
- [x] 10 avertissements corrigés (28/10) : échappement HTML systématique (escapeHtml) dans toutes les impressions et exports (bordereaux, relances, bilan/CR/TFT, DSF + annexes) ; protection anti-formules dans tous les exports CSV ; liens du portail client avec expiration (expire_le) et URL signées réduites à 60 s ; révocation des fichiers patients prouvée par test (plus aucune URL signée après retrait du rôle) ; 172 tests unitaires + 397 tests base réussis, avertissements clos dans le contrôle de sécurité
- [x] Bibliothèques corrigées (28/10) : zod 4.6.6, react-router-dom 7.18.2, recharts 3.10.1, @supabase/supabase-js 2.118.0, jspdf supprimé (inutilisé) — plus aucune vulnérabilité connue sur les 55 dépendances ; 172 tests unitaires et tests écran (connexion + navigation) réussis après mise à jour
- [x] Guide de prise en main et procédure de livraison rédigés : `docs/livraison/guide-utilisateur.md`, `docs/livraison/checklist.md`
- [ ] Formation réalisée, guide remis et procès-verbal de recette signé par le client
- [ ] Autorisation CDP et revue juridique avant toute mise en service avec de vrais patients — statut actuel à confirmer avec la structure (la note de conformité ne prouve pas l'obtention)

- [ ] Passage d'année : ouvrir l'exercice 2027 avant le 1er janvier (alerte affichée dans Paramètres › supervision depuis le 31/10)

## Remise en conformité SYSCOHADA — demande du 28 octobre 2026
- [x] Corrections chiffrées résultat et bilan, rabais, signes, amortissements, 6812 ; premiers correctifs TFT sans réécriture historique. Tests de non-régression ajoutés.
- [x] Référentiel fourni conservé et chargé en Cloud : 1 422 comptes, 119 mappings ; 84 lignes à valider, états provisoires et clôture serveur bloquée avant visa.
- [x] Comptabilisation TVA transactionnelle paramétrée ; dates, pièces, montants entiers, équilibre différé et MFA protégés en base. Rapport technique : `docs/syscohada/controle-2026-10-28.md`.
- [x] Recette technique finale : 208 tests métier et 406 tests API réussis, compilation OK ; états contrôlés à l’écran avec une session dédiée et une vente comptabilisée.
- [ ] TFT complet et retraitements non monétaires — attend les affectations par nature et les pièces justificatives nécessaires aux flux complexes ; aucune ventilation inventée.
- [ ] Clôture complète atomique avec résultat en 131/139, reports et réouverture cohérente — attend les règles d'affectation validées ; ancien report client supprimé, clôture suspendue.
- [ ] Notes, maquettes SN/SMT, Excel et contrôles C09–C14 — attend les imprimés normalisés et règles officielles manquantes ; notes vides et 8A obsolète exclues de l'export.
- [ ] Recette officielle Application 127 — attend les balances du Guide pages 343–350 et les imprimés officiels.
- [ ] Validation normative — attend la revue des mappings « à valider » et le visa d’un expert-comptable.

## Après livraison (selon tiers externes)
- Twilio/SMS et abonnement commercial : exclus, ne pas réactiver sans nouvelle demande.
- [ ] E-mails praticien/patient : domaine notify.g-sante.app déjà configuré dans l'historique ; vérifier les parcours de notification et la réception réelle, ne pas confondre e-mails de connexion et notifications métier
- [ ] DGID e-facturation réelle
- [ ] Validations juriste/CDP, expert-comptable, biologiste

## Écartés
- Hospitalisation & lits ; liaison directe automates ASTM/HL7 (import fichier seulement)
