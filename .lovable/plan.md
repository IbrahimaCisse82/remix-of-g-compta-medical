# Phase 0 — Fondation de G-Santé

## Résultat attendu
Transformer le socle actuel en G-Santé et livrer uniquement la phase 0 du document fourni : une base sécurisée pour cabinets, laboratoires et structures mixtes, prête à accueillir les dossiers patients.

## Ce qui sera construit
- Remplacer l’identité visible G-Compta par G-Santé sur l’accueil, la connexion et l’espace principal.
- Introduire trois identités médicales sélectionnables par structure :
  1. **Clinique** — bleu clinique et turquoise, sobre et lisible.
  2. **Laboratoire** — cyan et émeraude, plus technique.
  3. **Urgences** — bleu médical avec accents corail réservés aux alertes.
- Conserver le mode sombre par défaut et le mode clair dans chacun des trois thèmes.
- Créer le parcours : compte → structure → type cabinet/laboratoire/mixte → coordonnées légales → sites → invitations avec rôle obligatoire.
- Mettre en place structures, sites, membres, rôles dédiés, invitations, profils sans rôle, journaux d’audit et d’accès, notifications et rattachement des abonnements.
- Appliquer l’isolation stricte par structure, les permissions par rôle, l’absence d’accès sans rôle et l’immutabilité des journaux.
- Préserver les données comptables existantes sans les mélanger aux futures données de santé ; l’export vers G-Compta restera une intégration ultérieure.

## Validation de la phase
- Tester avec plusieurs comptes que la structure A ne voit jamais la structure B.
- Vérifier qu’un compte sans rôle ne peut rien consulter ni modifier.
- Vérifier que les journaux sont alimentés et impossibles à modifier ou supprimer.
- Tester l’accueil, la connexion et le choix des trois thèmes en sombre et clair, sur ordinateur et tablette.
- Exécuter les contrôles automatiques existants pour éviter toute régression.

## Détails techniques
- Les rôles restent dans une table séparée et sont vérifiés côté serveur.
- Chaque nouvelle table publique reçoit ses droits explicites, l’isolation des lignes et ses règles d’accès dans la même migration.
- Les fonctions sensibles utilisent une exécution sécurisée et un chemin de recherche explicite.
- Le thème choisi est enregistré au niveau de la structure ; une préférence locale sert uniquement avant connexion.
- Les couleurs passent par les variables sémantiques du système visuel, jamais par des couleurs dispersées dans les écrans.

## Limite de cette livraison
Les dossiers patients et les fonctions cabinet/laboratoire des phases 1 à 6 ne seront pas commencés avant validation de la phase 0, conformément au document fourni.
