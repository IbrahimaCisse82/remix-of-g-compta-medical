CREATE OR REPLACE FUNCTION public.sante_rectifier_resultat_v2(_demande_id uuid, _parametre_id uuid, _valeur_num numeric, _valeur_texte text, _motif text, _traitement_deja_prescrit boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _v int; d sante_demandes_labo; _ent uuid; _u uuid;
BEGIN
  SELECT * INTO d FROM sante_demandes_labo WHERE id=_demande_id FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
  IF NOT public.mfa_conforme() OR NOT public.has_any_medical_role(d.structure_id, ARRAY['biologiste']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  _v := public.sante_rectifier_resultat(_demande_id, _parametre_id, _valeur_num, _valeur_texte, _motif);
  UPDATE sante_rectificatifs SET traitement_deja_prescrit = coalesce(_traitement_deja_prescrit,false) WHERE demande_id=_demande_id AND parametre_id=_parametre_id AND version=_v;
  SELECT entreprise_id INTO _ent FROM structures WHERE id=d.structure_id;
  SELECT pr.user_id INTO _u FROM sante_consultations c JOIN sante_praticiens pr ON pr.id=c.praticien_id WHERE c.id=d.consultation_id;
  IF _u IS NULL THEN _u := d.created_by; END IF;
  IF _ent IS NOT NULL AND _u IS NOT NULL THEN
    INSERT INTO notifications(entreprise_id, user_id, type, titre, message, meta)
    VALUES (_ent, _u, 'rectificatif_labo', 'Compte rendu rectifié', 'Le compte rendu ' || d.numero || ' a été rectifié (version ' || _v || '). ' ||
      CASE WHEN _traitement_deja_prescrit THEN 'Un traitement a déjà été prescrit : réévaluez-le.' ELSE '' END, jsonb_build_object('demande_id', _demande_id));
  END IF;
  PERFORM set_config('sante.rectificatif','on',true);
  UPDATE sante_demandes_labo SET cr_hash = encode(extensions.digest((coalesce(cr_hash,'') || ':' || _v)::text, 'sha256'), 'hex') WHERE id=_demande_id;
  PERFORM set_config('sante.rectificatif','',true);
  RETURN _v;
END $$;
REVOKE ALL ON FUNCTION public.sante_rectifier_resultat_v2(uuid,uuid,numeric,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_rectifier_resultat_v2(uuid,uuid,numeric,text,text,boolean) TO authenticated;