# Sauvegarde et restauration — G-Santé ERP

Mise à jour : 31 octobre 2026. À valider avec chaque structure avant la mise en service (lot 6 du plan de finalisation).

## Ce qui est sauvegardé, et par qui

| Niveau | Contenu | Fréquence | Responsable | Où |
| --- | --- | --- | --- | --- |
| Plateforme (Lovable Cloud) | Toute la base, y compris le contenu clinique | Sauvegarde automatique de la plateforme (durée de rétention à confirmer avec Lovable selon l'offre) | GROW HUB | Infrastructure de la plateforme |
| Export de la structure (format `g-sante-export-v2`) | Administratif, paramétrage, finances : structure, sites, membres et rôles, patients (identité administrative), assurances, praticiens, actes, analyses, paramètres et valeurs de référence, textes de consentement, organismes, conventions, bons, factures, encaissements, remboursements, sessions de caisse, règlements et rejets d'organismes, réactifs et lots, dispensations, plannings, rétrocessions, écritures transmises à la comptabilité, journal d'exploitation | Au moins une fois par mois (alerte dans Paramètres › supervision au-delà de 31 jours) | Administrateur de la structure | Fichier JSON conservé hors ligne (clé USB chiffrée ou coffre), jamais par e-mail |
| Export d'un dossier patient | Dossier complet d'un patient, tracé | À la demande (droit d'accès, transfert) | Médecin ou administrateur | Remis au patient ou au confrère |

Le contenu clinique (consultations, résultats, ordonnances, documents, signatures) n'est volontairement pas dans l'export de structure : un fichier téléchargé est plus exposé qu'une base protégée, et ce contenu est couvert par la sauvegarde de la plateforme.

## Faire un export (administrateur)

1. Paramètres › Supervision › « Télécharger l'export ».
2. Le message affiché donne les compteurs (patients, factures, analyses, organismes) : les noter dans le registre ci-dessous.
3. Ranger le fichier hors ligne ; supprimer la copie du dossier Téléchargements.

## Restaurer

- **Incident de plateforme ou suppression accidentelle :** GROW HUB demande la restauration à la plateforme à la date voulue, puis contrôle les compteurs avec le dernier export.
- **Reconstitution d'une structure à partir d'un export :** opération faite par GROW HUB, jamais par l'utilisateur ; elle se rejoue d'abord en préproduction.
- **Essai de restauration à faire avant la mise en service :** charger un export dans l'environnement de préproduction (à créer, lot 6) et comparer les compteurs. Tant que cet essai n'est pas fait, la restauration n'est pas prouvée.

## Registre des exports

| Date | Structure | Fait par | Patients | Factures | Lieu de rangement |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

## Incident

En cas de perte ou de fuite d'un export : prévenir GROW HUB le jour même, noter l'incident dans Paramètres › violations de données (délai de notification à la CDP à confirmer par le juriste).
