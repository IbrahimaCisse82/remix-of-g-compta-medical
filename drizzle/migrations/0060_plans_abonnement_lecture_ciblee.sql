ALTER POLICY plans_public_read ON public.plans_abonnement TO anon, authenticated USING (actif IS TRUE);
CREATE POLICY plans_souscrits_read ON public.plans_abonnement FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.abonnements AS abonnement
    WHERE abonnement.plan_id = plans_abonnement.id
      AND abonnement.entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid()))
  )
);
COMMENT ON POLICY plans_public_read ON public.plans_abonnement IS 'Public pricing exposes only active commercial offers; withdrawn offers are not publicly readable.';
COMMENT ON POLICY plans_souscrits_read ON public.plans_abonnement IS 'Preserves historical subscription details only for authorized entreprise members; abonnements RLS also applies.';