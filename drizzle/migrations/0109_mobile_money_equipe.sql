-- 0109 — 1. Compte par défaut des encaissements Mobile Money (Wave, Orange Money, Free Money, Wizall).
-- Le défaut était 5215, qui est « Banques en devises » dans le plan SYSCOHADA révisé installé ; la monnaie électronique sur
-- téléphone portable est le compte 552. Seul le défaut change : un compte paramétré par la structure
-- (sante_comptes_parametres, clé mobile_money) reste prioritaire. Les écritures déjà passées ne sont pas modifiées.
-- Retour : docs/rollback/0109_mobile_money_equipe_down.sql
DO $$
DECLARE d text := pg_get_functiondef('public.sante_compte_defaut'::regproc);
BEGIN
  IF position($a$WHEN 'mobile_money' THEN '552'$a$ in d) > 0 THEN RETURN; END IF;
  IF position($a$WHEN 'mobile_money' THEN '5215'$a$ in d) = 0 THEN RAISE EXCEPTION 'sante_compte_defaut : ancre introuvable'; END IF;
  EXECUTE replace(d, $a$WHEN 'mobile_money' THEN '5215'$a$, $a$WHEN 'mobile_money' THEN '552'$a$);
END $$;

-- 2. Équipe de la structure : l'adresse e-mail est lue sur le compte d'authentification quand le profil n'en a pas
--    (sinon l'écran « Membres et habilitations » affichait l'identifiant technique du membre).
DO $$
DECLARE d text := pg_get_functiondef('public.sante_equipe_lister'::regproc);
BEGIN
  IF position('coalesce(p.email, u.email::text)' in d) > 0 THEN RETURN; END IF;
  IF position('p.full_name,p.email,m.statut::text' in d) = 0 OR position('LEFT JOIN public.profiles p ON p.id=m.user_id' in d) = 0 OR position('GROUP BY m.id,p.full_name,p.email' in d) = 0 THEN RAISE EXCEPTION 'sante_equipe_lister : ancre introuvable'; END IF;
  d := replace(d, 'p.full_name,p.email,m.statut::text', 'p.full_name,coalesce(p.email, u.email::text),m.statut::text');
  d := replace(d, 'LEFT JOIN public.profiles p ON p.id=m.user_id', 'LEFT JOIN public.profiles p ON p.id=m.user_id LEFT JOIN auth.users u ON u.id=m.user_id');
  d := replace(d, 'GROUP BY m.id,p.full_name,p.email', 'GROUP BY m.id,p.full_name,p.email,u.email');
  EXECUTE d;
END $$;
