
-- Notes annexes editable data
CREATE TABLE public.notes_annexes_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  exercice_id UUID NOT NULL REFERENCES public.exercices(id) ON DELETE CASCADE,
  note_key TEXT NOT NULL,
  note_value TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(entreprise_id, exercice_id, note_key)
);

ALTER TABLE public.notes_annexes_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notes_annexes_data" ON public.notes_annexes_data
  FOR ALL TO authenticated
  USING (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())))
  WITH CHECK (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())));

CREATE POLICY "Anon read demo notes_annexes_data" ON public.notes_annexes_data
  FOR SELECT TO anon
  USING (entreprise_id IN (SELECT id FROM entreprises WHERE user_id IS NULL));

-- Audit trail for journal entries
CREATE TABLE public.journal_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  journal_id UUID,
  entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  exercice_id UUID NOT NULL REFERENCES public.exercices(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.journal_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own audit" ON public.journal_audit
  FOR SELECT TO authenticated
  USING (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())));

CREATE POLICY "Users insert own audit" ON public.journal_audit
  FOR INSERT TO authenticated
  WITH CHECK (entreprise_id IN (SELECT get_user_entreprise_ids(auth.uid())));

-- Trigger to auto-log journal changes
CREATE OR REPLACE FUNCTION public.log_journal_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.journal_audit (journal_id, entreprise_id, exercice_id, action, new_data, user_id)
    VALUES (NEW.id, NEW.entreprise_id, NEW.exercice_id, 'INSERT', row_to_json(NEW)::jsonb, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.journal_audit (journal_id, entreprise_id, exercice_id, action, old_data, user_id)
    VALUES (OLD.id, OLD.entreprise_id, OLD.exercice_id, 'DELETE', row_to_json(OLD)::jsonb, auth.uid());
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.journal_audit (journal_id, entreprise_id, exercice_id, action, old_data, new_data, user_id)
    VALUES (NEW.id, NEW.entreprise_id, NEW.exercice_id, 'UPDATE', row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb, auth.uid());
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER journal_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.journal
FOR EACH ROW EXECUTE FUNCTION public.log_journal_audit();
