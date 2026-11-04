-- Retour de 0110 : défauts des produits santé ramenés à 706 (les sous-comptes ajoutés aux plans se désactivent depuis le plan comptable).
DO $$
DECLARE d text := pg_get_functiondef('public.sante_compte_defaut'::regproc);
  a text := $a$WHEN 'produits_consultation' THEN '706' WHEN 'produits_acte' THEN '706' WHEN 'produits_analyses' THEN '706'
    WHEN 'produits_medicaments' THEN '706' WHEN 'produits_autres' THEN '706'$a$;
  b text := $a$WHEN 'produits_consultation' THEN '70611' WHEN 'produits_acte' THEN '70612' WHEN 'produits_analyses' THEN '70613'
    WHEN 'produits_medicaments' THEN '7011' WHEN 'produits_autres' THEN '70618'$a$;
BEGIN
  IF position(b in d) > 0 THEN EXECUTE replace(d, b, a); END IF;
END $$;
