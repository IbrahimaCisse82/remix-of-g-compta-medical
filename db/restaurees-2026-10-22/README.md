Six migrations appliquées en production le 22 octobre 2026 (stocks reliés aux soins et au laboratoire,
rétrocessions des praticiens, personnel et gardes, correctif de sécurité « droits entreprise null », supervision
d'exploitation, audit des fusions), puis supprimées du dépôt le même jour par le commit Lovable 3ebad45
(« Fixed background task agent »). Restaurées ici depuis 3ebad45^, avec leurs procédures de retour arrière
dans docs/rollback.

Elles portent les numéros 0049 à 0054, déjà réutilisés depuis par d'autres migrations : elles restent donc dans
ce dossier. Ordre d'application en production (fichier ORDRE) : juste après drizzle/migrations/0048_sante_onboarding_atomic,
avant 0049_sante_exercice_auto. scripts/db-test/reconstruire.sh les applique à cet endroit.

Le brouillon 0050_p5_exploitation.sql, absent de l'index des migrations, n'a jamais été appliqué et n'est pas restauré.
