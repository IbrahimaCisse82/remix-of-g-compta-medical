# P1 — Cloisonnement, besoin d'en connaître, bris de glace, conformité technique (5 octobre 2026)

Tests base : **31/31 verts**, matrice d'accès : **aucun écart** (désormais bloquant). Tests unitaires 132/132.

## P1.1 Cloisonnement comptable / clinique — FAIT (avec réserve)
- Comptable et lecteur : plus aucune lecture des lignes de facture (libellés d'actes/analyses) ni de l'identité patient. Vue agrégée `sante_ventes_par_categorie` (Analyses / Consultations et actes / Autres).
- Écritures santé : libellé = n° de facture/encaissement ; le nom du patient n'est plus transmis (auxiliaire). Aucune écriture santé existante à corriger (0 en base).
- Nouveau rôle `tiers_payant` (identité + factures pour bordereaux nominatifs), invitable.
- Réserve : FEC, Grand livre, Journal, GED, portail comptable lisent les écritures, qui ne contiennent plus d'identité ; aucune pièce jointe de facture santé n'est versée en GED. Test automatique « parcours de toutes les vues » côté navigateur non fait : la preuve est faite au niveau base (tables sources).

## P1.2 Besoin d'en connaître — FAIT
- Médecin : contenu clinique uniquement si relation de soin (RDV avec son praticien, consultation menée/créée, demande prescrite) ; option structure « accès à tous les dossiers », désactivée par défaut.
- Biologiste : patients ayant une demande labo. Technicien/préleveur : périmètre labo. Secrétaire : identité, agenda, couverture, facturation ; plus les demandes labo. Caissier : facturation. Admin structure : identité, facturation, journaux, aucun contenu clinique hors bris de glace.
- Facturation : médecins et biologistes n'y ont plus accès.

## P1.3 Bris de glace — FAIT
- Motif codé (5 motifs) + justification ≥ 20 caractères ; 1 h ; renouvellements plafonnés par 24 h (paramétrable, défaut 2) ; alerte si seuil hebdomadaire dépassé (défaut 3).
- Revue obligatoire par un autre administrateur, avec commentaire ; escalade automatique horaire après 72 h ; export CSV pour le responsable protection des données.

## P1.4 Conformité technique — FAIT (contenus juridiques à compléter)
- Registre des traitements exportable (modèle pré-rempli à valider). Consentements : colonne texte ajoutée (texte + version + date + preuve).
- Droit d'accès : export dossier JSON + version imprimable A4, tracé dans le journal des accès.
- Violations : détection → qualification → notification → clôture, échéance 72 h signalée.
- Conservation par type de document (défaut 20 ans, **à confirmer**), suppression bloquée avant échéance, purge contrôlée tracée.
- Page « Hébergement et sous-traitance » (contenu à compléter par vous).

## Reste / décisions
- Valeur par défaut de conservation et contenus du registre/hébergement : juriste.
- Consentements : l'écran de recueil n'enregistre pas encore le texte intégral (colonne prête).
