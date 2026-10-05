-- ===== Catalogue : catégorie, TVA, accord préalable =====
ALTER TABLE public.sante_actes ADD COLUMN IF NOT EXISTS categorie text NOT NULL DEFAULT 'consultation';
ALTER TABLE public.sante_actes ADD COLUMN IF NOT EXISTS taux_tva numeric NOT NULL DEFAULT 18;
ALTER TABLE public.sante_actes ADD COLUMN IF NOT EXISTS accord_prealable boolean NOT NULL DEFAULT false;
ALTER TABLE public.sante_analyses ADD COLUMN IF NOT EXISTS regime_tva text NOT NULL DEFAULT 'a_valider';
ALTER TABLE public.sante_analyses ADD COLUMN IF NOT EXISTS taux_tva numeric NOT NULL DEFAULT 18;
ALTER TABLE public.sante_analyses ADD COLUMN IF NOT EXISTS accord_prealable boolean NOT NULL DEFAULT false;

-- ===== Structure : TVA, compte rendu conditionné =====
ALTER TABLE public.structures ADD COLUMN IF NOT EXISTS regime_tva text NOT NULL DEFAULT 'exonere';
ALTER TABLE public.structures ADD COLUMN IF NOT EXISTS prorata_tva numeric NOT NULL DEFAULT 0;
ALTER TABLE public.structures ADD COLUMN IF NOT EXISTS cr_conditionne_reglement boolean NOT NULL DEFAULT false;

-- ===== Facture : TVA, bon, analytique =====
ALTER TABLE public.sante_facture_lignes ADD COLUMN IF NOT EXISTS categorie text;
ALTER TABLE public.sante_facture_lignes ADD COLUMN IF NOT EXISTS taux_tva numeric NOT NULL DEFAULT 0;
ALTER TABLE public.sante_facture_lignes ADD COLUMN IF NOT EXISTS montant_tva numeric NOT NULL DEFAULT 0;
ALTER TABLE public.sante_facture_lignes ADD COLUMN IF NOT EXISTS part_organisme numeric NOT NULL DEFAULT 0;
ALTER TABLE public.sante_factures ADD COLUMN IF NOT EXISTS montant_tva numeric NOT NULL DEFAULT 0;
ALTER TABLE public.sante_factures ADD COLUMN IF NOT EXISTS bon_id uuid;
ALTER TABLE public.sante_factures ADD COLUMN IF NOT EXISTS praticien_id uuid;
ALTER TABLE public.sante_factures ADD COLUMN IF NOT EXISTS site_id uuid;
ALTER TABLE public.sante_factures ADD COLUMN IF NOT EXISTS facture_secours boolean NOT NULL DEFAULT false;

