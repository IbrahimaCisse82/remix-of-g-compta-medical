-- Retour arrière de 0100 : référentiel de nouveau non visé (clôture verrouillée).
UPDATE public.syscohada_references SET valide_officiellement = false WHERE version = 'SYSCOHADA_REVISE_2019_V1';
ALTER TABLE public.syscohada_references DROP COLUMN IF EXISTS visa_le, DROP COLUMN IF EXISTS visa_declare_par, DROP COLUMN IF EXISTS visa_expert;
