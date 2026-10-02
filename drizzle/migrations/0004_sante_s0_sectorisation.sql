ALTER TABLE public.entreprises ADD COLUMN IF NOT EXISTS secteur_activite text NOT NULL DEFAULT 'general';
ALTER TABLE public.structures ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES public.entreprises(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_structures_entreprise ON public.structures(entreprise_id);
ALTER TABLE public.plans_abonnement ADD COLUMN IF NOT EXISTS type_plan text NOT NULL DEFAULT 'base';

CREATE TABLE public.entreprise_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  module text NOT NULL CHECK (module IN ('sante_patients','sante_clinique','sante_laboratoire','sante_tiers_payant','sante_portail_resultats')),
  actif boolean NOT NULL DEFAULT false,
  date_activation timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entreprise_id, module)
);
GRANT SELECT ON public.entreprise_modules TO authenticated;
GRANT ALL ON public.entreprise_modules TO service_role;
ALTER TABLE public.entreprise_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membres lisent les modules" ON public.entreprise_modules FOR SELECT TO authenticated
USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));

CREATE OR REPLACE FUNCTION public.module_actif(_entreprise_id uuid, _module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.entreprise_modules m JOIN public.entreprises e ON e.id = m.entreprise_id
    WHERE m.entreprise_id = _entreprise_id AND m.module = _module AND m.actif AND e.secteur_activite LIKE 'sante_%')
$$;

CREATE OR REPLACE FUNCTION public.structure_module_actif(_structure_id uuid, _module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT CASE WHEN s.entreprise_id IS NULL THEN true ELSE public.module_actif(s.entreprise_id, _module) END
    FROM public.structures s WHERE s.id = _structure_id), false)
$$;

CREATE OR REPLACE FUNCTION public.set_secteur_activite(_entreprise_id uuid, _secteur text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_admin_entreprise(_entreprise_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _secteur NOT IN ('general','sante_clinique','sante_laboratoire','sante_mixte') THEN RAISE EXCEPTION 'Secteur invalide'; END IF;
  UPDATE public.entreprises SET secteur_activite = _secteur WHERE id = _entreprise_id;
  INSERT INTO public.entreprise_modules(entreprise_id, module, actif, date_activation)
  SELECT _entreprise_id, m, false, NULL FROM unnest(CASE _secteur
    WHEN 'sante_clinique' THEN ARRAY['sante_patients','sante_clinique','sante_tiers_payant']
    WHEN 'sante_laboratoire' THEN ARRAY['sante_patients','sante_laboratoire','sante_tiers_payant','sante_portail_resultats']
    WHEN 'sante_mixte' THEN ARRAY['sante_patients','sante_clinique','sante_laboratoire','sante_tiers_payant','sante_portail_resultats']
    ELSE ARRAY[]::text[] END) m
  ON CONFLICT (entreprise_id, module) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.lier_structure_entreprise(_structure_id uuid, _entreprise_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_structure_admin(_structure_id) OR NOT public.can_admin_entreprise(_entreprise_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  UPDATE public.structures SET entreprise_id = _entreprise_id, updated_at = now() WHERE id = _structure_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.module_actif(uuid,text), public.structure_module_actif(uuid,text), public.set_secteur_activite(uuid,text), public.lier_structure_entreprise(uuid,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.module_actif(uuid,text), public.structure_module_actif(uuid,text), public.set_secteur_activite(uuid,text), public.lier_structure_entreprise(uuid,uuid) TO authenticated;