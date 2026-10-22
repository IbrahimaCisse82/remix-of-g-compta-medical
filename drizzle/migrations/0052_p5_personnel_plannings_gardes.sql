-- P5 (Étape 3) — Personnel : plannings, gardes et astreintes, lien avec la paie.
--  * sante_plannings : créneaux par personne (salarié de la paie et/ou membre de la structure),
--    sans chevauchement, validés « effectués » par l'administrateur.
--  * Forfaits de garde / astreinte par structure.
--  * Récapitulatif mensuel, et injection dans le bulletin (bulletins_paie.prime_gardes) côté paie.
-- Aucune donnée patient. Migration additive et rejouable.

CREATE TABLE IF NOT EXISTS public.sante_personnel_parametres (
  structure_id uuid PRIMARY KEY REFERENCES public.structures(id) ON DELETE CASCADE,
  forfait_garde numeric NOT NULL DEFAULT 0 CHECK (forfait_garde >= 0),
  forfait_astreinte numeric NOT NULL DEFAULT 0 CHECK (forfait_astreinte >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sante_personnel_parametres TO authenticated;
GRANT ALL ON public.sante_personnel_parametres TO service_role;
ALTER TABLE public.sante_personnel_parametres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "perso param lecture" ON public.sante_personnel_parametres;
CREATE POLICY "perso param lecture" ON public.sante_personnel_parametres FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','comptable']));
DROP POLICY IF EXISTS "perso param ecriture" ON public.sante_personnel_parametres;
CREATE POLICY "perso param ecriture" ON public.sante_personnel_parametres FOR ALL TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure']))
  WITH CHECK (public.has_any_medical_role(structure_id, ARRAY['admin_structure']));
DROP POLICY IF EXISTS "perso param mfa" ON public.sante_personnel_parametres;
CREATE POLICY "perso param mfa" ON public.sante_personnel_parametres AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.mfa_conforme()) WITH CHECK (public.mfa_conforme());

CREATE TABLE IF NOT EXISTS public.sante_plannings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  membership_id uuid REFERENCES public.structure_memberships(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('poste','garde','astreinte','conge','absence','formation')),
  debut timestamptz NOT NULL,
  fin timestamptz NOT NULL,
  statut text NOT NULL DEFAULT 'prevu' CHECK (statut IN ('prevu','effectue','annule')),
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  valide_par uuid, valide_le timestamptz,
  CONSTRAINT sante_plannings_personne_chk CHECK (employee_id IS NOT NULL OR membership_id IS NOT NULL),
  CONSTRAINT sante_plannings_duree_chk CHECK (fin > debut AND fin - debut <= interval '31 days')
);
CREATE INDEX IF NOT EXISTS sante_plannings_structure_idx ON public.sante_plannings(structure_id, debut);
CREATE INDEX IF NOT EXISTS sante_plannings_employee_idx ON public.sante_plannings(employee_id, debut);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sante_plannings TO authenticated;
GRANT ALL ON public.sante_plannings TO service_role;
ALTER TABLE public.sante_plannings ENABLE ROW LEVEL SECURITY;
-- Toute l'équipe voit le planning (aucune donnée patient) ; seul l'administrateur le modifie.
DROP POLICY IF EXISTS "plannings lecture" ON public.sante_plannings;
CREATE POLICY "plannings lecture" ON public.sante_plannings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.structure_memberships m WHERE m.structure_id = sante_plannings.structure_id AND m.user_id = auth.uid() AND m.statut = 'actif'));
DROP POLICY IF EXISTS "plannings ecriture" ON public.sante_plannings;
CREATE POLICY "plannings ecriture" ON public.sante_plannings FOR ALL TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure']))
  WITH CHECK (public.has_any_medical_role(structure_id, ARRAY['admin_structure']));
DROP POLICY IF EXISTS "plannings mfa" ON public.sante_plannings;
CREATE POLICY "plannings mfa" ON public.sante_plannings AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.mfa_conforme()) WITH CHECK (public.mfa_conforme());
DROP TRIGGER IF EXISTS trg_audit_sante_plannings ON public.sante_plannings;
CREATE TRIGGER trg_audit_sante_plannings AFTER INSERT OR UPDATE OR DELETE ON public.sante_plannings
  FOR EACH ROW EXECUTE FUNCTION public.audit_sante_row();

