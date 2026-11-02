-- Lettrage : contrôle serveur de chaque code (02/11/2026).
-- Constat (recette Lettrage) : les règles (même compte, même tiers, sélection soldée) n'étaient vérifiées que par
-- l'écran ; une requête directe pouvait enregistrer un lettrage déséquilibré ou mêlant deux tiers, et la colonne
-- montant était celle fournie par le client.
-- Correction : contrainte différée (fin de transaction) sur chaque code d'un exercice : lignes de journal du même
-- dossier, même compte et même compte auxiliaire, solde nul d'après les montants réels du journal. Requêtes
-- directes de l'application uniquement (rôle authenticated). Le montant enregistré est celui de la ligne de journal.
CREATE OR REPLACE FUNCTION public.lettrage_montant_journal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE m numeric;
BEGIN
  SELECT j.debit - j.credit INTO m FROM public.journal j WHERE j.id = NEW.journal_entry_id AND j.entreprise_id = NEW.entreprise_id;
  IF FOUND THEN NEW.montant := m; END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trg_lettrage_montant ON public.lettrage;
CREATE TRIGGER trg_lettrage_montant BEFORE INSERT OR UPDATE ON public.lettrage
  FOR EACH ROW EXECUTE FUNCTION public.lettrage_montant_journal();

CREATE OR REPLACE FUNCTION public.lettrage_controle()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE r public.lettrage%ROWTYPE; n int; nj int; groupes int; solde numeric;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NULL; END IF;
  r := COALESCE(NEW, OLD);
  SELECT count(*) INTO n FROM public.lettrage
   WHERE entreprise_id = r.entreprise_id AND exercice_id = r.exercice_id AND code_lettrage = r.code_lettrage;
  IF n = 0 THEN RETURN NULL; END IF;
  SELECT count(j.id), count(DISTINCT j.compte || '|' || coalesce(j.compte_auxiliaire, '')), coalesce(sum(round(j.debit * 100) - round(j.credit * 100)), 0)
    INTO nj, groupes, solde
    FROM public.lettrage l LEFT JOIN public.journal j ON j.id = l.journal_entry_id AND j.entreprise_id = l.entreprise_id
   WHERE l.entreprise_id = r.entreprise_id AND l.exercice_id = r.exercice_id AND l.code_lettrage = r.code_lettrage;
  IF nj <> n THEN RAISE EXCEPTION 'Lettrage % : ligne de journal introuvable dans ce dossier', r.code_lettrage; END IF;
  IF n < 2 THEN RAISE EXCEPTION 'Lettrage % : au moins deux lignes', r.code_lettrage; END IF;
  IF groupes <> 1 THEN RAISE EXCEPTION 'Lettrage % : les lignes doivent porter sur le même compte et le même tiers', r.code_lettrage; END IF;
  IF solde <> 0 THEN RAISE EXCEPTION 'Lettrage % : lignes non soldées (écart % FCFA)', r.code_lettrage, round(solde / 100, 2); END IF;
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS trg_lettrage_controle ON public.lettrage;
CREATE CONSTRAINT TRIGGER trg_lettrage_controle AFTER INSERT OR UPDATE OR DELETE ON public.lettrage
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.lettrage_controle();
