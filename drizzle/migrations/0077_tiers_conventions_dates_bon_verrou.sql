CREATE OR REPLACE FUNCTION public.sante_creer_facture_interne(_patient_id uuid, _lignes jsonb, _assurance_id uuid, _remise numeric, _motif_remise text, _consultation_id uuid, _demande_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Un bon valide sur la période encadre la prise en charge, même épuisé ; verrouillé contre les factures simultanées.
    SELECT * INTO _bon FROM sante_bons_pec WHERE structure_id=_s AND patient_id=_patient_id AND organisme=_org
      AND current_date BETWEEN date_debut AND date_fin
      ORDER BY (plafond IS NULL OR consomme < plafond) DESC, date_fin LIMIT 1 FOR UPDATE;
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
        _conv := NULL;
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
    -- franchises et plafonds par catégorie : seules les conventions en vigueur s'appliquent
    FOR _k, _v IN SELECT key, value::numeric FROM jsonb_each_text(_parcat) LOOP
      _conv := NULL;
      SELECT * INTO _conv FROM sante_conventions WHERE structure_id=_s AND organisme=_org AND categorie=_k
        AND (date_debut IS NULL OR date_debut <= current_date) AND (date_fin IS NULL OR date_fin >= current_date);
      IF _conv.id IS NOT NULL THEN
        _v := greatest(0, _v - coalesce(_conv.franchise,0));
        IF _conv.plafond IS NOT NULL THEN _v := least(_v, _conv.plafond); END IF;
      END IF;
      _po := _po + _v;
    END LOOP;
    _coef := CASE WHEN _total > 0 THEN _net / _total ELSE 0 END;
    _po := round(_po * _coef);
    IF _plafond IS NOT NULL AND _po > _plafond THEN _po := _plafond; END IF;
    IF _bon.id IS NOT NULL AND _bon.plafond IS NOT NULL THEN _po := least(_po, greatest(0, _bon.plafond - _bon.consomme)); END IF;
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
END $function$;