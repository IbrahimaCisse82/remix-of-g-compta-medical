# G-Santé ERP — Contrôle avant livraison

Date : 27 octobre 2026. Décision actuelle : **mise en production non validée**.

## Résultats constatés

- Tests métier : 140/140 réussis ; tests API/base : 65/65 réussis.
- Contrôle rapide : une information sur la lecture publique du catalogue `plans_abonnement` ; ses colonnes décrivent des offres commerciales. Ne pas fermer cette lecture sans examiner son utilisation publique.
- Analyse approfondie terminée : 10 avertissements, à examiner et corriger avant validation. Ce document ne constitue ni une certification de sécurité, ni une autorisation juridique.
- Impressions/rapports : 5 alertes d'injection de contenu exécutable (bordereaux organismes, relances, états financiers, rapport fiscal, liasse fiscale complète).
- Exports : 2 alertes de formules malveillantes dans les fichiers comptables et les justifications d'accès exportées.
- Fichiers : 3 alertes de liens signés encore utilisables après révocation (téléversement portail, lecture portail, documents patient). Examiner la durée effective, le contrôle de révocation et les possibilités de remplacement.
- Aucun de ces avertissements n'est marqué corrigé ou ignoré ; la recette de 205 tests ne couvre pas automatiquement ces nouveaux constats.
- Contrôle des dépendances : alertes élevées et modérées sur ws, DOMPurify, fflate, le routeur, lodash et Zod. Mises à jour compatibles, recette et nouveau contrôle requis avant validation.
- Inventaire agrégé : 65 structures, 63 portant un marqueur de test au sens large, 64 comptes du domaine de test, 3 adhésions actives avec plus de deux rôles. Un nom de test n'autorise pas la suppression.
- Aucune suppression de données, aucun retrait de rôle et aucune publication effectués à cette étape.

## Décisions à obtenir du responsable de livraison

1. Identifier la structure cliente à livrer : nom légal, type, adresse, NINEA/RCCM applicables, autorisation d'exercice et responsable.
2. Valider pour chaque personne ses fonctions réelles. Administrateur ne remplace pas un rôle médical ; plusieurs rôles ne sont pas automatiquement une anomalie.
3. Définir le périmètre contractuel : modules, catalogue d'analyses et tarifs, canaux de communication disponibles. Ne pas promettre SMS ou DGID sans service réel validé.
4. Confirmer les formalités CDP et la revue juridique avant l'utilisation avec de vrais patients. Les validations comptables et biologiques nécessaires restent à obtenir des professionnels compétents.

## Procédure de conservation des essais

- Identifier les objets avec leur propriétaire et leurs relations ; examiner factures, écritures, dossiers et audits avant toute action.
- Préserver les écritures comptables et leurs pièces pendant la durée réglementaire ; ne pas les supprimer ni les modifier pour masquer un essai.
- Préserver les dossiers et journaux cliniques. Faire approuver la durée et le traitement des données d'essai par le responsable de traitement.
- Préférer la séparation des structures et la désactivation des accès de test validés plutôt qu'une suppression. Vérifier la réversibilité et l'absence d'accès croisé.
- Ne pas retirer les comptes de tests automatisés sans décider de leur remplacement : les tests les réutilisent ou les recréent.
- Les tests base écrivent dans l'instance partagée. Organiser une recette isolée avant livraison ; ne pas lancer ces tests régulièrement contre les données du client.

## Conditions de feu vert

- [ ] Alertes de dépendances corrigées ou examinées individuellement, avec preuves et approbation explicite des risques résiduels.
- [ ] Résultat de l'analyse approfondie examiné et problèmes réels traités.
- [ ] Structure cliente et rôles confirmés ; séparation des essais vérifiée.
- [ ] Recette client réalisée sur chaque parcours du périmètre, y compris refus d'accès, encaissement, comptabilisation et impression.
- [ ] Sauvegarde et restauration réellement testées ; responsables, durée de conservation et procédure d'incident convenus.
- [ ] Exercice courant ouvert ; procédure de passage à l'année suivante validée.
- [ ] Mentions légales et tarifs vérifiés sur les impressions ; notifications testées jusqu'à leur réception lorsqu'elles sont incluses.
- [ ] Formalités et validations professionnelles nécessaires confirmées.
- [ ] Formation et procès-verbal de recette signés.
- [ ] Publication explicitement autorisée ; après publication, connexion et parcours principal vérifiés sur le domaine cible.

## Livrables

Guide de prise en main : `docs/livraison/guide-utilisateur.md`. Feuille de route : `roadmap.md`. Le guide est rédigé ; la remise, la formation et l'accord client ne sont pas encore constatés.