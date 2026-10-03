-- Version du compte rendu + rectificatifs
ALTER TABLE public.sante_demandes_labo ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;

CREATE TABLE public.sante_rectificatifs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  demande_id uuid NOT NULL REFERENCES public.sante_demandes_labo(id),
  parametre_id uuid NOT NULL REFERENCES public.sante_analyse_parametres(id),
  version int NOT NULL,
  ancienne_valeur_num numeric, ancienne_valeur_texte text, ancien_drapeau text,
  nouvelle_valeur_num numeric, nouvelle_valeur_texte text,
  motif text NOT NULL, par uuid NOT NULL, le timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sante_rectificatifs TO authenticated;
GRANT ALL ON public.sante_rectificatifs TO service_role;
ALTER TABLE public.sante_rectificatifs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sante_rectificatifs FORCE ROW LEVEL SECURITY;
CREATE POLICY "Lecture rectificatifs" ON public.sante_rectificatifs FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['biologiste','technicien','medecin']));

CREATE OR REPLACE FUNCTION public.trg_sante_resultat_verrou()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _st text;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Suppression de résultat interdite'; END IF;
  SELECT statut INTO _st FROM public.sante_demandes_labo WHERE id = NEW.demande_id;
  IF coalesce(current_setting('sante.rectificatif', true),'') = 'on' AND _st = 'validee' THEN RETURN NEW; END IF;
  IF _st <> 'en_analyse' THEN RAISE EXCEPTION 'Résultats verrouillés (statut %)', _st; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.trg_sante_demande_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.statut = NEW.statut THEN
    IF OLD.statut = 'validee' AND coalesce(current_setting('sante.rectificatif', true),'') = 'on' THEN RETURN NEW; END IF;
    IF OLD.statut IN ('validee','rejetee') THEN RAISE EXCEPTION 'Demande verrouillée'; END IF;
    RETURN NEW;
  END IF;
  IF NOT (
    (OLD.statut='enregistree' AND NEW.statut IN ('prelevee','rejetee')) OR
    (OLD.statut='prelevee' AND NEW.statut IN ('recue','rejetee')) OR
    (OLD.statut='recue' AND NEW.statut IN ('en_analyse','rejetee')) OR
    (OLD.statut='en_analyse' AND NEW.statut='validee_technique') OR
    (OLD.statut='validee_technique' AND NEW.statut IN ('validee','en_analyse'))
  ) THEN RAISE EXCEPTION 'Transition interdite : % → %', OLD.statut, NEW.statut; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sante_rectifier_resultat(_demande_id uuid, _parametre_id uuid, _valeur_num numeric, _valeur_texte text, _motif text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.sante_demandes_labo%ROWTYPE; r public.sante_resultats%ROWTYPE; p public.sante_patients%ROWTYPE; ref public.sante_valeurs_reference%ROWTYPE; _age int; _f text := 'N'; _v int;
BEGIN
  SELECT * INTO d FROM public.sante_demandes_labo WHERE id = _demande_id;
  IF NOT FOUND OR d.statut <> 'validee' THEN RAISE EXCEPTION 'Seul un compte rendu validé peut être rectifié'; END IF;
  IF NOT public.has_any_medical_role(d.structure_id, ARRAY['biologiste']) THEN RAISE EXCEPTION 'Seul un biologiste peut rectifier'; END IF;
  IF coalesce(length(trim(_motif)),0) < 5 THEN RAISE EXCEPTION 'Motif obligatoire'; END IF;
  SELECT * INTO r FROM public.sante_resultats WHERE demande_id=_demande_id AND parametre_id=_parametre_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Résultat introuvable'; END IF;
  SELECT * INTO p FROM public.sante_patients WHERE id = d.patient_id;
  _age := CASE WHEN p.date_naissance IS NULL THEN 9000 ELSE (current_date - p.date_naissance) END;
  SELECT * INTO ref FROM public.sante_valeurs_reference WHERE parametre_id=_parametre_id AND (sexe IS NULL OR sexe=p.sexe) AND _age BETWEEN age_min_jours AND age_max_jours ORDER BY (sexe IS NULL),(age_max_jours-age_min_jours) LIMIT 1;
  IF _valeur_num IS NOT NULL AND ref.id IS NOT NULL THEN
    _f := CASE WHEN ref.critique_bas IS NOT NULL AND _valeur_num < ref.critique_bas THEN 'LL' WHEN ref.critique_haut IS NOT NULL AND _valeur_num > ref.critique_haut THEN 'HH'
               WHEN ref.bas IS NOT NULL AND _valeur_num < ref.bas THEN 'L' WHEN ref.haut IS NOT NULL AND _valeur_num > ref.haut THEN 'H' ELSE 'N' END;
  END IF;
  _v := d.version + 1;
  PERFORM set_config('sante.rectificatif','on',true);
  INSERT INTO public.sante_rectificatifs(structure_id, demande_id, parametre_id, version, ancienne_valeur_num, ancienne_valeur_texte, ancien_drapeau, nouvelle_valeur_num, nouvelle_valeur_texte, motif, par)
  VALUES (d.structure_id, _demande_id, _parametre_id, _v, r.valeur_num, r.valeur_texte, r.drapeau, _valeur_num, nullif(trim(_valeur_texte),''), trim(_motif), auth.uid());
  UPDATE public.sante_resultats SET valeur_num=_valeur_num, valeur_texte=nullif(trim(_valeur_texte),''), drapeau=_f, saisi_par=auth.uid(), saisi_le=now(),
    critique_acquitte_par = CASE WHEN _f IN ('HH','LL') THEN auth.uid() END, critique_acquitte_le = CASE WHEN _f IN ('HH','LL') THEN now() END WHERE id = r.id;
  UPDATE public.sante_demandes_labo SET version=_v WHERE id=_demande_id;
  PERFORM set_config('sante.rectificatif','',true);
  RETURN _v;
END $$;

-- Contrôle qualité
CREATE TABLE public.sante_controles_qualite (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  parametre_id uuid NOT NULL REFERENCES public.sante_analyse_parametres(id),
  automate text, lot text NOT NULL, niveau text NOT NULL DEFAULT 'normal',
  cible numeric NOT NULL, ecart_type numeric NOT NULL CHECK (ecart_type > 0),
  actif boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sante_controles_qualite TO authenticated;
GRANT ALL ON public.sante_controles_qualite TO service_role;
ALTER TABLE public.sante_controles_qualite ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture cq" ON public.sante_controles_qualite FOR SELECT TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste','technicien']));
CREATE POLICY "Ajout cq" ON public.sante_controles_qualite FOR INSERT TO authenticated WITH CHECK (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste']));
CREATE POLICY "Maj cq" ON public.sante_controles_qualite FOR UPDATE TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste']));

CREATE TABLE public.sante_cq_mesures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  controle_id uuid NOT NULL REFERENCES public.sante_controles_qualite(id),
  valeur numeric NOT NULL, z numeric NOT NULL,
  statut text NOT NULL CHECK (statut IN ('accepte','alerte','rejete')), regles text[] NOT NULL DEFAULT '{}',
  saisi_par uuid NOT NULL, saisi_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sante_cq_mesures ON public.sante_cq_mesures (controle_id, saisi_le DESC);
GRANT SELECT ON public.sante_cq_mesures TO authenticated;
GRANT ALL ON public.sante_cq_mesures TO service_role;
ALTER TABLE public.sante_cq_mesures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture cq mesures" ON public.sante_cq_mesures FOR SELECT TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste','technicien']));

CREATE OR REPLACE FUNCTION public.sante_saisir_cq(_controle_id uuid, _valeur numeric)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.sante_controles_qualite%ROWTYPE; _z numeric; _prev numeric; _regles text[] := '{}'; _st text := 'accepte';
BEGIN
  SELECT * INTO c FROM public.sante_controles_qualite WHERE id=_controle_id AND actif;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrôle introuvable'; END IF;
  IF NOT public.has_any_medical_role(c.structure_id, ARRAY['technicien','biologiste']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  _z := (_valeur - c.cible) / c.ecart_type;
  SELECT z INTO _prev FROM public.sante_cq_mesures WHERE controle_id=_controle_id ORDER BY saisi_le DESC LIMIT 1;
  IF abs(_z) > 3 THEN _regles := _regles || '1-3s'; END IF;
  IF _prev IS NOT NULL AND ((_z > 2 AND _prev > 2) OR (_z < -2 AND _prev < -2)) THEN _regles := _regles || '2-2s'; END IF;
  IF _prev IS NOT NULL AND abs(_z - _prev) > 4 AND sign(_z) <> sign(_prev) THEN _regles := _regles || 'R-4s'; END IF;
  IF array_length(_regles,1) > 0 THEN _st := 'rejete';
  ELSIF abs(_z) > 2 THEN _st := 'alerte'; _regles := ARRAY['1-2s']; END IF;
  INSERT INTO public.sante_cq_mesures(structure_id, controle_id, valeur, z, statut, regles, saisi_par)
  VALUES (c.structure_id, _controle_id, _valeur, round(_z,3), _st, _regles, auth.uid());
  RETURN _st;
END $$;

-- Blocage de la validation technique si un CQ du jour est rejeté
CREATE OR REPLACE FUNCTION public.sante_cq_bloquant(_demande_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sante_demande_analyses da
    JOIN public.sante_analyse_parametres ap ON ap.analyse_id = da.analyse_id
    JOIN public.sante_controles_qualite c ON c.parametre_id = ap.id AND c.actif
    JOIN LATERAL (SELECT statut FROM public.sante_cq_mesures m WHERE m.controle_id = c.id AND m.saisi_le::date = current_date ORDER BY saisi_le DESC LIMIT 1) last ON true
    WHERE da.demande_id = _demande_id AND last.statut = 'rejete')
$$;

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
    UPDATE public.sante_demandes_labo SET statut='validee', validee_le=now(), validee_par=auth.uid() WHERE id=_demande_id;
  ELSE RAISE EXCEPTION 'Niveau inconnu'; END IF;
END $$;

-- Réactifs et lots
CREATE TABLE public.sante_reactifs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  nom text NOT NULL, unite text NOT NULL DEFAULT 'test', seuil_alerte numeric NOT NULL DEFAULT 0,
  actif boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sante_reactifs TO authenticated;
GRANT ALL ON public.sante_reactifs TO service_role;
ALTER TABLE public.sante_reactifs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture reactifs" ON public.sante_reactifs FOR SELECT TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste','technicien']));
CREATE POLICY "Ajout reactifs" ON public.sante_reactifs FOR INSERT TO authenticated WITH CHECK (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste']));
CREATE POLICY "Maj reactifs" ON public.sante_reactifs FOR UPDATE TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste']));

CREATE TABLE public.sante_lots_reactifs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  reactif_id uuid NOT NULL REFERENCES public.sante_reactifs(id),
  numero_lot text NOT NULL, peremption date NOT NULL,
  quantite_recue numeric NOT NULL CHECK (quantite_recue > 0),
  quantite_restante numeric NOT NULL CHECK (quantite_restante >= 0),
  recu_le timestamptz NOT NULL DEFAULT now(), recu_par uuid DEFAULT auth.uid()
);
GRANT SELECT ON public.sante_lots_reactifs TO authenticated;
GRANT ALL ON public.sante_lots_reactifs TO service_role;
ALTER TABLE public.sante_lots_reactifs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture lots" ON public.sante_lots_reactifs FOR SELECT TO authenticated USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','biologiste','technicien']));

CREATE OR REPLACE FUNCTION public.sante_mouvement_reactif(_reactif_id uuid, _type text, _quantite numeric, _numero_lot text DEFAULT NULL, _peremption date DEFAULT NULL, _lot_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.sante_reactifs%ROWTYPE; l public.sante_lots_reactifs%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.sante_reactifs WHERE id=_reactif_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Réactif introuvable'; END IF;
  IF NOT public.has_any_medical_role(r.structure_id, ARRAY['biologiste','technicien']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _quantite IS NULL OR _quantite <= 0 THEN RAISE EXCEPTION 'Quantité invalide'; END IF;
  IF _type = 'reception' THEN
    IF coalesce(trim(_numero_lot),'')='' OR _peremption IS NULL THEN RAISE EXCEPTION 'N° de lot et péremption obligatoires'; END IF;
    INSERT INTO public.sante_lots_reactifs(structure_id, reactif_id, numero_lot, peremption, quantite_recue, quantite_restante) VALUES (r.structure_id, r.id, trim(_numero_lot), _peremption, _quantite, _quantite);
  ELSIF _type = 'consommation' THEN
    SELECT * INTO l FROM public.sante_lots_reactifs WHERE id=_lot_id AND reactif_id=r.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lot introuvable'; END IF;
    IF l.peremption < current_date THEN RAISE EXCEPTION 'Lot périmé : utilisation interdite'; END IF;
    IF l.quantite_restante < _quantite THEN RAISE EXCEPTION 'Stock insuffisant'; END IF;
    UPDATE public.sante_lots_reactifs SET quantite_restante = quantite_restante - _quantite WHERE id=l.id;
  ELSE RAISE EXCEPTION 'Type inconnu'; END IF;
END $$;

CREATE TRIGGER audit_sante_rectificatifs AFTER INSERT ON public.sante_rectificatifs FOR EACH ROW EXECUTE FUNCTION public.audit_sante_row();
CREATE TRIGGER audit_sante_cq AFTER INSERT ON public.sante_cq_mesures FOR EACH ROW EXECUTE FUNCTION public.audit_sante_row();
CREATE TRIGGER audit_sante_lots AFTER INSERT OR UPDATE ON public.sante_lots_reactifs FOR EACH ROW EXECUTE FUNCTION public.audit_sante_row();

REVOKE EXECUTE ON FUNCTION public.sante_rectifier_resultat(uuid,uuid,numeric,text,text), public.sante_saisir_cq(uuid,numeric), public.sante_cq_bloquant(uuid), public.sante_mouvement_reactif(uuid,text,numeric,text,date,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sante_rectifier_resultat(uuid,uuid,numeric,text,text), public.sante_saisir_cq(uuid,numeric), public.sante_cq_bloquant(uuid), public.sante_mouvement_reactif(uuid,text,numeric,text,date,uuid) TO authenticated;