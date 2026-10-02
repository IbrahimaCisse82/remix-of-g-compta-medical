-- Correctifs FEC : numéro d'écriture persistant + colonnes auxiliaires sur le journal
ALTER TABLE public.journal ADD COLUMN IF NOT EXISTS ecriture_numero text;
ALTER TABLE public.journal ADD COLUMN IF NOT EXISTS compte_auxiliaire text;
ALTER TABLE public.journal ADD COLUMN IF NOT EXISTS auxiliaire_libelle text;

GRANT SELECT, INSERT, UPDATE ON public.journal TO authenticated;
GRANT ALL ON public.journal TO service_role;

-- Rétro-remplissage du numéro persistant pour les lignes déjà rattachées à une écriture
UPDATE public.journal j
SET ecriture_numero = e.numero
FROM public.ecritures e
WHERE j.ecriture_id = e.id AND j.ecriture_numero IS NULL;

CREATE INDEX IF NOT EXISTS idx_journal_ecriture_id ON public.journal(ecriture_id) WHERE ecriture_id IS NOT NULL;