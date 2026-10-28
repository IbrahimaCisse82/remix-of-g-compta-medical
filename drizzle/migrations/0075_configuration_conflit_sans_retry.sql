CREATE OR REPLACE FUNCTION public.sante_configuration_sauver(_structure_id uuid, _donnees jsonb, _etape integer, _revision integer, _terminer boolean DEFAULT false) RETURNS public.sante_configuration_brouillons LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.structures; r public.sante_configuration_brouillons; k text; v jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.mfa_conforme() OR NOT public.is_structure_admin(_structure_id) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
 IF _etape IS NULL OR _etape NOT BETWEEN 0 AND 2 OR _revision IS NULL OR _revision<0 OR _terminer IS NULL OR _donnees IS NULL OR jsonb_typeof(_donnees)<>'object' OR octet_length(_donnees::text)>16000 THEN RAISE EXCEPTION 'Configuration invalide'; END IF;
 FOR k,v IN SELECT * FROM jsonb_each(_donnees) LOOP
  IF k NOT IN ('nom','sigle','ninea','rccm','telephone','adresse','forme_juridique','autorisation_exercice','inscription_ordre') OR jsonb_typeof(v)<>'string' OR length(v#>>'{}')>1000 THEN RAISE EXCEPTION 'Champ de configuration invalide'; END IF;
 END LOOP;
 SELECT * INTO s FROM public.structures WHERE id=_structure_id FOR UPDATE;
 INSERT INTO public.sante_configuration_brouillons(structure_id,user_id) VALUES(_structure_id,auth.uid()) ON CONFLICT DO NOTHING;
 SELECT * INTO r FROM public.sante_configuration_brouillons WHERE structure_id=_structure_id AND user_id=auth.uid() FOR UPDATE;
 IF r.revision<>_revision THEN RAISE EXCEPTION 'Configuration modifiée ailleurs : rechargez avant de continuer' USING ERRCODE='P0001'; END IF;
 IF _terminer THEN
  IF length(btrim(coalesce(_donnees->>'nom','')))<2 OR _etape<>2 THEN RAISE EXCEPTION 'Dénomination sociale requise'; END IF;
  IF s.entreprise_id IS NULL OR NOT public.can_admin_entreprise(s.entreprise_id) THEN RAISE EXCEPTION 'Accès entreprise refusé' USING ERRCODE='42501'; END IF;
  UPDATE public.structures SET nom=btrim(_donnees->>'nom'), ninea=nullif(btrim(_donnees->>'ninea'),''), rccm=nullif(btrim(_donnees->>'rccm'),''), telephone=nullif(btrim(_donnees->>'telephone'),''), adresse=nullif(btrim(_donnees->>'adresse'),''), autorisation_exercice=nullif(btrim(_donnees->>'autorisation_exercice'),''), inscription_ordre=nullif(btrim(_donnees->>'inscription_ordre'),''), updated_at=now() WHERE id=_structure_id;
  UPDATE public.entreprises SET nom=btrim(_donnees->>'nom'),sigle=coalesce(_donnees->>'sigle',''),ninea=coalesce(_donnees->>'ninea',''),rccm=coalesce(_donnees->>'rccm',''),tel=coalesce(_donnees->>'telephone',''),adresse=coalesce(_donnees->>'adresse',''),forme_juridique=coalesce(_donnees->>'forme_juridique','') WHERE id=s.entreprise_id;
 END IF;
 UPDATE public.sante_configuration_brouillons SET donnees=_donnees,etape=_etape,termine=_terminer,revision=revision+1,updated_at=now() WHERE structure_id=_structure_id AND user_id=auth.uid() RETURNING * INTO r;
 RETURN r;
END; $$;