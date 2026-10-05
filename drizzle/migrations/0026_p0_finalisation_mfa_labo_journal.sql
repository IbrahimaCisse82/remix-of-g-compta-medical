-- 1) Double validation labo : le biologiste qui valide biologiquement doit être différent du validateur technique
CREATE OR REPLACE FUNCTION public.sante_valider_demande(_demande_id uuid, _niveau text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.sante_demandes_labo%ROWTYPE; _manquants int; _crit int;
BEGIN
  SELECT * INTO d FROM public.sante_demandes_labo WHERE id = _demande_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
  IF _niveau = 'technique' THEN
    IF NOT public.has_any_medical_role(d.structure_id, ARRAY['technicien','biologiste']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
    SELECT count(*) INTO _manquants FROM public.sante_analyse_parametres ap JOIN public.sante_demande_analyses da ON da.analyse_id=ap.analyse_id
      WHERE da.demande_id=_demande_id AND NOT EXISTS (SELECT 1 FROM public.sante_resultats r WHERE r.demande_id=_demande_id AND r.parametre_id=ap.id);
    IF _manquants > 0 THEN RAISE EXCEPTION '% résultat(s) manquant(s)', _manquants; END IF;
    SELECT count(*) INTO _crit FROM public.sante_resultats WHERE demande_id=_demande_id AND drapeau IN ('HH','LL') AND critique_acquitte_par IS NULL;
    IF _crit > 0 THEN RAISE EXCEPTION 'Valeur critique non acquittée'; END IF;
    IF public.sante_cq_bloquant(_demande_id) THEN RAISE EXCEPTION 'Contrôle qualité du jour hors limites : validation bloquée'; END IF;
    IF EXISTS (SELECT 1 FROM public.sante_resultats WHERE demande_id=_demande_id AND saisi_par = auth.uid()) THEN RAISE EXCEPTION 'Le validateur doit être différent de la personne qui a saisi'; END IF;
    UPDATE public.sante_demandes_labo SET statut='validee_technique', validee_tech_le=now(), validee_tech_par=auth.uid() WHERE id=_demande_id;
  ELSIF _niveau = 'biologique' THEN
    IF NOT public.has_any_medical_role(d.structure_id, ARRAY['biologiste']) THEN RAISE EXCEPTION 'Seul un biologiste valide'; END IF;
    IF d.statut <> 'validee_technique' THEN RAISE EXCEPTION 'Validation technique préalable requise'; END IF;
    IF d.validee_tech_par = auth.uid() THEN RAISE EXCEPTION 'La validation biologique doit être faite par une autre personne que la validation technique'; END IF;
    UPDATE public.sante_demandes_labo SET statut='validee', validee_le=now(), validee_par=auth.uid() WHERE id=_demande_id;
  ELSE RAISE EXCEPTION 'Niveau inconnu'; END IF;
END $$;

-- 2) Journal d'accès médical : lecture réservée aux administrateurs de structure
DROP POLICY IF EXISTS "Authorized staff read access log" ON public.medical_access_log;
CREATE POLICY "Structure admins read access log" ON public.medical_access_log
  FOR SELECT TO authenticated USING (public.is_structure_admin(structure_id));

-- 3) MFA : une fois un facteur TOTP vérifié, toute session doit être en niveau aal2
CREATE OR REPLACE FUNCTION public.mfa_conforme()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT coalesce(auth.jwt()->>'aal','') = 'aal2'
      OR NOT EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = auth.uid() AND f.status = 'verified');
$$;
REVOKE ALL ON FUNCTION public.mfa_conforme() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mfa_conforme() TO authenticated, service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sante_patients','sante_consultations','sante_constantes','sante_antecedents','sante_ordonnances',
    'sante_demandes_labo','sante_resultats','sante_documents_patient','sante_factures','sante_encaissements',
    'medical_access_log','medical_audit_log','ecritures','ecriture_lignes','structure_memberships','medical_user_roles'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "MFA aal2 si facteur actif" ON public.%I', t);
    EXECUTE format('CREATE POLICY "MFA aal2 si facteur actif" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.mfa_conforme()) WITH CHECK (public.mfa_conforme())', t);
  END LOOP;
END $$;