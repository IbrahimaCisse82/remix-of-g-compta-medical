CREATE OR REPLACE FUNCTION public.sante_saisir_cq(_controle_id uuid, _valeur numeric)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.sante_controles_qualite%ROWTYPE; _z numeric; _prev numeric; _regles text[] := '{}'::text[]; _st text := 'accepte';
BEGIN
  SELECT * INTO c FROM public.sante_controles_qualite WHERE id=_controle_id AND actif;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrôle introuvable'; END IF;
  IF NOT public.has_any_medical_role(c.structure_id, ARRAY['technicien','biologiste']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  _z := (_valeur - c.cible) / c.ecart_type;
  SELECT z INTO _prev FROM public.sante_cq_mesures WHERE controle_id=_controle_id ORDER BY saisi_le DESC LIMIT 1;
  IF abs(_z) > 3 THEN _regles := array_append(_regles, '1-3s'); END IF;
  IF _prev IS NOT NULL AND ((_z > 2 AND _prev > 2) OR (_z < -2 AND _prev < -2)) THEN _regles := array_append(_regles, '2-2s'); END IF;
  IF _prev IS NOT NULL AND abs(_z - _prev) > 4 AND sign(_z) <> sign(_prev) THEN _regles := array_append(_regles, 'R-4s'); END IF;
  IF cardinality(_regles) > 0 THEN _st := 'rejete';
  ELSIF abs(_z) > 2 THEN _st := 'alerte'; _regles := ARRAY['1-2s']; END IF;
  INSERT INTO public.sante_cq_mesures(structure_id, controle_id, valeur, z, statut, regles, saisi_par)
  VALUES (c.structure_id, _controle_id, _valeur, round(_z,3), _st, _regles, auth.uid());
  RETURN _st;
END $$;