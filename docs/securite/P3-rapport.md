# P3 — Laboratoire : rapport de fin de phase

## Livré (règles imposées par la base)
- Pré-analytique : prélèvement avec identification positive (≥ 2 identifiants), site et conditions ; rejet à motif codifié avec nouveau prélèvement lié (`demande_origine_id`).
- Analytique : historique des résultats, résultats à refaire, lot de réactif, types liste/calcul, références grossesse/méthode, profils et habilitations.
- Microbiologie : germes + antibiogramme S/I/R ; un germe préliminaire bloque la validation technique.
- Validation : technique ≠ saisie ; biologique par un biologiste avec n° d’ordre, distinct du validateur technique (sauf dérogation de structure, tracée). À la validation, libellés/unités/méthodes figés, empreinte SHA-256 et jeton de vérification posés en une seule opération.
- Compte rendu A4 : libellés figés, microbiologie, mentions « rectificatif » et « dérogation », QR vers `/verifier/:token` (page publique sans donnée médicale).
- Rectificatif v2 avec notification du prescripteur.
- Sous-traitance : envoi d’une analyse de la demande à un laboratoire externe, réception unique.
- Qualité : registre des non-conformités (clôture biologiste/admin avec action corrective) ; EEQ avec z-score, |z| > 2 ouvre une non-conformité.
- Conservation : élimination des échantillons validés après la durée de la structure (défaut 7 jours), journalisée.
- Import automate : fichier/copier-coller « CODE;valeur », chaque ligne passe par la saisie contrôlée.

## Preuves
- `bun run test:db` : 49/49 (dont 7 tests P3).
- Test unitaire `src/domain/sante/automate.test.ts`.

## Corrections découvertes par les tests
- La validation biologique échouait toujours (« Demande verrouillée » puis « Résultats verrouillés ») : gel des résultats et pose du jeton déplacés avant le verrouillage (migrations 0037, 0038).

## Limites / hors périmètre
- Import automate par fichier CSV uniquement ; pas de connexion directe ASTM/HL7 (nécessite un connecteur local sur le poste de l’automate).
- Durée de conservation des échantillons à confirmer par le biologiste responsable.
- Écrans P3 non encore parcourus dans l’aperçu.
