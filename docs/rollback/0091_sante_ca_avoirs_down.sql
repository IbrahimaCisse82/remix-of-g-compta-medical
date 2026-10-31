-- Retour arrière de 0091 : définitions antérieures (lignes de facture seules, avoirs sans lignes ignorés).
CREATE OR REPLACE FUNCTION public.sante_ca_analytique(_structure_id uuid, _debut date, _fin date, _axe text)
 RETURNS TABLE(axe text, montant numeric, nb bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_any_medical_role(_structure_id, ARRAY['admin_structure','comptable']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN QUERY
  SELECT CASE _axe
      WHEN 'praticien' THEN coalesce((SELECT p.nom FROM sante_praticiens p WHERE p.id = f.praticien_id), 'Non affecté')
      WHEN 'site' THEN coalesce((SELECT s.nom FROM sites s WHERE s.id = f.site_id), 'Site principal')
      WHEN 'section' THEN coalesce((SELECT a.section FROM sante_analyses a WHERE a.structure_id=_structure_id AND a.code=l.code LIMIT 1), 'Hors laboratoire')
      ELSE coalesce(l.categorie, sante_categorie_code(_structure_id, l.code)) END,
    sum(CASE WHEN f.type='avoir' THEN -abs(l.montant) ELSE l.montant END), count(*)
  FROM sante_facture_lignes l JOIN sante_factures f ON f.id = l.facture_id
  WHERE f.structure_id = _structure_id AND f.created_at::date BETWEEN _debut AND _fin
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
         count(*), sum(CASE WHEN f.type='avoir' THEN -abs(l.montant) ELSE l.montant END)
  FROM sante_facture_lignes l JOIN sante_factures f ON f.id = l.facture_id
  WHERE f.structure_id = _structure_id AND f.created_at::date BETWEEN _debut AND _fin
  GROUP BY 1 ORDER BY 1;
END $function$;
DROP FUNCTION IF EXISTS public.sante_lignes_ca(uuid, date, date);
