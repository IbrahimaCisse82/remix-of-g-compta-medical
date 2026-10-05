# P0 — Prouver et durcir la sécurité : rapport de phase (5 octobre 2026)

## P0.1 Suite de tests de base — PARTIEL
- `tests/db/securite.db.test.ts` (lancement : `bun run test:db`) : 16 tests, **16 verts**.
- Comptes de test dédiés `p0-*@gsante.test` dans deux structures fictives « TEST P0 A » et « TEST P0 B » (hors démo), mots de passe aléatoires à chaque exécution.
- Choix technique : pgTAP est disponible mais le rôle de l'agent ne peut pas endosser le rôle `authenticated` ; les tests passent donc par l'API réelle avec un jeton par utilisateur. Les RLS, triggers et fonctions sont ainsi réellement exercés.
- Couvert : isolation A/B pour 8 rôles × 15 tables, écriture et suppression croisées, 4 fonctions serveur appelées sur B, stockage de fichiers, fonctions de droits, table du jeton interne, consultation (clôture directe refusée, immuable après clôture), rendez-vous (transition interdite).
- Matrice : `tests/db/matrice-attendue.json` (cible « besoin d'en connaître », à valider) ; résultat dans `matrice-constatee.json` et `matrice-ecarts.txt`.
- **Écarts constatés** : `medecin` et `biologiste` lisent `medical_access_log` (journal d'accès) — à trancher en P1.
- **Non couvert encore** : saut d'étape labo, double validation labo, facture émise immuable, écriture comptable validée immuable (le jeu de test ne crée pas encore analyses, factures ni entreprise liée) ; INSERT/UPDATE/DELETE par rôle sur sa propre structure ; vues matérialisées.
- **CI** : non branchée. Le projet n'a pas de pipeline d'intégration continue accessible ; la commande est prête.

## P0.2 Revue des fonctions SECURITY DEFINER — FAIT
- 77 fonctions inventoriées : toutes ont un `search_path` fixé ; aucune n'est exécutable par un visiteur non connecté.
- Faille corrigée (migration `0025_p0_durcissement_fonctions`) : 5 fonctions acceptaient un `_user_id` fourni par l'appelant (`has_role`, `get_entreprise_role`, `get_cabinet_role`, `is_cabinet_member`, `get_user_entreprise_ids`). Un utilisateur connecté pouvait interroger les droits et entreprises d'un autre. Elles ne répondent plus que pour soi-même (ou pour le serveur). Test : vert.
- Fonctions de déclencheur : droit d'exécution retiré aux clients.
- Les autres fonctions sans contrôle explicite vérifient l'appartenance via `is_structure_admin` / `can_admin_entreprise` (vérifié à la lecture), ou ne sont pas exécutables par les clients.
- Retour arrière : `docs/rollback/0025_p0_durcissement_fonctions_down.sql`.

## P0.3 Durcissements restants
| Point | État | Détail |
|---|---|---|
| CORS | PARTIEL | Code : liste blanche limitée à CE projet (aperçu) + secret `APP_ALLOWED_ORIGINS` ; origine inconnue → `null`. Les 6 fonctions serveur l'utilisent (2 renvoyaient encore `*`). **Au moment de publier : ajouter l'adresse publiée dans `APP_ALLOWED_ORIGINS`**, sinon le portail patient sera refusé. **Constat par test réel : la passerelle d'hébergement des fonctions réécrit l'en-tête et renvoie quand même l'origine appelante** (`https://evil.example.com` reflété alors que le code renvoie `null`). Non corrigeable dans le code de l'application. Compensation : toutes les fonctions exigent un jeton (session, jeton portail ou jeton interne) ; CORS n'est pas une barrière d'authentification. |
| MFA (TOTP) | NON FAIT | À faire en P0 suite : écran d'enrôlement + exigence du niveau `aal2` en base pour admin_structure, médecin, biologiste, admin comptable. Les comptes de démo devront l'activer. |
| demo-sante | PARTIEL | Bouton absent du site publié (build de production) ; la fonction refuse toute origine autre que l'aperçu. Elle reste déployée car un seul serveur sert aperçu et production : la vraie séparation exige un second environnement (P0.4). |
| Secrets | PARTIEL | Le jeton de la tâche 18 h reste dans `sante_cron_config` (RLS sans politique, tout privilège client retiré, test vert). Le déplacement dans le coffre de secrets a été **refusé par la plateforme** pour l'agent ; à faire manuellement ou via le mécanisme de tâche planifiée géré. |
| Portail client comptable | DÉJÀ FAIT / PARTIEL | Jeton par client + 5 essais/h existants. Rotation/expiration/révocation non faites. Code par e-mail : bloqué (domaine d'envoi). |
| Journaux | NON VÉRIFIÉ | Revue des journaux des fonctions serveur à faire. |

## P0.4 Environnements — NON FAIT (bloqué)
Un seul serveur sert l'aperçu et le site publié. Une préproduction séparée demande un second projet. Décision du porteur de projet requise.

## Décisions à confirmer
- Matrice cible (admin de structure sans accès clinique hors bris de glace ; médecin et biologiste et journal d'accès).
- Création d'un environnement de préproduction distinct.
