-- Paie : bulletins comptabilisés et historique des salariés protégés (02/11/2026).
-- Constats (recette Paie) : régénérer les bulletins d'un mois déjà comptabilisé écrasait leurs montants alors que
-- l'écriture PA restait au journal ; supprimer un salarié effaçait en cascade tous ses bulletins.
-- Corrections (requêtes directes de l'application uniquement, rôle authenticated) :
--  - un bulletin comptabilisé n'est ni modifiable ni supprimable tant que l'écriture PAIE-<période> est en vigueur
--    (non contre-passée) ; après contre-passation, la période peut être recalculée ;
--  - un salarié ayant des bulletins n'est pas supprimable (le désactiver / renseigner sa date de sortie).
CREATE OR REPLACE FUNCTION public.paie_ecriture_en_vigueur(_entreprise_id uuid, _periode text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.ecritures e WHERE e.entreprise_id = _entreprise_id AND e.journal_code = 'PA'
    AND e.piece = 'PAIE-' || _periode AND e.contrepasse_par IS NULL AND e.statut <> 'annulee'
    AND coalesce(e.origine, '') <> 'contrepassation');
$function$;
REVOKE ALL ON FUNCTION public.paie_ecriture_en_vigueur(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.paie_ecriture_en_vigueur(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.bulletins_paie_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN COALESCE(NEW, OLD); END IF;
  IF OLD.comptabilise AND public.paie_ecriture_en_vigueur(OLD.entreprise_id, OLD.periode) THEN
    IF TG_OP = 'DELETE' OR (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
      RAISE EXCEPTION 'Paie % comptabilisée : contre-passez l''écriture PAIE-% avant de modifier les bulletins', OLD.periode, OLD.periode;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;

DROP TRIGGER IF EXISTS trg_bulletins_paie_guard ON public.bulletins_paie;
CREATE TRIGGER trg_bulletins_paie_guard BEFORE UPDATE OR DELETE ON public.bulletins_paie
  FOR EACH ROW EXECUTE FUNCTION public.bulletins_paie_guard();

CREATE OR REPLACE FUNCTION public.employees_suppression_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND EXISTS (SELECT 1 FROM public.bulletins_paie WHERE employee_id = OLD.id)
     AND EXISTS (SELECT 1 FROM public.entreprises WHERE id = OLD.entreprise_id) THEN
    RAISE EXCEPTION 'Salarié avec bulletins de paie : renseignez sa date de sortie et désactivez-le, il ne peut pas être supprimé';
  END IF;
  RETURN OLD;
END $function$;

DROP TRIGGER IF EXISTS trg_employees_suppression ON public.employees;
CREATE TRIGGER trg_employees_suppression BEFORE DELETE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.employees_suppression_guard();
