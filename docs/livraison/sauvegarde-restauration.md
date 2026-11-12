# Sauvegarde et restauration — G-Santé ERP

Mise à jour : 12 novembre 2026. À valider avec chaque structure avant la mise en service (lot 6 du plan de finalisation).

## Ce qui est sauvegardé, et par qui

| Niveau | Contenu | Fréquence | Responsable | Où |
| --- | --- | --- | --- | --- |
| Plateforme (Lovable Cloud) | Toute la base, y compris le contenu clinique | Sauvegarde automatique de la plateforme (durée de rétention à confirmer avec Lovable selon l'offre) | GROW HUB | Infrastructure de la plateforme |
| Export de la structure (format `g-sante-export-v2`) | Administratif, paramétrage, finances : structure, sites, membres et rôles, patients (identité administrative), assurances, praticiens, actes, analyses, paramètres et valeurs de référence, textes de consentement, organismes, conventions, bons, factures, encaissements, remboursements, sessions de caisse, règlements et rejets d'organismes, réactifs et lots, dispensations, plannings, rétrocessions, écritures transmises à la comptabilité, journal d'exploitation | Au moins une fois par mois (alerte dans Paramètres › supervision au-delà de 31 jours) | Administrateur de la structure | Fichier JSON conservé hors ligne (clé USB chiffrée ou coffre), jamais par e-mail |
| Sauvegarde automatique chiffrée (GitHub Actions, `.github/workflows/sauvegarde.yml`) | Toute la base : rôles, structure, données, contenu clinique compris (pas les fichiers déposés dans le stockage) | Chaque nuit à 2 h 15, conservée 30 jours | GROW HUB | Onglet Actions du dépôt › Sauvegarde › « Artifacts », chiffrée : illisible sans la clé privée |
| Export d'un dossier patient | Dossier complet d'un patient, tracé | À la demande (droit d'accès, transfert) | Médecin ou administrateur | Remis au patient ou au confrère |

Le contenu clinique (consultations, résultats, ordonnances, documents, signatures) n'est volontairement pas dans l'export de structure : un fichier téléchargé est plus exposé qu'une base protégée, et ce contenu est couvert par la sauvegarde de la plateforme.

## Sauvegarde automatique chiffrée

- **Chiffrement :** clé publique `scripts/sauvegarde/cle-publique.txt` (outil `age`). La clé privée est remise à GROW
  HUB une seule fois et conservée hors ligne (clé USB chiffrée et coffre, deux copies). Sans elle, aucune sauvegarde
  ne peut être relue : la perdre, c'est perdre les sauvegardes ; la divulguer, c'est exposer toutes les données.
- **Mise en route (une fois, par le propriétaire du dépôt) :** Settings › Secrets and variables › Actions ›
  New repository secret `PROD_DATABASE_URL` = chaîne de connexion de la base de production (Supabase › Connect ›
  « Session pooler », mot de passe inclus). Tant que ce secret manque, l'exécution de la nuit s'arrête avec un
  avertissement. Sur Lovable Cloud, la chaîne de connexion n'est pas fournie : la sauvegarde nocturne démarre avec
  la bascule vers le projet Supabase G-Santé.
- **Contrôle :** l'exécution échoue (croix rouge, e-mail de GitHub au propriétaire) si la copie compte moins de
  100 tables ou si la table des patients manque.
- **Relire une sauvegarde :** télécharger l'artifact, puis
  `age -d -i cle-privee-sauvegardes-g-sante.txt g-sante-production-AAAA-MM-JJ-HHMM.tar.gz.age | tar -xz`
  → `roles.sql`, `structure.sql`, `donnees.sql`, `empreintes.sha256` (vérifier : `sha256sum -c empreintes.sha256`).
- **Restaurer dans un projet Supabase vierge :**
  `psql "$URL" -f roles.sql -f structure.sql -c 'SET session_replication_role = replica' -f donnees.sql`.

## Faire un export (administrateur)

1. Paramètres › Supervision › « Télécharger l'export ».
2. Le message affiché donne les compteurs (patients, factures, analyses, organismes) : les noter dans le registre ci-dessous.
3. Ranger le fichier hors ligne ; supprimer la copie du dossier Téléchargements.

## Restaurer

- **Incident de plateforme ou suppression accidentelle :** GROW HUB demande la restauration à la plateforme à la date voulue, puis contrôle les compteurs avec le dernier export.
- **Reconstitution d'une structure à partir d'un export :** opération faite par GROW HUB, jamais par l'utilisateur ; elle se rejoue d'abord en préproduction.
- **Essai de restauration de l'export (fait le 12/11/2026, base de test) :** export de la structure de test
  « TEST P0 A » (143 patients, 1 095 factures, 347 encaissements, 1 536 événements comptables, 2,8 Mo), rechargé par
  `scripts/sauvegarde/restaurer-export.sql` dans une nouvelle structure (identifiants renouvelés, original intact).
  Résultat : 43 rubriques, **0 écart** de nombre de lignes ; totaux identiques (factures 4 685 000 F, encaissements
  1 597 000 F) ; toutes les lignes, factures et encaissements rattachés à leur facture et à leur patient ; 11 membres
  et leurs rôles ; numéros de facture conservés ; la numérotation reprend à la suite (nouveau dossier P2026-000144
  après P2026-000143). À refaire à chaque changement du format d'export, et une fois par an.
- **Essai de restauration de la sauvegarde complète :** à faire sur un projet vierge à la bascule (voir ci-dessus).

## Registre des exports

| Date | Structure | Fait par | Patients | Factures | Lieu de rangement |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

## Incident

En cas de perte ou de fuite d'un export : prévenir GROW HUB le jour même, noter l'incident dans Paramètres › violations de données (délai de notification à la CDP à confirmer par le juriste).
