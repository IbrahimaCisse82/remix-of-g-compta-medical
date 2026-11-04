-- 0110 — Recettes santé par catégorie.
-- Les comptes par défaut des produits étaient tous 706 : la balance et le compte de résultat ne distinguaient pas
-- consultations, actes et analyses. Les défauts deviennent des sous-comptes de 7061 « Services vendus dans la Région »
-- (les subdivisions officielles 7061 à 7065 sont géographiques) ; les médicaments vendus vont en 7011 « Ventes de
-- marchandises dans la Région », cohérent avec les achats en 601 et la variation de stock en 6031.
-- Un compte paramétré par la structure (Paramètres santé : clés produits ou produits_<catégorie>) reste prioritaire.
-- Les écritures déjà passées ne changent pas, et aucun plan comptable n'est modifié ici : l'installation du plan
-- depuis l'application ajoute les sous-comptes (COMPTES_SANTE) ; sur un plan déjà installé, la page Plan comptable
-- propose « Ajouter les comptes manquants » à l'administrateur. Une écriture sur un compte absent du plan reste acceptée.
-- Retour : docs/rollback/0110_produits_sante_par_categorie_down.sql
DO $$
DECLARE d text := pg_get_functiondef('public.sante_compte_defaut'::regproc);
  a text := $a$WHEN 'produits_consultation' THEN '706' WHEN 'produits_acte' THEN '706' WHEN 'produits_analyses' THEN '706'
    WHEN 'produits_medicaments' THEN '706' WHEN 'produits_autres' THEN '706'$a$;
  b text := $a$WHEN 'produits_consultation' THEN '70611' WHEN 'produits_acte' THEN '70612' WHEN 'produits_analyses' THEN '70613'
    WHEN 'produits_medicaments' THEN '7011' WHEN 'produits_autres' THEN '70618'$a$;
BEGIN
  IF position(b in d) > 0 THEN RETURN; END IF;
  IF position(a in d) = 0 THEN RAISE EXCEPTION 'sante_compte_defaut : ancre introuvable'; END IF;
  EXECUTE replace(d, a, b);
END $$;

