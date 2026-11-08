CREATE OR REPLACE FUNCTION public.trg_journal_immuable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _workflow_only boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    _workflow_only := (
      NEW.id = OLD.id
      AND NEW.entreprise_id = OLD.entreprise_id
      AND NEW.exercice_id = OLD.exercice_id
      AND NEW.date_ecriture = OLD.date_ecriture
      AND NEW.journal_code = OLD.journal_code
      AND NEW.compte = OLD.compte
      AND NEW.debit = OLD.debit
      AND NEW.credit = OLD.credit
      AND COALESCE(NEW.piece,'') = COALESCE(OLD.piece,'')
      AND COALESCE(NEW.libelle,'') = COALESCE(OLD.libelle,'')
      AND COALESCE(NEW.intitule,'') = COALESCE(OLD.intitule,'')
      AND NEW.ecriture_id IS NOT DISTINCT FROM OLD.ecriture_id
    );

    IF public.exercice_est_cloture(OLD.exercice_id) THEN
      RAISE EXCEPTION 'Exercice cloture : modification interdite';
    END IF;

    IF OLD.ecriture_id IS NOT NULL AND NOT _workflow_only THEN
      RAISE EXCEPTION 'Ligne issue d''une ecriture comptable : utilisez la contre-passation';
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.ecriture_id IS NOT NULL THEN
    RAISE EXCEPTION 'Ligne issue d''une ecriture comptable : utilisez la contre-passation';
  END IF;
  IF public.exercice_est_cloture(OLD.exercice_id) THEN
    RAISE EXCEPTION 'Exercice cloture : modification interdite';
  END IF;
  RETURN OLD;
END;
$$;