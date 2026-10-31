CREATE OR REPLACE FUNCTION public.sante_analyse_activation_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.actif AND (TG_OP = 'INSERT' OR NOT OLD.actif) AND TG_OP = 'UPDATE'
     AND NOT EXISTS (SELECT 1 FROM sante_analyse_parametres p WHERE p.analyse_id = NEW.id) THEN
    RAISE EXCEPTION 'Ajoutez au moins un paramètre mesuré avant d''activer l''analyse « % »', NEW.libelle USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sante_analyse_activation ON public.sante_analyses;
CREATE TRIGGER trg_sante_analyse_activation BEFORE UPDATE OF actif ON public.sante_analyses
FOR EACH ROW EXECUTE FUNCTION public.sante_analyse_activation_guard();

CREATE OR REPLACE FUNCTION public.sante_valeur_reference_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.bas IS NOT NULL AND NEW.haut IS NOT NULL AND NEW.bas > NEW.haut THEN RAISE EXCEPTION 'La borne basse dépasse la borne haute'; END IF;
  IF NEW.critique_bas IS NOT NULL AND NEW.critique_haut IS NOT NULL AND NEW.critique_bas > NEW.critique_haut THEN RAISE EXCEPTION 'Seuils critiques incohérents'; END IF;
  IF NEW.age_min_jours < 0 OR NEW.age_max_jours < NEW.age_min_jours THEN RAISE EXCEPTION 'Tranche d''âge invalide'; END IF;
  IF NEW.sexe IS NOT NULL AND NEW.sexe NOT IN ('M','F') THEN RAISE EXCEPTION 'Sexe invalide'; END IF;
  IF NOT EXISTS (SELECT 1 FROM sante_analyse_parametres p WHERE p.id = NEW.parametre_id AND p.structure_id = NEW.structure_id) THEN
    RAISE EXCEPTION 'Paramètre introuvable dans cette structure';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sante_valeur_reference_guard ON public.sante_valeurs_reference;
CREATE TRIGGER trg_sante_valeur_reference_guard BEFORE INSERT OR UPDATE ON public.sante_valeurs_reference
FOR EACH ROW EXECUTE FUNCTION public.sante_valeur_reference_guard();

CREATE OR REPLACE FUNCTION public.sante_parametre_analyse_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sante_analyses a WHERE a.id = NEW.analyse_id AND a.structure_id = NEW.structure_id) THEN
    RAISE EXCEPTION 'Analyse introuvable dans cette structure';
  END IF;
  IF NEW.type NOT IN ('numerique','qualitatif','texte') THEN RAISE EXCEPTION 'Type de résultat invalide'; END IF;
  IF NEW.decimales < 0 OR NEW.decimales > 6 THEN RAISE EXCEPTION 'Nombre de décimales invalide'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sante_parametre_analyse_guard ON public.sante_analyse_parametres;
CREATE TRIGGER trg_sante_parametre_analyse_guard BEFORE INSERT OR UPDATE ON public.sante_analyse_parametres
FOR EACH ROW EXECUTE FUNCTION public.sante_parametre_analyse_guard();