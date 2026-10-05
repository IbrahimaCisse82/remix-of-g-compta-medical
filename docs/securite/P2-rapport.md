# P2 — Facturation, caisse, tiers-payant, comptabilisation (5 octobre 2026)

Tests base : **37/37 verts** (dont 6 tests P2 couvrant les 6 critères de sortie). Matrice d'accès : aucun écart.

| Critère de sortie | État | Preuve |
|---|---|---|
| Demande labo facturée à l'enregistrement et comptabilisée | FAIT | test « demande de laboratoire facturée à l'enregistrement » |
| Panne comptable simulée puis rejeu sans doublon | FAIT | test « panne simulée » (1 événement, 1 écriture, rejouée 2 fois) |
| Clôture de caisse avec écart | FAIT | écart −500 comptabilisé (compte paramétrable), session verrouillée, rapport imprimable |
| Règlement partiel d'un organisme sur 3 factures | FAIT | 8 000 + 8 000 + 4 000, ventilation obligatoire, une écriture |
| Aucun acte facturable deux fois | FAIT (flux santé) | contrainte d'unicité sur l'objet source (consultation, analyse demandée) ; libérée par un avoir |
| Tous les comptes paramétrables | FAIT | 11 comptes par structure, « à confirmer » tant que non validés |

## Livré
- P2.1 Facture labo à l'enregistrement (réglable par structure) ; demande rejetée → avoir automatique (+ remboursement demandé si déjà réglée).
- P2.2 Avoir possible même après encaissement → remboursement : demande, approbation administrateur avec motif, paiement (caisse ou virement), comptabilisé. Caisse par caissier : écart imputé, rapport de fin de journée, session clôturée verrouillée. Numérotation : compteur verrouillé transactionnel (aucun trou, déjà en place). Remise de chèques en banque (513 → 521).
- P2.3 File d'attente comptable : clé d'idempotence (objet × événement), statut, tentatives, dernière erreur ; essai immédiat, nouvel essai automatique toutes les heures, bouton « Recomptabiliser » ; indicateur sur Facturation ; clôture d'exercice bloquée s'il reste des écritures santé en attente.
- P2.4 Organismes = tiers auxiliaires (compte auxiliaire par organisme sous le collectif paramétrable) ; écran de correspondance des comptes.
- P2.7 Règlements multi-factures partiels, rejets en 3 traitements (administratif / non-prise en charge avec bascule seulement si la convention l'autorise / perte passée en charge).

## Compléments livrés (P2 terminé)
- P2.1 Compte rendu remis seulement après règlement de la part patient (option) : appliqué au portail patient et à l'impression.
- P2.2 Blocs de numéros réservés par poste pour le mode secours papier, ressaisie avec le même numéro (aucun trou).
- P2.4 Comptes divisionnaires par catégorie (consultations, actes, analyses, médicaments, autres) ; analyse du CA par catégorie, section labo, praticien, site.
- P2.5 TVA : régime par acte/analyse (taxable/exonéré/à valider), TVA collectée séparée (structure assujettie) ; régime de la structure (exonéré / assujetti / mixte + prorata) appliqué aux achats du module Fournisseurs (TVA non récupérable incorporée au coût). **À valider avec le fiscaliste.**
- P2.6 Unicité inter-modules : une facture Honoraires peut référencer un acte/analyse et la même contrainte d'unicité s'applique ; bandeau dans Honoraires pour les entreprises de santé.
- P2.7 Conventions (taux par catégorie, plafond, franchise, période), exclusions, tarifs conventionnés, bons de prise en charge (plafond, consommation, accord préalable obligatoire pour les actes désignés), créances âgées par organisme, relances numérotées imprimables, provision des créances douteuses (écriture + module Provisions), lettrage automatique du compte organisme.

Tests base : **42/42 verts**. Tests unitaires : 135/135.

## Limites
- Ayants droit : champ existant sur la prise en charge, pas de règles spécifiques.
- La facturation Honoraires n'a pas encore de sélecteur d'acte santé à l'écran (la règle est en base).
