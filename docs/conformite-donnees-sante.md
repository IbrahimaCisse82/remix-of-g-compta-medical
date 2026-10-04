# G-Santé ERP — Note de conformité données de santé (v1, 4 octobre 2026)

À faire valider par un juriste avant tout déploiement avec de vrais patients.

## 1. Formalités préalables (CDP, Sénégal — loi 2008-12)
- Le traitement de données de santé exige une **demande d'autorisation auprès de la CDP** avant mise en service.
- Responsable : chaque structure cliente (responsable de traitement) ; GROW HUB SARL agit comme sous-traitant.
- État : **non engagée** — action organisationnelle à mener par la structure et l'éditeur.

## 2. Consentement patient
- Enregistré automatiquement à la création de chaque dossier (type `traitement_donnees`, version `v1-2026`, horodatage, mode de recueil), par la base et non par l'écran.
- Consultable dans la fiche patient, onglet Consentements.
- Reste : consultation par le patient lui-même via le futur portail patient.

## 3. Registre des violations
- Registre en place (Structure & équipe → « Registre des violations de données »).
- Tout membre déclare, seul l'administrateur lit et marque la notification CDP ; chaque ajout est journalisé.
- Procédure : déclarer immédiatement, évaluer le risque, notifier la CDP et les personnes concernées si nécessaire.

## 4. Accès d'urgence (« bris de glace »)
- Chaque ouverture de dossier est tracée (journal d'accès) et chaque modification est auditée.
- Reste : un accès hors habilitation avec motif obligatoire et alerte à un responsable n'existe pas encore ; aujourd'hui, aucun accès hors habilitation n'est possible.

## 5. Conservation
- Comptabilité : 10 ans (OHADA).
- Dossier médical : durée distincte à fixer par le juriste (souvent 20 ans après le dernier passage). Aucune purge automatique pour l'instant ; aucune suppression de dossier n'est possible.
- Les exports comptables issus de la facturation santé ne contiennent ni diagnostic ni résultat : seulement le n° de dossier et le nom du patient (compte auxiliaire).

## 6. Droits d'accès et de rectification
- Sur demande, la structure imprime le dossier ; la rectification se fait par addendum ou rectificatif versionné (l'original est conservé).
- Reste : demande en ligne via le portail patient (phase 2).
