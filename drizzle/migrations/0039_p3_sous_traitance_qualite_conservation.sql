CREATE TABLE public.sante_sous_traitance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  demande_id uuid NOT NULL REFERENCES public.sante_demandes_labo(id),
  analyse_id uuid NOT NULL REFERENCES public.sante_analyses(id),
  laboratoire text NOT NULL,
  reference_externe text,
  statut text NOT NULL DEFAULT 'envoye' CHECK (statut IN ('envoye','recu','annule')),
  envoye_le timestamptz NOT NULL DEFAULT now(), envoye_par uuid DEFAULT auth.uid(),
  recu_le timestamptz, recu_par uuid,
  UNIQUE (demande_id, analyse_id)
);
CREATE TABLE public.sante_non_conformites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  demande_id uuid REFERENCES public.sante_demandes_labo(id),
  type text NOT NULL CHECK (type IN ('preanalytique','analytique','postanalytique','eeq','equipement','reclamation','autre')),
  gravite text NOT NULL DEFAULT 'mineure' CHECK (gravite IN ('mineure','majeure','critique')),
  description text NOT NULL,
  action_corrective text,
  statut text NOT NULL DEFAULT 'ouverte' CHECK (statut IN ('ouverte','en_cours','cloturee')),
  cree_par uuid DEFAULT auth.uid(), cree_le timestamptz NOT NULL DEFAULT now(),
  cloture_par uuid, cloture_le timestamptz
);
CREATE TABLE public.sante_eeq (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  organisme text NOT NULL, campagne text NOT NULL, analyse_libelle text NOT NULL,
  date_campagne date NOT NULL DEFAULT current_date,
  valeur_obtenue numeric NOT NULL, valeur_cible numeric NOT NULL, ecart_type numeric NOT NULL CHECK (ecart_type > 0),
  zscore numeric GENERATED ALWAYS AS (round((valeur_obtenue - valeur_cible) / ecart_type, 2)) STORED,
  non_conformite_id uuid REFERENCES public.sante_non_conformites(id),
  saisi_par uuid DEFAULT auth.uid(), saisi_le timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sante_sous_traitance, public.sante_non_conformites, public.sante_eeq TO authenticated;
GRANT ALL ON public.sante_sous_traitance, public.sante_non_conformites, public.sante_eeq TO service_role;
ALTER TABLE public.sante_sous_traitance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sante_non_conformites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sante_eeq ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture sous-traitance labo" ON public.sante_sous_traitance FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste','technicien','preleveur','secretaire']));
CREATE POLICY "Lecture non-conformités labo" ON public.sante_non_conformites FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste','technicien']));
CREATE POLICY "Lecture EEQ labo" ON public.sante_eeq FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste','technicien']));

CREATE OR REPLACE FUNCTION public.sante_envoyer_sous_traitance(_demande_id uuid, _analyse_id uuid, _laboratoire text, _reference text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d sante_demandes_labo; _id uuid;
BEGIN
  SELECT * INTO d FROM sante_demandes_labo WHERE id=_demande_id;
  IF d.id IS NULL OR NOT has_any_medical_role(d.structure_id, ARRAY['technicien','biologiste']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF d.statut NOT IN ('prelevee','recue','en_analyse') THEN RAISE EXCEPTION 'Envoi possible seulement entre le prélèvement et la validation'; END IF;
  IF NOT EXISTS (SELECT 1 FROM sante_demande_analyses WHERE demande_id=_demande_id AND analyse_id=_analyse_id) THEN RAISE EXCEPTION 'Analyse absente de la demande'; END IF;
  IF coalesce(trim(_laboratoire),'') = '' THEN RAISE EXCEPTION 'Laboratoire destinataire obligatoire'; END IF;
  INSERT INTO sante_sous_traitance(structure_id, demande_id, analyse_id, laboratoire, reference_externe)
  VALUES (d.structure_id, _demande_id, _analyse_id, trim(_laboratoire), nullif(trim(_reference),'')) RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.sante_recevoir_sous_traitance(_id uuid, _reference text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s sante_sous_traitance;
BEGIN
  SELECT * INTO s FROM sante_sous_traitance WHERE id=_id FOR UPDATE;
  IF s.id IS NULL OR NOT has_any_medical_role(s.structure_id, ARRAY['technicien','biologiste']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF s.statut <> 'envoye' THEN RAISE EXCEPTION 'Envoi déjà traité'; END IF;
  UPDATE sante_sous_traitance SET statut='recu', recu_le=now(), recu_par=auth.uid(), reference_externe=coalesce(nullif(trim(_reference),''), reference_externe) WHERE id=_id;
END $$;

CREATE OR REPLACE FUNCTION public.sante_declarer_non_conformite(_structure_id uuid, _demande_id uuid, _type text, _gravite text, _description text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF NOT has_any_medical_role(_structure_id, ARRAY['technicien','biologiste','admin_structure','preleveur']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _demande_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sante_demandes_labo WHERE id=_demande_id AND structure_id=_structure_id) THEN RAISE EXCEPTION 'Demande hors structure'; END IF;
  IF length(coalesce(trim(_description),'')) < 10 THEN RAISE EXCEPTION 'Description d''au moins 10 caractères'; END IF;
  INSERT INTO sante_non_conformites(structure_id, demande_id, type, gravite, description)
  VALUES (_structure_id, _demande_id, _type, coalesce(_gravite,'mineure'), trim(_description)) RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.sante_traiter_non_conformite(_id uuid, _action text, _cloturer boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n sante_non_conformites;
BEGIN
  SELECT * INTO n FROM sante_non_conformites WHERE id=_id FOR UPDATE;
  IF n.id IS NULL OR NOT has_any_medical_role(n.structure_id, ARRAY['biologiste','admin_structure']) THEN RAISE EXCEPTION 'Traitement réservé au biologiste ou à l''administrateur'; END IF;
  IF n.statut = 'cloturee' THEN RAISE EXCEPTION 'Non-conformité déjà clôturée'; END IF;
  IF coalesce(_cloturer,false) AND length(coalesce(trim(coalesce(nullif(trim(_action),''), n.action_corrective)),'')) < 10 THEN RAISE EXCEPTION 'Action corrective obligatoire pour clôturer'; END IF;
  UPDATE sante_non_conformites SET action_corrective = coalesce(nullif(trim(_action),''), action_corrective),
    statut = CASE WHEN _cloturer THEN 'cloturee' ELSE 'en_cours' END,
    cloture_par = CASE WHEN _cloturer THEN auth.uid() END, cloture_le = CASE WHEN _cloturer THEN now() END
  WHERE id=_id;
END $$;

CREATE OR REPLACE FUNCTION public.sante_saisir_eeq(_structure_id uuid, _organisme text, _campagne text, _analyse text, _date date, _obtenue numeric, _cible numeric, _ecart numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _z numeric; _nc uuid;
BEGIN
  IF NOT has_any_medical_role(_structure_id, ARRAY['technicien','biologiste']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  INSERT INTO sante_eeq(structure_id, organisme, campagne, analyse_libelle, date_campagne, valeur_obtenue, valeur_cible, ecart_type)
  VALUES (_structure_id, trim(_organisme), trim(_campagne), trim(_analyse), coalesce(_date, current_date), _obtenue, _cible, _ecart) RETURNING id, zscore INTO _id, _z;
  IF abs(_z) > 2 THEN
    INSERT INTO sante_non_conformites(structure_id, type, gravite, description)
    VALUES (_structure_id, 'eeq', CASE WHEN abs(_z) > 3 THEN 'majeure' ELSE 'mineure' END,
      format('EEQ %s / %s — %s : z-score %s (obtenu %s, cible %s)', _organisme, _campagne, _analyse, _z, _obtenue, _cible)) RETURNING id INTO _nc;
    UPDATE sante_eeq SET non_conformite_id=_nc WHERE id=_id;
  END IF;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.sante_eliminer_echantillons(_structure_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _j int; _n int;
BEGIN
  IF NOT has_any_medical_role(_structure_id, ARRAY['biologiste','admin_structure','technicien']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT conservation_echantillons_jours INTO _j FROM structures WHERE id=_structure_id;
  PERFORM set_config('sante.rectificatif','on',true);
  UPDATE sante_demandes_labo SET echantillon_elimine_le = now()
   WHERE structure_id=_structure_id AND echantillon_elimine_le IS NULL AND statut = 'validee'
     AND coalesce(validee_le, preleve_le, created_at) < now() - make_interval(days => _j);
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM set_config('sante.rectificatif','',true);
  IF _n > 0 THEN
    INSERT INTO medical_audit_log(structure_id, user_id, action, table_name, new_data)
    VALUES (_structure_id, auth.uid(), 'elimination_echantillons', 'sante_demandes_labo', jsonb_build_object('nombre', _n, 'conservation_jours', _j));
  END IF;
  RETURN _n;
END $$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['sante_envoyer_sous_traitance(uuid,uuid,text,text)','sante_recevoir_sous_traitance(uuid,text)',
    'sante_declarer_non_conformite(uuid,uuid,text,text,text)','sante_traiter_non_conformite(uuid,text,boolean)',
    'sante_saisir_eeq(uuid,text,text,text,date,numeric,numeric,numeric)','sante_eliminer_echantillons(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;