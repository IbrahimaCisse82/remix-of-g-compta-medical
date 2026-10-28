ALTER TABLE public.sante_reglements_organisme ADD COLUMN import_cle text, ADD COLUMN import_empreinte text;
CREATE UNIQUE INDEX sante_reglements_import_unique ON public.sante_reglements_organisme(structure_id, import_cle) WHERE import_cle IS NOT NULL;
COMMENT ON COLUMN public.sante_reglements_organisme.import_cle IS 'Server-derived statement line identity; only written by the validated import RPC.';
CREATE OR REPLACE FUNCTION public.sante_factures_rapprochables(_structure_id uuid)
RETURNS TABLE(id uuid, numero text, organisme text, reste numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.mfa_conforme() OR NOT public.has_any_medical_role(_structure_id, ARRAY['admin_structure','caissier','comptable','tiers_payant']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
 RETURN QUERY SELECT f.id, f.numero, f.organisme, public.sante_reste_organisme(f.id) FROM public.sante_factures f WHERE f.structure_id=_structure_id AND f.type='facture' AND NOT f.annulee AND f.part_organisme>0 AND public.sante_reste_organisme(f.id)>0 ORDER BY f.created_at,f.id;
END $$;
REVOKE ALL ON FUNCTION public.sante_factures_rapprochables(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_factures_rapprochables(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.sante_importer_reglements(_structure_id uuid, _lignes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE x jsonb; fid uuid; org text; ref text; mode_p text; m numeric; d date; cle text; empreinte text; ancien public.sante_reglements_organisme; rid uuid; ids jsonb='[]'::jsonb; ajoutes integer=0; existants integer=0;
BEGIN
 IF auth.uid() IS NULL OR NOT public.mfa_conforme() OR NOT public.has_any_medical_role(_structure_id, ARRAY['admin_structure','caissier','comptable','tiers_payant']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
 IF jsonb_typeof(_lignes) IS DISTINCT FROM 'array' OR jsonb_array_length(_lignes)=0 OR jsonb_array_length(_lignes)>500 THEN RAISE EXCEPTION 'Relevé invalide (1 à 500 lignes)'; END IF;
 PERFORM 1 FROM public.structures WHERE id=_structure_id FOR UPDATE;
 FOR x IN SELECT value FROM jsonb_array_elements(_lignes) LOOP
  IF x->>'confirme' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Chaque correspondance doit être confirmée'; END IF;
  fid=(x->>'facture_id')::uuid; org=btrim(x->>'organisme'); ref=btrim(x->>'reference'); mode_p=x->>'mode'; m=(x->>'montant')::numeric; d=(x->>'date')::date;
  IF fid IS NULL OR org IS NULL OR org='' OR ref IS NULL OR ref='' OR d IS NULL OR d>current_date OR m IS NULL OR m::text IN ('NaN','Infinity','-Infinity') OR m<=0 OR m<>trunc(m) OR m>9007199254740991 THEN RAISE EXCEPTION 'Date, référence ou montant FCFA invalide'; END IF;
  cle=md5(jsonb_build_array(org,ref,d,fid)::text); empreinte=md5(jsonb_build_array(org,ref,d,fid,m,mode_p)::text);
  SELECT * INTO ancien FROM public.sante_reglements_organisme WHERE structure_id=_structure_id AND import_cle=cle;
  IF ancien.id IS NOT NULL THEN
   IF ancien.import_empreinte IS DISTINCT FROM empreinte THEN RAISE EXCEPTION 'Cette référence a déjà été importée avec des valeurs différentes'; END IF;
   rid=ancien.id; existants=existants+1;
  ELSE
   rid=public.sante_imputer_reglement(_structure_id,org,m,mode_p,ref,jsonb_build_array(jsonb_build_object('facture_id',fid,'montant',m)));
   UPDATE public.sante_reglements_organisme SET import_cle=cle,import_empreinte=empreinte,date_reglement=d WHERE id=rid;
   ajoutes=ajoutes+1;
  END IF;
  ids=ids||jsonb_build_array(rid);
 END LOOP;
 RETURN jsonb_build_object('ajoutes',ajoutes,'existants',existants,'ids',ids);
END $$;
REVOKE ALL ON FUNCTION public.sante_importer_reglements(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_importer_reglements(uuid,jsonb) TO authenticated;