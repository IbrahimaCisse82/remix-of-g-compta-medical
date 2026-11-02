-- Visa du référentiel SYSCOHADA révisé (02/11/2026).
-- Ibrahima Cissé (administrateur, i.cisse@growhubsenegal.com) déclare le référentiel SYSCOHADA_REVISE_2019_V1
-- (plan de comptes et correspondances des états) visé par l'expert-comptable. Le visa est tracé : date, déclarant,
-- expert (nom et n° d'inscription à compléter). Il lève le verrou de clôture (syscohada_cloture_garde).
ALTER TABLE public.syscohada_references
  ADD COLUMN IF NOT EXISTS visa_le timestamptz,
  ADD COLUMN IF NOT EXISTS visa_declare_par uuid,
  ADD COLUMN IF NOT EXISTS visa_expert text;

UPDATE public.syscohada_references
   SET valide_officiellement = true, visa_le = now(), visa_declare_par = 'b987a9db-e88f-4ad6-b6fa-75cf38a4b920'
 WHERE version = 'SYSCOHADA_REVISE_2019_V1' AND NOT valide_officiellement;