-- Cohérence : la personne appartient à la structure, pas de chevauchement, un créneau effectué est figé.
CREATE OR REPLACE FUNCTION public.trg_sante_planning_controle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.statut = 'effectue' AND coalesce(current_setting('sante.planning_admin', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Créneau déjà validé comme effectué : il ne peut plus être modifié';
  END IF;
  IF NEW.fin <= NEW.debut THEN RAISE EXCEPTION 'La fin du créneau doit être postérieure à son début'; END IF;
  IF NEW.fin - NEW.debut > interval '31 days' THEN RAISE EXCEPTION 'Un créneau ne peut pas dépasser 31 jours'; END IF;
  IF NEW.employee_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.employees e JOIN public.structures s ON s.entreprise_id = e.entreprise_id
       WHERE e.id = NEW.employee_id AND s.id = NEW.structure_id) THEN
    RAISE EXCEPTION 'Ce salarié n''appartient pas au dossier comptable de la structure';
  END IF;
  IF NEW.membership_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.structure_memberships m WHERE m.id = NEW.membership_id AND m.structure_id = NEW.structure_id) THEN
    RAISE EXCEPTION 'Ce membre n''appartient pas à la structure';
  END IF;
  IF NEW.site_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sites x WHERE x.id = NEW.site_id AND x.structure_id = NEW.structure_id) THEN
    RAISE EXCEPTION 'Site inconnu pour cette structure';
  END IF;
  IF NEW.statut <> 'annule' AND EXISTS (
       SELECT 1 FROM public.sante_plannings p
       WHERE p.id <> NEW.id AND p.statut <> 'annule'
         AND ((NEW.employee_id IS NOT NULL AND p.employee_id = NEW.employee_id)
              OR (NEW.membership_id IS NOT NULL AND p.membership_id = NEW.membership_id))
         AND tstzrange(p.debut, p.fin, '[)') && tstzrange(NEW.debut, NEW.fin, '[)')) THEN
    RAISE EXCEPTION 'Chevauchement : cette personne a déjà un créneau sur cette période';
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS sante_planning_controle ON public.sante_plannings;
CREATE TRIGGER sante_planning_controle BEFORE INSERT OR UPDATE ON public.sante_plannings
  FOR EACH ROW EXECUTE FUNCTION public.trg_sante_planning_controle();

-- Personnes planifiables : salariés de la paie du dossier comptable + membres actifs.
CREATE OR REPLACE FUNCTION public.sante_personnel_liste(_structure_id uuid)
RETURNS TABLE(employee_id uuid, membership_id uuid, nom text, fonction text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.structure_memberships m WHERE m.structure_id = _structure_id AND m.user_id = auth.uid() AND m.statut = 'actif') THEN
    RAISE EXCEPTION 'Accès refusé : réservé aux membres de la structure.';
  END IF;
  IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise : validez la vérification en deux étapes.'; END IF;
  RETURN QUERY
    SELECT e.id, NULL::uuid, trim(e.prenom || ' ' || e.nom), coalesce(e.fonction, 'Salarié')
    FROM public.employees e JOIN public.structures s ON s.entreprise_id = e.entreprise_id
    WHERE s.id = _structure_id AND e.actif AND (e.date_sortie IS NULL OR e.date_sortie >= current_date)
    UNION ALL
    SELECT NULL::uuid, m.id, coalesce(nullif(trim(pr.full_name), ''), pr.email, u.email::text, 'Membre'),
           coalesce((SELECT string_agg(r.role::text, ', ' ORDER BY r.role) FROM public.medical_user_roles r WHERE r.membership_id = m.id), 'Membre')
    FROM public.structure_memberships m LEFT JOIN public.profiles pr ON pr.id = m.user_id LEFT JOIN auth.users u ON u.id = m.user_id
    WHERE m.structure_id = _structure_id AND m.statut = 'actif'
    ORDER BY 3;
