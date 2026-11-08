-- Retour de 0113 (déconseillé : rouvre l'écriture des abonnements aux clients).
GRANT INSERT, UPDATE, DELETE ON public.abonnements TO authenticated;
CREATE POLICY abonnements_ins ON public.abonnements FOR INSERT TO authenticated WITH CHECK (public.can_write_entreprise(entreprise_id));
CREATE POLICY abonnements_upd ON public.abonnements FOR UPDATE TO authenticated USING (public.can_write_entreprise(entreprise_id)) WITH CHECK (public.can_write_entreprise(entreprise_id));
CREATE POLICY abonnements_del ON public.abonnements FOR DELETE TO authenticated USING (public.can_admin_entreprise(entreprise_id));
