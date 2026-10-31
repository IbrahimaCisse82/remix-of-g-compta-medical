-- Une ligne d'écriture n'est lettrée qu'une fois (31/10/2026). Ajout uniquement : aucun doublon existant (290 lignes vérifiées).
CREATE UNIQUE INDEX IF NOT EXISTS lettrage_journal_entry_uniq ON public.lettrage(journal_entry_id);
