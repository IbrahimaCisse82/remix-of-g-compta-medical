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

## Non fait (P2 partiel)
- P2.1 option « compte rendu remis seulement si la part patient est réglée ».
- P2.2 blocs de numéros réservés pour le mode secours papier.
- P2.4 ventilation analytique (service, praticien, site).
- P2.5 TVA par acte, non-récupération et prorata : **à valider avec le fiscaliste avant développement**.
- P2.6 lien avec le module « Honoraires » de la comptabilité (l'unicité couvre les flux santé) et masquage pour les flux patients.
- P2.7 matrice de couverture par catégorie, tarifs conventionnés, bons de prise en charge / accord préalable, relances, lien Provisions, lettrage automatique (les écritures portent le compte auxiliaire de l'organisme, ce qui permet le lettrage manuel).
