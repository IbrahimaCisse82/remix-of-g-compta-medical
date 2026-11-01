-- Chiffre d'affaires santé : prise en compte des avoirs (31/10/2026).
-- Constat (recette caisse) : un avoir d'annulation n'a pas de lignes propres (sante_facture_lignes) ; les rapports
-- sante_ca_analytique et sante_ventes_par_categorie, qui sommaient les lignes, ignoraient donc les avoirs et
-- surévaluaient le chiffre d'affaires (12 000 au lieu de 9 000 en recette). La comptabilité, elle, était juste.
-- Correction : un avoir compte, à sa date, l'opposé des lignes de la facture d'origine, au prorata de son montant
-- (avoirs partiels). Les avoirs qui auraient leurs propres lignes restent comptés tels quels, en négatif.
CREATE OR REPLACE FUNCTION public.sante_lignes_ca(_structure_id uuid, _debut date, _fin date)
 RETURNS TABLE(facture_id uuid, praticien_id uuid, site_id uuid, code text, categorie text, montant numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  -- Factures et avoirs portant leurs propres lignes
  SELECT f.id, f.praticien_id, f.site_id, l.code, l.categorie,
         CASE WHEN f.type = 'avoir' THEN -abs(l.montant) ELSE l.montant END
  FROM public.sante_facture_lignes l JOIN public.sante_factures f ON f.id = l.facture_id
  WHERE f.structure_id = _structure_id AND f.created_at::date BETWEEN _debut AND _fin
  UNION ALL
  -- Avoirs sans lignes : lignes de la facture d'origine, en négatif, au prorata
  SELECT a.id, o.praticien_id, o.site_id, l.code, l.categorie,
         round(-abs(l.montant) * coalesce(abs(a.total) / nullif(abs(o.total), 0), 1), 2)
  FROM public.sante_factures a
  JOIN public.sante_factures o ON o.id = a.facture_origine_id
  JOIN public.sante_facture_lignes l ON l.facture_id = o.id
  WHERE a.structure_id = _structure_id AND a.type = 'avoir' AND a.created_at::date BETWEEN _debut AND _fin
    AND NOT EXISTS (SELECT 1 FROM public.sante_facture_lignes x WHERE x.facture_id = a.id);
$function$;
REVOKE ALL ON FUNCTION public.sante_lignes_ca(uuid, date, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sante_ca_analytique(_structure_id uuid, _debut date, _fin date, _axe text)
 RETURNS TABLE(axe text, montant numeric, nb bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_any_medical_role(_structure_id, ARRAY['admin_structure','comptable']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN QUERY
  SELECT CASE _axe
      WHEN 'praticien' THEN coalesce((SELECT p.nom FROM sante_praticiens p WHERE p.id = l.praticien_id), 'Non affecté')
      WHEN 'site' THEN coalesce((SELECT s.nom FROM sites s WHERE s.id = l.site_id), 'Site principal')
      WHEN 'section' THEN coalesce((SELECT a.section FROM sante_analyses a WHERE a.structure_id=_structure_id AND a.code=l.code LIMIT 1), 'Hors laboratoire')
      ELSE coalesce(l.categorie, sante_categorie_code(_structure_id, l.code)) END,
    sum(l.montant), count(*)
  FROM public.sante_lignes_ca(_structure_id, _debut, _fin) l
  GROUP BY 1 ORDER BY 2 DESC;
END $function$;

CREATE OR REPLACE FUNCTION public.sante_ventes_par_categorie(_structure_id uuid, _debut date, _fin date)
 RETURNS TABLE(categorie text, nb_lignes bigint, montant numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_medical_role(_structure_id, ARRAY['admin_structure','comptable','lecteur','caissier','tiers_payant']) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  RETURN QUERY
  SELECT CASE WHEN EXISTS (SELECT 1 FROM sante_analyses a WHERE a.structure_id=_structure_id AND a.code=l.code) THEN 'Analyses de laboratoire'
              WHEN EXISTS (SELECT 1 FROM sante_actes a WHERE a.structure_id=_structure_id AND a.code=l.code) THEN 'Consultations et actes'
              ELSE 'Autres prestations' END,
         count(*), sum(l.montant)
  FROM public.sante_lignes_ca(_structure_id, _debut, _fin) l
  GROUP BY 1 ORDER BY 1;
END $function$;