-- ===== Conventions tiers-payant =====
CREATE TABLE public.sante_conventions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  organisme text NOT NULL,
  categorie text NOT NULL CHECK (categorie IN ('consultation','acte','analyses','medicaments','autres')),
  taux numeric NOT NULL CHECK (taux BETWEEN 0 AND 100),
  plafond numeric, franchise numeric NOT NULL DEFAULT 0,
  date_debut date, date_fin date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (structure_id, organisme, categorie)
);
CREATE TABLE public.sante_convention_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  organisme text NOT NULL, code text NOT NULL,
  UNIQUE (structure_id, organisme, code)
);
CREATE TABLE public.sante_tarifs_convention (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  organisme text NOT NULL, code text NOT NULL, tarif numeric NOT NULL CHECK (tarif >= 0),
  UNIQUE (structure_id, organisme, code)
);
CREATE TABLE public.sante_bons_pec (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.sante_patients(id),
  organisme text NOT NULL, numero text NOT NULL,
  date_debut date NOT NULL DEFAULT current_date, date_fin date NOT NULL,
  plafond numeric, consomme numeric NOT NULL DEFAULT 0,
  accord_prealable boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (structure_id, organisme, numero)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sante_conventions, public.sante_convention_exclusions, public.sante_tarifs_convention TO authenticated;
GRANT SELECT, INSERT ON public.sante_bons_pec TO authenticated;
GRANT ALL ON public.sante_conventions, public.sante_convention_exclusions, public.sante_tarifs_convention, public.sante_bons_pec TO service_role;
ALTER TABLE public.sante_conventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sante_convention_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sante_tarifs_convention ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sante_bons_pec ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['sante_conventions','sante_convention_exclusions','sante_tarifs_convention'] LOOP
    EXECUTE format('CREATE POLICY "Lecture %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY[''admin_structure'',''caissier'',''secretaire'',''comptable'',''tiers_payant'']))', t);
    EXECUTE format('CREATE POLICY "Ecriture %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.has_any_medical_role(structure_id, ARRAY[''admin_structure'',''tiers_payant'']))', t);
    EXECUTE format('CREATE POLICY "Maj %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY[''admin_structure'',''tiers_payant'']))', t);
    EXECUTE format('CREATE POLICY "Suppr %1$s" ON public.%1$I FOR DELETE TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY[''admin_structure'',''tiers_payant'']))', t);
  END LOOP;
END $$;
CREATE POLICY "Lecture bons" ON public.sante_bons_pec FOR SELECT TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','caissier','secretaire','tiers_payant']));
CREATE POLICY "Ajout bons" ON public.sante_bons_pec FOR INSERT TO authenticated WITH CHECK (public.has_any_medical_role(structure_id, ARRAY['admin_structure','caissier','secretaire','tiers_payant']) AND consomme = 0);

-- ===== Comptes divisionnaires et TVA (défauts à confirmer) =====
CREATE OR REPLACE FUNCTION public.sante_compte_defaut(_cle text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _cle
    WHEN 'patients' THEN '4111' WHEN 'organismes' THEN '4114' WHEN 'produits' THEN '706'
    WHEN 'produits_consultation' THEN '706' WHEN 'produits_acte' THEN '706' WHEN 'produits_analyses' THEN '706'
    WHEN 'produits_medicaments' THEN '706' WHEN 'produits_autres' THEN '706'
    WHEN 'tva_collectee' THEN '4431'
    WHEN 'especes' THEN '571' WHEN 'mobile_money' THEN '5215' WHEN 'carte' THEN '521'
    WHEN 'cheques_a_encaisser' THEN '513' WHEN 'banque' THEN '521'
    WHEN 'ecart_caisse_perte' THEN '658' WHEN 'ecart_caisse_gain' THEN '758' WHEN 'perte_creance' THEN '651'
    WHEN 'dotation_provision' THEN '6594' WHEN 'provision_creance' THEN '4914'
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.sante_categorie_code(_structure_id uuid, _code text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT 'analyses' FROM sante_analyses WHERE structure_id=_structure_id AND code=_code LIMIT 1),
    (SELECT categorie FROM sante_actes WHERE structure_id=_structure_id AND code=_code LIMIT 1),
    'autres')
$$;

-- Lignes comptables d'une facture/avoir : produits par catégorie (HT), TVA collectée, créances
CREATE OR REPLACE FUNCTION public.sante_lignes_compta_facture(_facture_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE f sante_factures; src uuid; _net numeric; _base numeric; _coef numeric; _s int; d text; c text; _l jsonb; r record; _tva numeric := 0; _somme numeric := 0; _ht numeric; _last int;
BEGIN
  SELECT * INTO f FROM sante_factures WHERE id = _facture_id;
  _s := CASE WHEN f.type='avoir' THEN -1 ELSE 1 END;
  d := CASE WHEN _s=1 THEN 'debit' ELSE 'credit' END; c := CASE WHEN _s=1 THEN 'credit' ELSE 'debit' END;
  _net := abs(f.total - coalesce(f.remise,0));
  src := CASE WHEN f.type='avoir' THEN coalesce(f.facture_origine_id, f.id) ELSE f.id END;
  SELECT coalesce(sum(montant),0) INTO _base FROM sante_facture_lignes WHERE facture_id = src;
  _coef := CASE WHEN _base > 0 THEN _net / _base ELSE 0 END;
  _l := jsonb_build_array(
    jsonb_build_object('compte', sante_compte(f.structure_id,'patients'), 'intitule','Patients','libelle',f.numero, d, abs(f.part_patient)),
    jsonb_build_object('compte', sante_compte(f.structure_id,'organismes'), 'intitule','Organismes tiers-payant','libelle',f.numero, d, abs(f.part_organisme),
      'compte_auxiliaire', sante_aux_organisme(f.structure_id, f.organisme), 'auxiliaire_libelle', f.organisme));
  IF _base = 0 THEN
    RETURN _l || jsonb_build_array(jsonb_build_object('compte', sante_compte(f.structure_id,'produits'), 'intitule','Prestations de services','libelle',f.numero, c, _net));
  END IF;
  FOR r IN SELECT coalesce(categorie, sante_categorie_code(f.structure_id, code)) cat, sum(montant) m, sum(montant_tva) t
           FROM sante_facture_lignes WHERE facture_id = src GROUP BY 1 ORDER BY 2 DESC LOOP
    _ht := round((r.m - r.t) * _coef);
    _tva := _tva + round(r.t * _coef);
    _somme := _somme + _ht;
    _l := _l || jsonb_build_array(jsonb_build_object('compte', sante_compte(f.structure_id, 'produits_' || r.cat), 'intitule','Prestations — ' || r.cat, 'libelle', f.numero, c, _ht));
  END LOOP;
  IF _tva > 0 THEN
    _l := _l || jsonb_build_array(jsonb_build_object('compte', sante_compte(f.structure_id,'tva_collectee'), 'intitule','TVA collectée', 'libelle', f.numero, c, _tva));
  END IF;
  -- arrondi : l'écart éventuel va sur la première ligne de produits
  IF _somme + _tva <> _net THEN
    _last := 2;
    _l := jsonb_set(_l, ARRAY[_last::text, c], to_jsonb(((_l->_last->>c)::numeric + (_net - _somme - _tva))));
  END IF;
  RETURN _l;
END $$;

CREATE OR REPLACE FUNCTION public.trg_sante_facture_compta()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM sante_comptabiliser(NEW.structure_id, NEW.type, NEW.id, 'VT', NEW.created_at::date,
    CASE WHEN NEW.type='avoir' THEN 'Avoir santé ' ELSE 'Facture santé ' END || NEW.numero, NEW.numero, sante_lignes_compta_facture(NEW.id));
  RETURN NEW;
END $$;
-- La comptabilisation doit voir les lignes : déclencheur différé en fin de transaction
DROP TRIGGER IF EXISTS sante_facture_compta ON public.sante_factures;
CREATE CONSTRAINT TRIGGER sante_facture_compta AFTER INSERT ON public.sante_factures
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.trg_sante_facture_compta();

-- ===== Unicité inter-modules (santé + Honoraires comptables) =====
ALTER TABLE public.sante_facturation_sources ALTER COLUMN facture_id DROP NOT NULL;
ALTER TABLE public.sante_facturation_sources ADD COLUMN IF NOT EXISTS facture_compta_id uuid;
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS sante_source_type text;
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS sante_source_id uuid;
CREATE OR REPLACE FUNCTION public.trg_facture_compta_source_sante()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s uuid;
BEGIN
  IF NEW.sante_source_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.sante_source_type NOT IN ('consultation','demande_analyse') THEN RAISE EXCEPTION 'Type de source santé invalide'; END IF;
  _s := CASE NEW.sante_source_type WHEN 'consultation' THEN (SELECT structure_id FROM sante_consultations WHERE id = NEW.sante_source_id)
        ELSE (SELECT structure_id FROM sante_demande_analyses WHERE id = NEW.sante_source_id) END;
  IF _s IS NULL OR (SELECT entreprise_id FROM structures WHERE id = _s) IS DISTINCT FROM NEW.entreprise_id THEN RAISE EXCEPTION 'Source santé inconnue pour cette entreprise'; END IF;
  INSERT INTO sante_facturation_sources(structure_id, source_type, source_id, facture_compta_id) VALUES (_s, NEW.sante_source_type, NEW.sante_source_id, NEW.id);
  RETURN NEW;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Déjà facturé : cet acte ou cette analyse figure sur une facture active (tous modules confondus)';
END $$;
DROP TRIGGER IF EXISTS facture_compta_source_sante ON public.factures;
CREATE TRIGGER facture_compta_source_sante AFTER INSERT ON public.factures FOR EACH ROW EXECUTE FUNCTION public.trg_facture_compta_source_sante();
REVOKE EXECUTE ON FUNCTION public.trg_facture_compta_source_sante() FROM PUBLIC, anon, authenticated;

-- ===== Création de facture : conventions, exclusions, tarifs, bon, accord préalable, TVA, analytique, secours =====
CREATE OR REPLACE FUNCTION public.sante_creer_facture_interne(_patient_id uuid, _lignes jsonb, _assurance_id uuid, _remise numeric, _motif_remise text, _consultation_id uuid, _demande_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s uuid; _st structures; _total numeric := 0; _l jsonb; _id uuid; _org text; _taux numeric := 0; _plafond numeric; _po numeric := 0; _net numeric;
  _code text; _cat text; _pu numeric; _q numeric; _m numeric; _tl numeric; _pol numeric; _tva numeric; _tauxtva numeric; _reg text; _accord boolean;
  _conv sante_conventions; _bon sante_bons_pec; _calc jsonb := '[]'::jsonb; _parcat jsonb := '{}'::jsonb; _tvatot numeric := 0; _coef numeric; _k text; _v numeric;
  _numero text; _prat uuid;
BEGIN
  SELECT structure_id INTO _s FROM sante_patients WHERE id = _patient_id;
  IF _s IS NULL THEN RAISE EXCEPTION 'Patient introuvable'; END IF;
  SELECT * INTO _st FROM structures WHERE id = _s;
  IF jsonb_typeof(_lignes) <> 'array' OR jsonb_array_length(_lignes) = 0 THEN RAISE EXCEPTION 'Au moins une ligne est requise'; END IF;
  IF coalesce(_remise,0) < 0 THEN RAISE EXCEPTION 'Remise invalide'; END IF;
  IF _assurance_id IS NOT NULL THEN
    SELECT organisme, taux_couverture, plafond INTO _org, _taux, _plafond FROM sante_patient_assurances
      WHERE id = _assurance_id AND patient_id = _patient_id AND (date_fin IS NULL OR date_fin >= current_date) AND (date_debut IS NULL OR date_debut <= current_date);
    IF _org IS NULL THEN RAISE EXCEPTION 'Prise en charge invalide ou expirée'; END IF;
    INSERT INTO sante_organismes(structure_id, nom) VALUES (_s, _org) ON CONFLICT DO NOTHING;
    SELECT * INTO _bon FROM sante_bons_pec WHERE structure_id=_s AND patient_id=_patient_id AND organisme=_org
      AND current_date BETWEEN date_debut AND date_fin AND (plafond IS NULL OR consomme < plafond) ORDER BY date_fin LIMIT 1;
  END IF;
  FOR _l IN SELECT * FROM jsonb_array_elements(_lignes) LOOP
    _code := _l->>'code'; _q := coalesce((_l->>'quantite')::numeric,1); _pu := (_l->>'prix_unitaire')::numeric;
    IF _pu IS NULL OR _pu < 0 OR _q <= 0 THEN RAISE EXCEPTION 'Ligne invalide'; END IF;
    _cat := sante_categorie_code(_s, _code);
    IF _org IS NOT NULL AND _code IS NOT NULL THEN
      _pu := coalesce((SELECT tarif FROM sante_tarifs_convention WHERE structure_id=_s AND organisme=_org AND code=_code), _pu);
    END IF;
    _m := round(_q * _pu);
    SELECT coalesce(a.regime_tva, ac.regime_tva, 'exonere'), coalesce(a.taux_tva, ac.taux_tva, 0), coalesce(a.accord_prealable, ac.accord_prealable, false)
      INTO _reg, _tauxtva, _accord
      FROM (SELECT 1) x LEFT JOIN sante_analyses a ON a.structure_id=_s AND a.code=_code LEFT JOIN sante_actes ac ON ac.structure_id=_s AND ac.code=_code LIMIT 1;
    _tva := CASE WHEN _reg = 'taxable' AND _st.regime_tva <> 'exonere' THEN round(_m * _tauxtva / (100 + _tauxtva)) ELSE 0 END;
    _pol := 0;
    IF _org IS NOT NULL THEN
      IF _accord AND (_bon.id IS NULL OR NOT _bon.accord_prealable) THEN
        RAISE EXCEPTION 'Accord préalable de l''organisme requis pour « % »', coalesce(_l->>'libelle', _code);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM sante_convention_exclusions WHERE structure_id=_s AND organisme=_org AND code=_code) THEN
        SELECT * INTO _conv FROM sante_conventions WHERE structure_id=_s AND organisme=_org AND categorie=_cat
          AND (date_debut IS NULL OR date_debut <= current_date) AND (date_fin IS NULL OR date_fin >= current_date);
        _tl := coalesce(_conv.taux, _taux, 0);
        _pol := round(_m * _tl / 100);
      END IF;
    END IF;
    _total := _total + _m; _tvatot := _tvatot + _tva;
    _parcat := jsonb_set(_parcat, ARRAY[_cat], to_jsonb(coalesce((_parcat->>_cat)::numeric,0) + _pol));
    _calc := _calc || jsonb_build_array(jsonb_build_object('libelle', _l->>'libelle', 'code', _code, 'q', _q, 'pu', _pu, 'm', _m, 'cat', _cat, 'tva', _tva, 'taux', CASE WHEN _tva > 0 THEN _tauxtva ELSE 0 END, 'po', _pol));
  END LOOP;
  IF coalesce(_remise,0) > _total THEN RAISE EXCEPTION 'Remise supérieure au total'; END IF;
  _net := _total - coalesce(_remise,0);
  IF _org IS NOT NULL THEN
    -- franchises et plafonds par catégorie
    FOR _k, _v IN SELECT key, value::numeric FROM jsonb_each_text(_parcat) LOOP
      SELECT * INTO _conv FROM sante_conventions WHERE structure_id=_s AND organisme=_org AND categorie=_k;
      IF _conv.id IS NOT NULL THEN
        _v := greatest(0, _v - coalesce(_conv.franchise,0));
        IF _conv.plafond IS NOT NULL THEN _v := least(_v, _conv.plafond); END IF;
      END IF;
      _po := _po + _v;
    END LOOP;
    _coef := CASE WHEN _total > 0 THEN _net / _total ELSE 0 END;
    _po := round(_po * _coef);
    IF _plafond IS NOT NULL AND _po > _plafond THEN _po := _plafond; END IF;
    IF _bon.id IS NOT NULL AND _bon.plafond IS NOT NULL THEN _po := least(_po, _bon.plafond - _bon.consomme); END IF;
    _po := greatest(0, least(_po, _net));
  END IF;
  IF _consultation_id IS NOT NULL THEN SELECT praticien_id INTO _prat FROM sante_consultations WHERE id = _consultation_id; END IF;
  _numero := nullif(current_setting('sante.numero_force', true), '');
  INSERT INTO sante_factures(structure_id, numero, patient_id, consultation_id, demande_id, organisme, taux_couverture, total, remise, motif_remise, part_organisme, part_patient, statut_tiers, montant_tva, bon_id, praticien_id, facture_secours)
  VALUES (_s, coalesce(_numero, sante_prochain_numero(_s,'facture','FAC')), _patient_id, _consultation_id, _demande_id, _org, coalesce(_taux,0), _total, coalesce(_remise,0), _motif_remise, _po, _net - _po,
    CASE WHEN _po > 0 THEN 'a_facturer' ELSE 'sans' END, _tvatot, _bon.id, _prat, _numero IS NOT NULL)
  RETURNING id INTO _id;
  INSERT INTO sante_facture_lignes(facture_id, structure_id, libelle, code, quantite, prix_unitaire, montant, categorie, taux_tva, montant_tva, part_organisme)
  SELECT _id, _s, x->>'libelle', x->>'code', (x->>'q')::numeric, (x->>'pu')::numeric, (x->>'m')::numeric, x->>'cat', (x->>'taux')::numeric, (x->>'tva')::numeric, (x->>'po')::numeric
  FROM jsonb_array_elements(_calc) x;
  IF _bon.id IS NOT NULL AND _po > 0 THEN UPDATE sante_bons_pec SET consomme = consomme + _po WHERE id = _bon.id; END IF;
  BEGIN
    IF _consultation_id IS NOT NULL THEN
      INSERT INTO sante_facturation_sources(structure_id, source_type, source_id, facture_id) VALUES (_s, 'consultation', _consultation_id, _id);
    END IF;
    IF _demande_id IS NOT NULL THEN
      INSERT INTO sante_facturation_sources(structure_id, source_type, source_id, facture_id)
      SELECT _s, 'demande_analyse', da.id, _id FROM sante_demande_analyses da WHERE da.demande_id = _demande_id;
    END IF;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Déjà facturé : cet acte ou cette analyse figure sur une facture active (tous modules confondus)';
  END;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.sante_creer_facture_interne(uuid,jsonb,uuid,numeric,text,uuid,uuid) FROM PUBLIC, anon, authenticated;

-- ===== Blocs de numéros réservés (mode secours papier) =====
CREATE TABLE public.sante_blocs_secours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  poste text NOT NULL, annee integer NOT NULL, debut bigint NOT NULL, fin bigint NOT NULL,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sante_blocs_secours TO authenticated;
GRANT ALL ON public.sante_blocs_secours TO service_role;
ALTER TABLE public.sante_blocs_secours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture blocs" ON public.sante_blocs_secours FOR SELECT TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','caissier']));

CREATE OR REPLACE FUNCTION public.sante_reserver_bloc(_structure_id uuid, _poste text, _taille integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _an int := extract(year FROM now())::int; _fin bigint; _id uuid;
BEGIN
  IF NOT is_structure_admin(_structure_id) THEN RAISE EXCEPTION 'Réservé à l''administrateur'; END IF;
  IF _taille NOT BETWEEN 10 AND 500 OR coalesce(trim(_poste),'') = '' THEN RAISE EXCEPTION 'Bloc invalide (10 à 500 numéros, poste obligatoire)'; END IF;
  INSERT INTO sante_sequences(structure_id, type, annee, dernier) VALUES (_structure_id, 'facture', _an, _taille)
  ON CONFLICT (structure_id, type, annee) DO UPDATE SET dernier = sante_sequences.dernier + _taille RETURNING dernier INTO _fin;
  INSERT INTO sante_blocs_secours(structure_id, poste, annee, debut, fin) VALUES (_structure_id, trim(_poste), _an, _fin - _taille + 1, _fin) RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.sante_saisir_facture_secours(_bloc_id uuid, _rang bigint, _patient_id uuid, _lignes jsonb, _assurance_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b sante_blocs_secours; _num text; _id uuid;
BEGIN
  SELECT * INTO b FROM sante_blocs_secours WHERE id = _bloc_id;
  IF b.id IS NULL OR NOT has_any_medical_role(b.structure_id, ARRAY['admin_structure','caissier']) THEN RAISE EXCEPTION 'Droit insuffisant'; END IF;
  IF _rang NOT BETWEEN b.debut AND b.fin THEN RAISE EXCEPTION 'Numéro hors du bloc réservé (% à %)', b.debut, b.fin; END IF;
  _num := 'FAC' || b.annee || '-' || lpad(_rang::text, 6, '0');
  IF EXISTS (SELECT 1 FROM sante_factures WHERE structure_id = b.structure_id AND numero = _num) THEN RAISE EXCEPTION 'Numéro déjà saisi'; END IF;
  PERFORM set_config('sante.numero_force', _num, true);
  _id := sante_creer_facture_interne(_patient_id, _lignes, _assurance_id, 0, NULL, NULL, NULL);
  PERFORM set_config('sante.numero_force', '', true);
  RETURN _id;
END $$;

-- ===== Compte rendu conditionné au règlement =====
CREATE OR REPLACE FUNCTION public.sante_cr_remettable(_demande_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT coalesce((SELECT s.cr_conditionne_reglement FROM sante_demandes_labo d JOIN structures s ON s.id=d.structure_id WHERE d.id=_demande_id), false)
    OR NOT EXISTS (SELECT 1 FROM sante_factures f WHERE f.demande_id = _demande_id AND f.type='facture' AND NOT f.annulee
      AND f.part_patient > coalesce((SELECT sum(montant) FROM sante_encaissements e WHERE e.facture_id=f.id AND e.mode <> 'organisme'),0))
$$;

-- ===== Relances, créances âgées, provisions =====
CREATE TABLE public.sante_relances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  organisme text NOT NULL, niveau integer NOT NULL, montant numeric NOT NULL, factures uuid[] NOT NULL,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sante_relances TO authenticated;
GRANT ALL ON public.sante_relances TO service_role;
ALTER TABLE public.sante_relances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture relances" ON public.sante_relances FOR SELECT TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','comptable','tiers_payant']));

CREATE OR REPLACE FUNCTION public.sante_creances_organismes(_structure_id uuid)
RETURNS TABLE(organisme text, nb bigint, j0_30 numeric, j31_60 numeric, j61_90 numeric, plus_90 numeric, total numeric, derniere_relance timestamptz, niveau integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_any_medical_role(_structure_id, ARRAY['admin_structure','comptable','tiers_payant']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN QUERY
  WITH c AS (
    SELECT f.organisme o, sante_reste_organisme(f.id) r, current_date - coalesce(f.envoye_tiers_le, f.created_at)::date age
    FROM sante_factures f WHERE f.structure_id=_structure_id AND f.type='facture' AND NOT f.annulee AND f.part_organisme > 0 AND f.statut_tiers <> 'paye')
  SELECT c.o, count(*) FILTER (WHERE r > 0),
    sum(r) FILTER (WHERE age <= 30), sum(r) FILTER (WHERE age BETWEEN 31 AND 60), sum(r) FILTER (WHERE age BETWEEN 61 AND 90), sum(r) FILTER (WHERE age > 90), sum(r),
    (SELECT max(created_at) FROM sante_relances x WHERE x.structure_id=_structure_id AND x.organisme=c.o),
    (SELECT max(x.niveau) FROM sante_relances x WHERE x.structure_id=_structure_id AND x.organisme=c.o)
  FROM c WHERE r > 0 GROUP BY c.o ORDER BY sum(r) DESC;
END $$;

CREATE OR REPLACE FUNCTION public.sante_relancer(_structure_id uuid, _organisme text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ids uuid[]; _m numeric; _n int; _id uuid;
BEGIN
  IF NOT has_any_medical_role(_structure_id, ARRAY['admin_structure','comptable','tiers_payant']) THEN RAISE EXCEPTION 'Droit insuffisant'; END IF;
  SELECT array_agg(f.id), sum(sante_reste_organisme(f.id)) INTO _ids, _m FROM sante_factures f
    WHERE f.structure_id=_structure_id AND f.organisme=_organisme AND f.type='facture' AND NOT f.annulee AND f.statut_tiers='envoye' AND sante_reste_organisme(f.id) > 0;
  IF _ids IS NULL THEN RAISE EXCEPTION 'Aucune créance envoyée à relancer'; END IF;
  SELECT coalesce(max(niveau),0) + 1 INTO _n FROM sante_relances WHERE structure_id=_structure_id AND organisme=_organisme;
  INSERT INTO sante_relances(structure_id, organisme, niveau, montant, factures) VALUES (_structure_id, _organisme, _n, _m, _ids) RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.sante_provisionner_creance(_structure_id uuid, _organisme text, _montant numeric, _motif text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid := gen_random_uuid(); _ent uuid; _exe uuid;
BEGIN
  IF NOT has_any_medical_role(_structure_id, ARRAY['admin_structure','comptable']) THEN RAISE EXCEPTION 'Réservé à l''administrateur ou au comptable'; END IF;
  IF _montant IS NULL OR _montant <= 0 OR coalesce(trim(_motif),'') = '' THEN RAISE EXCEPTION 'Montant et motif obligatoires'; END IF;
  PERFORM sante_comptabiliser(_structure_id, 'provision_creance', _id, 'OD', current_date, 'Provision créance douteuse ' || _organisme, NULL, jsonb_build_array(
    jsonb_build_object('compte', sante_compte(_structure_id,'dotation_provision'), 'intitule','Dotation provisions créances', 'debit', round(_montant)),
    jsonb_build_object('compte', sante_compte(_structure_id,'provision_creance'), 'intitule','Provision créances douteuses', 'credit', round(_montant),
      'compte_auxiliaire', sante_aux_organisme(_structure_id, _organisme), 'auxiliaire_libelle', _organisme)));
  SELECT entreprise_id INTO _ent FROM structures WHERE id = _structure_id;
  SELECT id INTO _exe FROM exercices WHERE entreprise_id = _ent AND statut='en_cours' AND current_date BETWEEN date_debut AND date_fin LIMIT 1;
  IF _exe IS NOT NULL THEN
    INSERT INTO provisions(entreprise_id, exercice_id, code, libelle, nature, compte_provision, compte_dotation, montant_initial, montant_actuel, date_constitution, statut, notes)
    VALUES (_ent, _exe, 'SANTE-' || left(_id::text, 8), 'Créance douteuse ' || _organisme, 'creance', sante_compte(_structure_id,'provision_creance'), sante_compte(_structure_id,'dotation_provision'),
      round(_montant), round(_montant), current_date, 'active', trim(_motif));
  END IF;
  RETURN _id;
EXCEPTION WHEN check_violation OR not_null_violation THEN
  RETURN _id;
END $$;

-- ===== Lettrage automatique (compte organismes) =====
CREATE OR REPLACE FUNCTION public.sante_lettrer_facture(_facture_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f sante_factures; _compte text; _code text; _ecrs uuid[]; _n int := 0;
BEGIN
  SELECT * INTO f FROM sante_factures WHERE id = _facture_id;
  IF f.id IS NULL OR sante_reste_organisme(f.id) <> 0 OR f.part_organisme = 0 THEN RETURN 0; END IF;
  IF EXISTS (SELECT 1 FROM sante_compta_evenements e WHERE e.statut <> 'comptabilise' AND (
      (e.source_type='facture' AND e.source_id=f.id)
      OR (e.source_type='reglement_organisme' AND e.source_id IN (SELECT reglement_id FROM sante_reglement_imputations WHERE facture_id=f.id))
      OR (e.source_type='perte_creance' AND e.source_id IN (SELECT id FROM sante_tiers_rejets WHERE facture_id=f.id)))) THEN RETURN 0; END IF;
  _compte := sante_compte(f.structure_id, 'organismes');
  _code := 'S' || right(replace(f.numero,'-',''), 9);
  SELECT array_agg(ecriture_id) INTO _ecrs FROM sante_compta_evenements e WHERE e.statut='comptabilise' AND (
      (e.source_type='facture' AND e.source_id=f.id)
      OR (e.source_type='reglement_organisme' AND e.source_id IN (SELECT reglement_id FROM sante_reglement_imputations WHERE facture_id=f.id))
      OR (e.source_type='perte_creance' AND e.source_id IN (SELECT id FROM sante_tiers_rejets WHERE facture_id=f.id)));
  INSERT INTO lettrage(entreprise_id, exercice_id, compte, code_lettrage, journal_entry_id, montant, date_lettrage)
  SELECT j.entreprise_id, j.exercice_id, j.compte, _code, j.id, coalesce(nullif(j.debit,0), -j.credit), current_date
  FROM journal j WHERE j.ecriture_id = ANY(_ecrs) AND j.compte = _compte AND j.libelle = f.numero
    AND NOT EXISTS (SELECT 1 FROM lettrage l WHERE l.journal_entry_id = j.id);
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.sante_lettrer_facture(uuid) FROM PUBLIC, anon, authenticated;

-- Après comptabilisation réussie d'un règlement / perte : tentative de lettrage
CREATE OR REPLACE FUNCTION public.trg_sante_evt_lettrage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _f uuid;
BEGIN
  IF NEW.statut = 'comptabilise' AND OLD.statut IS DISTINCT FROM 'comptabilise' THEN
    BEGIN
      IF NEW.source_type = 'reglement_organisme' THEN
        FOR _f IN SELECT facture_id FROM sante_reglement_imputations WHERE reglement_id = NEW.source_id LOOP PERFORM sante_lettrer_facture(_f); END LOOP;
      ELSIF NEW.source_type = 'perte_creance' THEN
        PERFORM sante_lettrer_facture((SELECT facture_id FROM sante_tiers_rejets WHERE id = NEW.source_id));
      ELSIF NEW.source_type = 'facture' THEN
        PERFORM sante_lettrer_facture(NEW.source_id);
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sante_evt_lettrage ON public.sante_compta_evenements;
CREATE TRIGGER sante_evt_lettrage AFTER UPDATE ON public.sante_compta_evenements FOR EACH ROW EXECUTE FUNCTION public.trg_sante_evt_lettrage();
REVOKE EXECUTE ON FUNCTION public.trg_sante_evt_lettrage() FROM PUBLIC, anon, authenticated;

-- ===== Analytique =====
CREATE OR REPLACE FUNCTION public.sante_ca_analytique(_structure_id uuid, _debut date, _fin date, _axe text)
RETURNS TABLE(axe text, montant numeric, nb bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
END $$;

-- ===== TVA déductible (achats) pour l'entreprise liée =====
CREATE OR REPLACE FUNCTION public.sante_coef_tva_deductible(_entreprise_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT CASE s.regime_tva WHEN 'exonere' THEN 0 WHEN 'mixte' THEN least(greatest(s.prorata_tva,0),100)/100 ELSE 1 END
    FROM structures s WHERE s.entreprise_id = _entreprise_id ORDER BY s.created_at LIMIT 1), 1)
$$;

CREATE OR REPLACE FUNCTION public.sante_config_fiscal(_structure_id uuid, _regime text, _prorata numeric, _cr_conditionne boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_structure_admin(_structure_id) THEN RAISE EXCEPTION 'Réservé à l''administrateur'; END IF;
  IF _regime NOT IN ('exonere','assujetti','mixte') OR _prorata < 0 OR _prorata > 100 THEN RAISE EXCEPTION 'Valeurs invalides'; END IF;
  UPDATE structures SET regime_tva=_regime, prorata_tva=coalesce(_prorata,0), cr_conditionne_reglement=coalesce(_cr_conditionne,false) WHERE id=_structure_id;
  INSERT INTO medical_audit_log(structure_id, user_id, action, table_name, record_id, new_data)
  VALUES (_structure_id, auth.uid(), 'config_fiscal', 'structures', _structure_id, jsonb_build_object('regime', _regime, 'prorata', _prorata, 'cr_conditionne', _cr_conditionne));
END $$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['sante_reserver_bloc(uuid,text,integer)','sante_saisir_facture_secours(uuid,bigint,uuid,jsonb,uuid)','sante_cr_remettable(uuid)',
    'sante_creances_organismes(uuid)','sante_relancer(uuid,text)','sante_provisionner_creance(uuid,text,numeric,text)','sante_ca_analytique(uuid,date,date,text)',
    'sante_coef_tva_deductible(uuid)','sante_config_fiscal(uuid,text,numeric,boolean)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
  REVOKE ALL ON FUNCTION public.sante_lignes_compta_facture(uuid) FROM PUBLIC, anon, authenticated;
END $$;