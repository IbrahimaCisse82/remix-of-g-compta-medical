CREATE OR REPLACE FUNCTION public.trg_sante_exercice_initial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _an int := extract(year FROM current_date)::int;
BEGIN
  IF NEW.secteur_activite LIKE 'sante_%' AND NOT EXISTS (SELECT 1 FROM exercices WHERE entreprise_id = NEW.id AND annee = _an) THEN
    INSERT INTO exercices(entreprise_id, annee, date_debut, date_fin) VALUES (NEW.id, _an, make_date(_an,1,1), make_date(_an,12,31));
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.trg_sante_exercice_initial() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS sante_exercice_initial ON public.entreprises;
CREATE TRIGGER sante_exercice_initial AFTER INSERT ON public.entreprises FOR EACH ROW EXECUTE FUNCTION public.trg_sante_exercice_initial();
-- Rattrapage : entreprises santé existantes sans exercice de l'année en cours
INSERT INTO public.exercices(entreprise_id, annee, date_debut, date_fin)
SELECT e.id, extract(year FROM current_date)::int, date_trunc('year', current_date)::date, (date_trunc('year', current_date) + interval '1 year - 1 day')::date
FROM public.entreprises e
WHERE e.secteur_activite LIKE 'sante_%'
  AND NOT EXISTS (SELECT 1 FROM public.exercices x WHERE x.entreprise_id = e.id AND x.annee = extract(year FROM current_date)::int);