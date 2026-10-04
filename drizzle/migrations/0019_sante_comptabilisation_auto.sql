CREATE TABLE public.sante_compta_liens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  source_type text NOT NULL CHECK (source_type IN ('facture','avoir','encaissement')),
  source_id uuid NOT NULL,
  ecriture_id uuid,
  statut text NOT NULL CHECK (statut IN ('comptabilise','en_attente','erreur')),
  erreur text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id)
);
GRANT SELECT ON public.sante_compta_liens TO authenticated;
GRANT ALL ON public.sante_compta_liens TO service_role;
ALTER TABLE public.sante_compta_liens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "membres lisent liens compta" ON public.sante_compta_liens FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','caissier','comptable']));

CREATE OR REPLACE FUNCTION public.fn_creer_ecriture(_entreprise_id uuid, _exercice_id uuid, _journal_code text, _date date, _libelle text, _lignes jsonb, _piece text DEFAULT NULL::text, _statut text DEFAULT 'validee'::text, _origine text DEFAULT 'saisie'::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_debit numeric(18,2) := 0; v_credit numeric(18,2) := 0;
  v_nb int; v_seq bigint; v_id uuid; v_num text; l jsonb; i int := 0;
BEGIN
  IF NOT public.can_write_entreprise(_entreprise_id)
     AND NOT (_origine = 'sante' AND coalesce(current_setting('app.sante_compta', true),'') = '1') THEN
    RAISE EXCEPTION 'Droits insuffisants : le role lecteur ne peut pas saisir d''ecriture';
  END IF;
  IF public.exercice_est_cloture(_exercice_id) THEN
    RAISE EXCEPTION 'Exercice cloture : saisie impossible';
  END IF;
  IF _statut NOT IN ('brouillon','validee') THEN RAISE EXCEPTION 'Statut invalide'; END IF;
  IF _journal_code IS NULL OR _journal_code !~ '^(AN|AC|VT|BQ|CA|OD|PA)$' THEN
    RAISE EXCEPTION 'Code journal non normalise (AN/AC/VT/BQ/CA/OD/PA)';
  END IF;
  IF _origine = 'saisie' AND (_piece IS NULL OR length(trim(_piece)) = 0) THEN
    RAISE EXCEPTION 'Piece justificative obligatoire pour une saisie manuelle';
  END IF;
  v_nb := jsonb_array_length(COALESCE(_lignes, '[]'::jsonb));
  IF v_nb < 2 THEN RAISE EXCEPTION 'Une ecriture doit comporter au moins deux lignes'; END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(_lignes) LOOP
    IF _origine NOT IN ('cloture','contrepassation') AND (l->>'compte') ~ '^13' THEN
      RAISE EXCEPTION 'Compte % interdit : le resultat de l''exercice est determine par la cloture', l->>'compte';
    END IF;
    v_debit  := v_debit  + ROUND(COALESCE((l->>'debit')::numeric, 0), 2);
    v_credit := v_credit + ROUND(COALESCE((l->>'credit')::numeric, 0), 2);
  END LOOP;
  IF v_debit <> v_credit THEN
    RAISE EXCEPTION 'Ecriture desequilibree : debit % <> credit %', v_debit, v_credit;
  END IF;
  IF v_debit = 0 THEN RAISE EXCEPTION 'Ecriture de montant nul'; END IF;
  INSERT INTO public.ecriture_sequences (entreprise_id, exercice_id, journal_code, dernier_numero)
  VALUES (_entreprise_id, _exercice_id, _journal_code, 1)
  ON CONFLICT (entreprise_id, exercice_id, journal_code)
  DO UPDATE SET dernier_numero = public.ecriture_sequences.dernier_numero + 1
  RETURNING dernier_numero INTO v_seq;
  v_num := _journal_code || '-' || to_char(_date, 'YYYY') || '-' || lpad(v_seq::text, 6, '0');
  INSERT INTO public.ecritures (entreprise_id, exercice_id, journal_code, numero_sequence, numero,
    date_ecriture, piece, libelle, statut, total_debit, total_credit, origine, created_by, valide_par, valide_le)
  VALUES (_entreprise_id, _exercice_id, _journal_code, v_seq, v_num, _date, COALESCE(_piece, v_num),
    _libelle, _statut, v_debit, v_credit, _origine, auth.uid(),
    CASE WHEN _statut='validee' THEN auth.uid() END, CASE WHEN _statut='validee' THEN now() END)
  RETURNING id INTO v_id;
  FOR l IN SELECT * FROM jsonb_array_elements(_lignes) LOOP
    INSERT INTO public.ecriture_lignes (ecriture_id, entreprise_id, exercice_id, ordre, compte,
      intitule, libelle, debit, credit)
    VALUES (v_id, _entreprise_id, _exercice_id, i, l->>'compte', COALESCE(l->>'intitule',''),
      COALESCE(l->>'libelle', _libelle), ROUND(COALESCE((l->>'debit')::numeric,0),2),
      ROUND(COALESCE((l->>'credit')::numeric,0),2));
    INSERT INTO public.journal (entreprise_id, exercice_id, ecriture_id, date_ecriture, piece,
      journal_code, libelle, compte, intitule, debit, credit, statut_validation,
      ecriture_numero, compte_auxiliaire, auxiliaire_libelle)
    VALUES (_entreprise_id, _exercice_id, v_id, _date, COALESCE(_piece, v_num), _journal_code,
      COALESCE(l->>'libelle', _libelle), l->>'compte', COALESCE(l->>'intitule',''),
      ROUND(COALESCE((l->>'debit')::numeric,0),2), ROUND(COALESCE((l->>'credit')::numeric,0),2),
      CASE WHEN _statut='validee' THEN 'valide' ELSE 'brouillon' END,
      v_num, l->>'compte_auxiliaire', l->>'auxiliaire_libelle');
    i := i + 1;
  END LOOP;
  INSERT INTO public.journal_audit (journal_id, entreprise_id, exercice_id, action, new_data, user_id)
  VALUES (NULL, _entreprise_id, _exercice_id, 'ECRITURE_' || upper(_statut),
    jsonb_build_object('ecriture_id', v_id, 'numero', v_num, 'total', v_debit), auth.uid());
  PERFORM public.fn_refresh_balance();
  RETURN v_id;
END; $function$;

-- Écriture santé : jamais bloquante pour la facturation, résultat tracé dans sante_compta_liens.
CREATE OR REPLACE FUNCTION public.sante_comptabiliser(_structure_id uuid, _type text, _source uuid, _journal text, _date date, _libelle text, _piece text, _lignes jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ent uuid; _exe uuid; _ecr uuid; _propres jsonb;
BEGIN
  SELECT entreprise_id INTO _ent FROM structures WHERE id = _structure_id;
  IF _ent IS NULL THEN
    INSERT INTO sante_compta_liens(structure_id, source_type, source_id, statut, erreur) VALUES (_structure_id, _type, _source, 'en_attente', 'Structure non reliée à une entreprise comptable') ON CONFLICT DO NOTHING;
    RETURN;
  END IF;
  SELECT id INTO _exe FROM exercices WHERE entreprise_id = _ent AND statut = 'en_cours' AND _date BETWEEN date_debut AND date_fin ORDER BY annee DESC LIMIT 1;
  IF _exe IS NULL THEN
    INSERT INTO sante_compta_liens(structure_id, source_type, source_id, statut, erreur) VALUES (_structure_id, _type, _source, 'en_attente', 'Aucun exercice ouvert à cette date') ON CONFLICT DO NOTHING;
    RETURN;
  END IF;
  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO _propres FROM jsonb_array_elements(_lignes) x
    WHERE coalesce((x->>'debit')::numeric,0) <> 0 OR coalesce((x->>'credit')::numeric,0) <> 0;
  BEGIN
    PERFORM set_config('app.sante_compta','1',true);
    _ecr := fn_creer_ecriture(_ent, _exe, _journal, _date, _libelle, _propres, _piece, 'validee', 'sante');
    PERFORM set_config('app.sante_compta','',true);
    INSERT INTO sante_compta_liens(structure_id, source_type, source_id, ecriture_id, statut) VALUES (_structure_id, _type, _source, _ecr, 'comptabilise') ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.sante_compta','',true);
    INSERT INTO sante_compta_liens(structure_id, source_type, source_id, statut, erreur) VALUES (_structure_id, _type, _source, 'erreur', left(SQLERRM, 300)) ON CONFLICT DO NOTHING;
  END;
END $$;
REVOKE EXECUTE ON FUNCTION public.sante_comptabiliser(uuid,text,uuid,text,date,text,text,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_sante_facture_compta() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p record; _net numeric; _s int; _l jsonb;
BEGIN
  SELECT numero_dossier, nom, prenoms INTO _p FROM sante_patients WHERE id = NEW.patient_id;
  _net := NEW.total - coalesce(NEW.remise,0);
  _s := CASE WHEN NEW.type = 'avoir' THEN -1 ELSE 1 END;
  -- Facture : D 4111 patient / D 4114 organisme / C 706 ; avoir : sens inversé (montants positifs).
  _l := jsonb_build_array(
    jsonb_build_object('compte','4111','intitule','Patients','libelle',NEW.numero,
      CASE WHEN _s=1 THEN 'debit' ELSE 'credit' END, abs(NEW.part_patient),
      'compte_auxiliaire', _p.numero_dossier, 'auxiliaire_libelle', _p.nom || ' ' || _p.prenoms),
    jsonb_build_object('compte','4114','intitule','Organismes tiers-payant','libelle',NEW.numero,
      CASE WHEN _s=1 THEN 'debit' ELSE 'credit' END, abs(NEW.part_organisme),
      'compte_auxiliaire', NEW.organisme, 'auxiliaire_libelle', NEW.organisme),
    jsonb_build_object('compte','706','intitule','Prestations de services','libelle',NEW.numero,
      CASE WHEN _s=1 THEN 'credit' ELSE 'debit' END, abs(_net)));
  PERFORM sante_comptabiliser(NEW.structure_id, NEW.type, NEW.id, 'VT', NEW.created_at::date,
    CASE WHEN _s=1 THEN 'Facture santé ' ELSE 'Avoir santé ' END || NEW.numero, NEW.numero, _l);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.trg_sante_encaissement_compta() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _f sante_factures; _tresor text; _tiers text; _journal text;
BEGIN
  SELECT * INTO _f FROM sante_factures WHERE id = NEW.facture_id;
  _tresor := CASE NEW.mode WHEN 'especes' THEN '571' WHEN 'cheque' THEN '513'
    WHEN 'wave' THEN '5215' WHEN 'orange_money' THEN '5215' WHEN 'free_money' THEN '5215' WHEN 'wizall' THEN '5215'
    ELSE '521' END;
  _journal := CASE WHEN _tresor = '571' THEN 'CA' ELSE 'BQ' END;
  _tiers := CASE WHEN NEW.mode = 'organisme' THEN '4114' ELSE '4111' END;
  PERFORM sante_comptabiliser(NEW.structure_id, 'encaissement', NEW.id, _journal, NEW.created_at::date,
    'Encaissement ' || _f.numero || ' (' || NEW.mode || ')', _f.numero,
    jsonb_build_array(
      jsonb_build_object('compte', _tresor, 'intitule', 'Trésorerie', 'debit', NEW.montant),
      jsonb_build_object('compte', _tiers, 'intitule', CASE WHEN _tiers='4114' THEN 'Organismes tiers-payant' ELSE 'Patients' END,
        'credit', NEW.montant, 'compte_auxiliaire', coalesce(_f.organisme, ''))));
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.trg_sante_facture_compta() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_sante_encaissement_compta() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER sante_facture_compta AFTER INSERT ON public.sante_factures FOR EACH ROW EXECUTE FUNCTION public.trg_sante_facture_compta();
CREATE TRIGGER sante_encaissement_compta AFTER INSERT ON public.sante_encaissements FOR EACH ROW EXECUTE FUNCTION public.trg_sante_encaissement_compta();

-- Registre des violations de données (conformité)
CREATE TABLE public.sante_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  detectee_le timestamptz NOT NULL DEFAULT now(),
  nature text NOT NULL,
  donnees_concernees text NOT NULL,
  nb_personnes integer,
  mesures text,
  notifiee_cdp_le timestamptz,
  personnes_informees_le timestamptz,
  declare_par uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sante_violations TO authenticated;
GRANT ALL ON public.sante_violations TO service_role;
ALTER TABLE public.sante_violations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin lit violations" ON public.sante_violations FOR SELECT TO authenticated USING (public.is_structure_admin(structure_id));
CREATE POLICY "membre declare violation" ON public.sante_violations FOR INSERT TO authenticated WITH CHECK (public.is_structure_member(structure_id) AND declare_par = auth.uid());
CREATE POLICY "admin complete violation" ON public.sante_violations FOR UPDATE TO authenticated USING (public.is_structure_admin(structure_id)) WITH CHECK (public.is_structure_admin(structure_id));
CREATE TRIGGER sante_violations_audit AFTER INSERT OR UPDATE ON public.sante_violations FOR EACH ROW EXECUTE FUNCTION public.audit_sante_row();