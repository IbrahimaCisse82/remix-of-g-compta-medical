# Back-office de la plateforme G-Santé

Espace `/admin`, réservé aux opérateurs de la plateforme (équipe Grow Hub). Feuille de route : document
« G-Santé ERP — Feuille de route : pilote gratuit puis mise en service commerciale ».

## Règles
- Un opérateur est inscrit dans `plateforme_operateurs` (rôle `proprietaire` ou `operateur`).
- Toute fonction du back-office exige `est_operateur()` : opérateur actif ET session en double authentification (aal2).
- Aucune lecture directe des tables `plateforme_*` depuis l'application ; tout passe par des fonctions serveur.
- Chaque action est inscrite dans `plateforme_audit` (ajout seul : ni modification ni suppression, même avec la clé de service).
- Aucune donnée médicale n'est exposée au back-office.

## Premier propriétaire (une seule fois, par l'équipe technique)
Le compte doit exister (créé depuis l'application). Puis, dans l'éditeur SQL de la production :

```sql
insert into public.plateforme_operateurs(user_id, role)
select id, 'proprietaire' from auth.users where lower(email) = lower('<adresse du propriétaire>');
```

Ensuite, le propriétaire se connecte, ouvre `/admin`, active la double authentification et ajoute les autres
opérateurs depuis l'écran « Opérateurs ».

## Modules
| Module | Lot | État |
| --- | --- | --- |
| Opérateurs, Journal d'audit | Socle (0114) | Livré |
| Retours pilotes, Tableau de bord, Clients, Utilisateurs, Support | Pilote | À venir |
| Plans, Abonnements, Encaissements, Relances | Commercial | Après le pilote |
