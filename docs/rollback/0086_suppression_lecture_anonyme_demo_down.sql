-- Retour arrière de 0086 : recrée les lectures anonymes « démo » à l'identique (non recommandé).
CREATE POLICY "Anon read demo amortissements" ON public.amortissements AS PERMISSIVE FOR SELECT TO anon USING ((entreprise_id IN (SELECT entreprises.id FROM entreprises WHERE (entreprises.user_id IS NULL))));
CREATE POLICY "Anon read demo balance" ON public.balance AS PERMISSIVE FOR SELECT TO anon USING ((entreprise_id IN (SELECT entreprises.id FROM entreprises WHERE (entreprises.user_id IS NULL))));
CREATE POLICY "Anon read demo clients" ON public.clients AS PERMISSIVE FOR SELECT TO anon USING ((entreprise_id IN (SELECT entreprises.id FROM entreprises WHERE (entreprises.user_id IS NULL))));
CREATE POLICY "Anon read demo entreprises" ON public.entreprises AS PERMISSIVE FOR SELECT TO anon USING ((user_id IS NULL));
CREATE POLICY "Anon read demo exercices" ON public.exercices AS PERMISSIVE FOR SELECT TO anon USING ((entreprise_id IN (SELECT entreprises.id FROM entreprises WHERE (entreprises.user_id IS NULL))));
CREATE POLICY "Anon read demo facture_lignes" ON public.facture_lignes AS PERMISSIVE FOR SELECT TO anon USING ((facture_id IN (SELECT factures.id FROM factures WHERE (factures.entreprise_id IN (SELECT entreprises.id FROM entreprises WHERE (entreprises.user_id IS NULL))))));
CREATE POLICY "Anon read demo factures" ON public.factures AS PERMISSIVE FOR SELECT TO anon USING ((entreprise_id IN (SELECT entreprises.id FROM entreprises WHERE (entreprises.user_id IS NULL))));
CREATE POLICY "Anon read demo immobilisations" ON public.immobilisations AS PERMISSIVE FOR SELECT TO anon USING ((entreprise_id IN (SELECT entreprises.id FROM entreprises WHERE (entreprises.user_id IS NULL))));
CREATE POLICY "Anon read demo journal" ON public.journal AS PERMISSIVE FOR SELECT TO anon USING ((entreprise_id IN (SELECT entreprises.id FROM entreprises WHERE (entreprises.user_id IS NULL))));
CREATE POLICY "Anon read demo notes_annexes_data" ON public.notes_annexes_data AS PERMISSIVE FOR SELECT TO anon USING ((entreprise_id IN (SELECT entreprises.id FROM entreprises WHERE (entreprises.user_id IS NULL))));
CREATE POLICY "Anon read demo plan_comptable" ON public.plan_comptable AS PERMISSIVE FOR SELECT TO anon USING ((entreprise_id IN (SELECT entreprises.id FROM entreprises WHERE (entreprises.user_id IS NULL))));
