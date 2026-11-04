-- Retour de 0109 : rétablit 5215 comme compte par défaut du Mobile Money.
DO $$
DECLARE d text := pg_get_functiondef('public.sante_compte_defaut'::regproc);
BEGIN
  IF position($a$WHEN 'mobile_money' THEN '552'$a$ in d) > 0 THEN
    EXECUTE replace(d, $a$WHEN 'mobile_money' THEN '552'$a$, $a$WHEN 'mobile_money' THEN '5215'$a$);
  END IF;
END $$;
DO $$
DECLARE d text := pg_get_functiondef('public.sante_equipe_lister'::regproc);
BEGIN
  IF position('coalesce(p.email, u.email::text)' in d) > 0 THEN
    d := replace(d, 'p.full_name,coalesce(p.email, u.email::text),m.statut::text', 'p.full_name,p.email,m.statut::text');
    d := replace(d, ' LEFT JOIN auth.users u ON u.id=m.user_id', '');
    d := replace(d, 'GROUP BY m.id,p.full_name,p.email,u.email', 'GROUP BY m.id,p.full_name,p.email');
    EXECUTE d;
  END IF;
END $$;
