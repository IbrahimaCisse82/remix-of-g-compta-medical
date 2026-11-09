# Bascule de la production : Lovable Cloud → Supabase « G-Santé production »

Projet : `azusqndpbstvzzohlkba` (organisation Grow Hub Sarl, eu-west-3, plan gratuit jusqu'à la fin du projet).
Décisions du 08/11/2026 : seules les 4 structures réelles et leurs comptes sont transférées ; pas de mot de passe
transféré (réinitialisation par e-mail) ; e-mails par Resend (SMTP saisi par le propriétaire).

## Fait (répétition du 08/11/2026)
- Schéma : 150 migrations du dépôt (même ordre que la production), outillage `deploiement.*`. Empreinte identique
  à la base de test sur les 13 catégories (donc à la production + 0112).
- Données : transfert direct base à base (pg_net → fonction temporaire `bascule-reception`, jeton à usage unique,
  empreinte seule en base). 54 tables, 5 342 lignes attendues = reçues = présentes ; 0 lien orphelin ;
  journal comptable identique par entreprise. Aucun mot de passe lu.
- Fonctions edge : send-notification, emit-facture-dgid, portail-public, portail-patient, sante-rappels,
  email-journal. Non déployées : demo-sante (aperçu seulement), auth-email-hook et preview-transactional-email
  (e-mails Lovable, remplacés par le SMTP Resend).
- Garde-fous : les tests de base et `reconstruire.sh` refusent aussi cette nouvelle production.

## Reste à faire le jour J
1. Resynchroniser les données (les clients ont pu travailler depuis la répétition) : vider les 4 structures sur la
   nouvelle base et relancer le transfert (nouveau jeton).
2. Secret `APP_ALLOWED_ORIGINS` (domaine publié) ; SMTP Resend ; URL du site et redirections dans Auth.
3. Lovable : retirer Cloud, connecter ce projet Supabase, publier.
4. Envoyer les liens de réinitialisation ; supprimer `bascule-reception` et le schéma `bascule`.
5. L'ancienne production reste intacte en lecture jusqu'à validation.

## Limites du plan gratuit (choix assumé jusqu'à la fin du projet)
Pas de sauvegarde quotidienne, mise en pause après 7 jours sans activité, 2 projets actifs (test + production).
