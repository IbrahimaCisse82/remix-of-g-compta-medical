ALTER TABLE public.structures ADD COLUMN IF NOT EXISTS sms_expediteur text;
ALTER TABLE public.structures ADD COLUMN IF NOT EXISTS rappels_sms_actifs boolean NOT NULL DEFAULT false;

CREATE TABLE public.sante_rappels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id),
  rdv_id uuid NOT NULL REFERENCES public.sante_rendez_vous(id),
  canal text NOT NULL DEFAULT 'sms',
  statut text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','envoye','echec','sans_fournisseur')),
  erreur text, fournisseur_id text,
  created_at timestamptz NOT NULL DEFAULT now(), envoye_le timestamptz,
  UNIQUE (rdv_id, canal)
);
GRANT SELECT ON public.sante_rappels TO authenticated;
GRANT ALL ON public.sante_rappels TO service_role;
ALTER TABLE public.sante_rappels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture rappels" ON public.sante_rappels FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure','secretaire','medecin']));

CREATE OR REPLACE FUNCTION public.sante_config_rappels(_structure_id uuid, _actifs boolean, _expediteur text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_structure_admin(_structure_id) THEN RAISE EXCEPTION 'Réservé à l''administrateur'; END IF;
  IF _expediteur IS NOT NULL AND trim(_expediteur) <> '' AND trim(_expediteur) !~ '^\+[1-9][0-9]{7,14}$' THEN RAISE EXCEPTION 'Numéro expéditeur au format international (+221…)'; END IF;
  UPDATE public.structures SET rappels_sms_actifs = coalesce(_actifs,false), sms_expediteur = nullif(trim(_expediteur),'') WHERE id = _structure_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.sante_config_rappels(uuid,boolean,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sante_config_rappels(uuid,boolean,text) TO authenticated;