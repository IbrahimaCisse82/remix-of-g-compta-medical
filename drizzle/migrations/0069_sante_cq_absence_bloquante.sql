CREATE OR REPLACE FUNCTION public.sante_cq_bloquant(_demande_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.sante_demande_analyses da
  JOIN public.sante_analyse_parametres ap ON ap.analyse_id=da.analyse_id
  LEFT JOIN public.sante_controles_qualite c ON c.parametre_id=ap.id AND c.actif
  LEFT JOIN LATERAL (SELECT statut FROM public.sante_cq_mesures m WHERE m.controle_id=c.id AND m.saisi_le::date=current_date ORDER BY saisi_le DESC LIMIT 1) last ON true
  WHERE da.demande_id=_demande_id AND (last.statut='rejete' OR (ap.cq_absent='bloquer' AND last.statut IS NULL))
 )
$$;
REVOKE ALL ON FUNCTION public.sante_cq_bloquant(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sante_cq_bloquant(uuid) TO authenticated;
ALTER TABLE public.sante_cq_mesures ADD CONSTRAINT sante_cq_valeurs_finies CHECK (valeur IS NOT NULL AND valeur::text NOT IN ('NaN','Infinity','-Infinity') AND z::text NOT IN ('NaN','Infinity','-Infinity')) NOT VALID;
ALTER TABLE public.sante_controles_qualite ADD CONSTRAINT sante_cq_reference_finie CHECK (cible::text NOT IN ('NaN','Infinity','-Infinity') AND ecart_type>0 AND ecart_type::text NOT IN ('NaN','Infinity','-Infinity')) NOT VALID;
ALTER TABLE public.sante_eeq ADD CONSTRAINT sante_eeq_valeurs_finies CHECK (valeur_obtenue::text NOT IN ('NaN','Infinity','-Infinity') AND valeur_cible::text NOT IN ('NaN','Infinity','-Infinity') AND ecart_type>0 AND ecart_type::text NOT IN ('NaN','Infinity','-Infinity')) NOT VALID;