END $function$;
REVOKE ALL ON FUNCTION public.sante_personnel_liste(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_personnel_liste(uuid) TO authenticated, service_role;

-- Validation « effectué » (administrateur) : seul un créneau effectué compte pour la paie.
CREATE OR REPLACE FUNCTION public.sante_valider_creneaux(_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _n integer;
BEGIN
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN RETURN 0; END IF;
  IF EXISTS (SELECT 1 FROM public.sante_plannings p WHERE p.id = ANY(_ids) AND NOT public.has_any_medical_role(p.structure_id, ARRAY['admin_structure'])) THEN
    RAISE EXCEPTION 'Accès refusé : la validation des plannings est réservée à l''administrateur de la structure.';
  END IF;
  IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise : validez la vérification en deux étapes.'; END IF;
  IF EXISTS (SELECT 1 FROM public.sante_plannings WHERE id = ANY(_ids) AND fin > now()) THEN
    RAISE EXCEPTION 'Un créneau ne peut être validé qu''une fois terminé';
  END IF;
  UPDATE public.sante_plannings SET statut = 'effectue', valide_par = auth.uid(), valide_le = now()
   WHERE id = ANY(_ids) AND statut = 'prevu';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $function$;
REVOKE ALL ON FUNCTION public.sante_valider_creneaux(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_valider_creneaux(uuid[]) TO authenticated, service_role;

-- Récapitulatif mensuel par personne (heures par type, gardes/astreintes effectuées et montant).
CREATE OR REPLACE FUNCTION public.sante_recap_personnel(_structure_id uuid, _annee int, _mois int)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _debut timestamptz; _fin timestamptz; fg numeric; fa numeric;
BEGIN
  IF NOT public.has_any_medical_role(_structure_id, ARRAY['admin_structure','comptable']) THEN
    RAISE EXCEPTION 'Accès refusé : récapitulatif réservé à l''administrateur et au comptable.';
  END IF;
  IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise : validez la vérification en deux étapes.'; END IF;
  IF _mois NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Mois invalide'; END IF;
  _debut := make_timestamptz(_annee, _mois, 1, 0, 0, 0, 'Africa/Dakar');
  _fin := _debut + interval '1 month';
  SELECT coalesce(forfait_garde, 0), coalesce(forfait_astreinte, 0) INTO fg, fa FROM public.sante_personnel_parametres WHERE structure_id = _structure_id;
  fg := coalesce(fg, 0); fa := coalesce(fa, 0);
  RETURN jsonb_build_object('forfait_garde', fg, 'forfait_astreinte', fa, 'personnes', coalesce((
    SELECT jsonb_agg(x ORDER BY x->>'nom') FROM (
      SELECT jsonb_build_object(
        'employee_id', p.employee_id, 'membership_id', p.membership_id,
        'nom', coalesce((SELECT trim(e.prenom || ' ' || e.nom) FROM public.employees e WHERE e.id = p.employee_id),
                        (SELECT coalesce(nullif(trim(pr.full_name), ''), pr.email, u.email::text) FROM public.structure_memberships m LEFT JOIN public.profiles pr ON pr.id = m.user_id LEFT JOIN auth.users u ON u.id = m.user_id WHERE m.id = p.membership_id), '—'),
        'heures_poste', round(sum(extract(epoch FROM p.fin - p.debut) / 3600) FILTER (WHERE p.type = 'poste' AND p.statut = 'effectue'), 1),
        'gardes', count(*) FILTER (WHERE p.type = 'garde' AND p.statut = 'effectue'),
        'astreintes', count(*) FILTER (WHERE p.type = 'astreinte' AND p.statut = 'effectue'),
        'jours_conge', count(DISTINCT (p.debut AT TIME ZONE 'Africa/Dakar')::date) FILTER (WHERE p.type = 'conge' AND p.statut <> 'annule'),
        'a_valider', count(*) FILTER (WHERE p.statut = 'prevu' AND p.fin <= now() AND p.type IN ('poste','garde','astreinte')),
        'prime_gardes', count(*) FILTER (WHERE p.type = 'garde' AND p.statut = 'effectue') * fg
                      + count(*) FILTER (WHERE p.type = 'astreinte' AND p.statut = 'effectue') * fa) AS x
      FROM public.sante_plannings p
      WHERE p.structure_id = _structure_id AND p.debut >= _debut AND p.debut < _fin
      GROUP BY p.employee_id, p.membership_id) t), '[]'::jsonb));
END $function$;
REVOKE ALL ON FUNCTION public.sante_recap_personnel(uuid, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_recap_personnel(uuid, int, int) TO authenticated, service_role;

-- Lien paie : primes de garde/astreinte effectuées par salarié, toutes structures du dossier comptable.
ALTER TABLE public.bulletins_paie ADD COLUMN IF NOT EXISTS prime_gardes numeric NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.sante_primes_gardes_paie(_entreprise_id uuid, _annee int, _mois int)
RETURNS TABLE(employee_id uuid, gardes bigint, astreintes bigint, montant numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _debut timestamptz; _fin timestamptz;
BEGIN
  IF NOT public.can_write_entreprise(_entreprise_id) THEN RAISE EXCEPTION 'Accès refusé : réservé aux gestionnaires de la paie.'; END IF;
  IF _mois NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Mois invalide'; END IF;
  _debut := make_timestamptz(_annee, _mois, 1, 0, 0, 0, 'Africa/Dakar');
  _fin := _debut + interval '1 month';
  RETURN QUERY
    SELECT p.employee_id,
           count(*) FILTER (WHERE p.type = 'garde'),
           count(*) FILTER (WHERE p.type = 'astreinte'),
           sum(CASE p.type WHEN 'garde' THEN coalesce(pp.forfait_garde, 0) ELSE coalesce(pp.forfait_astreinte, 0) END)
    FROM public.sante_plannings p
    JOIN public.structures s ON s.id = p.structure_id AND s.entreprise_id = _entreprise_id
    LEFT JOIN public.sante_personnel_parametres pp ON pp.structure_id = p.structure_id
    WHERE p.employee_id IS NOT NULL AND p.statut = 'effectue' AND p.type IN ('garde','astreinte')
      AND p.debut >= _debut AND p.debut < _fin
    GROUP BY p.employee_id;
END $function$;
REVOKE ALL ON FUNCTION public.sante_primes_gardes_paie(uuid, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_primes_gardes_paie(uuid, int, int) TO authenticated, service_role;
