ALTER TABLE public.journal ADD COLUMN IF NOT EXISTS ecriture_id uuid REFERENCES public.ecritures(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_journal_ecriture ON public.journal(ecriture_id);

DROP MATERIALIZED VIEW IF EXISTS public.mv_balance;
CREATE MATERIALIZED VIEW public.mv_balance AS
SELECT entreprise_id, exercice_id, compte,
       min(intitule) AS intitule,
       ROUND(sum(debit), 2)  AS md,
       ROUND(sum(credit), 2) AS mc,
       GREATEST(ROUND(sum(debit) - sum(credit), 2), 0) AS sfd,
       GREATEST(ROUND(sum(credit) - sum(debit), 2), 0) AS sfc
FROM (
  SELECT entreprise_id, exercice_id, compte, intitule, debit, credit
    FROM public.journal WHERE ecriture_id IS NULL
  UNION ALL
  SELECT el.entreprise_id, el.exercice_id, el.compte, el.intitule, el.debit, el.credit
    FROM public.ecriture_lignes el
    JOIN public.ecritures e ON e.id = el.ecriture_id
   WHERE e.statut = 'validee'
) src
GROUP BY entreprise_id, exercice_id, compte;
CREATE UNIQUE INDEX mv_balance_uk ON public.mv_balance(entreprise_id, exercice_id, compte);
REVOKE ALL ON public.mv_balance FROM anon, authenticated;

-- Les lignes de journal rattachees a une ecriture sont immuables cote base
CREATE OR REPLACE FUNCTION public.trg_journal_immuable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.ecriture_id IS NOT NULL THEN
    RAISE EXCEPTION 'Ligne issue d''une ecriture comptable : utilisez la contre-passation';
  END IF;
  IF public.exercice_est_cloture(OLD.exercice_id) THEN
    RAISE EXCEPTION 'Exercice cloture : modification interdite';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS journal_immuable ON public.journal;
CREATE TRIGGER journal_immuable BEFORE UPDATE OR DELETE ON public.journal
  FOR EACH ROW EXECUTE FUNCTION public.trg_journal_immuable();

-- fn_creer_ecriture alimente aussi le journal (double-tenue, lignes liees)
CREATE OR REPLACE FUNCTION public.fn_creer_ecriture(
  _entreprise_id uuid, _exercice_id uuid, _journal_code text, _date date, _libelle text,
  _lignes jsonb, _piece text DEFAULT NULL, _statut text DEFAULT 'validee', _origine text DEFAULT 'saisie'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_debit numeric(18,2) := 0; v_credit numeric(18,2) := 0;
  v_nb int; v_seq bigint; v_id uuid; v_num text; l jsonb; i int := 0;
BEGIN
  IF NOT public.can_write_entreprise(_entreprise_id) THEN
    RAISE EXCEPTION 'Droits insuffisants : le role lecteur ne peut pas saisir d''ecriture';
  END IF;
  IF public.exercice_est_cloture(_exercice_id) THEN
    RAISE EXCEPTION 'Exercice cloture : saisie impossible';
  END IF;
  IF _statut NOT IN ('brouillon','validee') THEN RAISE EXCEPTION 'Statut invalide'; END IF;
  IF _journal_code IS NULL OR _journal_code !~ '^(AN|AC|VT|BQ|CA|OD|PA)$' THEN
    RAISE EXCEPTION 'Code journal non normalise (AN/AC/VT/BQ/CA/OD/PA)';
  END IF;

  v_nb := jsonb_array_length(COALESCE(_lignes, '[]'::jsonb));
  IF v_nb < 2 THEN RAISE EXCEPTION 'Une ecriture doit comporter au moins deux lignes'; END IF;

  FOR l IN SELECT * FROM jsonb_array_elements(_lignes) LOOP
    v_debit  := v_debit  + ROUND(COALESCE((l->>'debit')::numeric, 0), 2);
    v_credit := v_credit + ROUND(COALESCE((l->>'credit')::numeric, 0), 2);
  END LOOP;
  IF v_debit <> v_credit THEN
    RAISE EXCEPTION 'Ecriture desequilibree : debit % <> credit %', v_debit, v_credit;
  END IF;
  IF v_debit = 0 THEN RAISE EXCEPTION 'Ecriture de montant nul'; END IF;

  INSERT INTO public.ecriture_sequences (entreprise_id, exercice_id, journal_code, dernier_numero)
  VALUES (_entreprise_id, _exercice_id, _journal_code, 1)
  ON CONFLICT (entreprise_id, exercice_id, journal_code)
  DO UPDATE SET dernier_numero = public.ecriture_sequences.dernier_numero + 1
  RETURNING dernier_numero INTO v_seq;

  v_num := _journal_code || '-' || to_char(_date, 'YYYY') || '-' || lpad(v_seq::text, 6, '0');

  INSERT INTO public.ecritures (entreprise_id, exercice_id, journal_code, numero_sequence, numero,
    date_ecriture, piece, libelle, statut, total_debit, total_credit, origine, created_by, valide_par, valide_le)
  VALUES (_entreprise_id, _exercice_id, _journal_code, v_seq, v_num, _date, COALESCE(_piece, v_num),
    _libelle, _statut, v_debit, v_credit, _origine, auth.uid(),
    CASE WHEN _statut='validee' THEN auth.uid() END, CASE WHEN _statut='validee' THEN now() END)
  RETURNING id INTO v_id;

  FOR l IN SELECT * FROM jsonb_array_elements(_lignes) LOOP
    INSERT INTO public.ecriture_lignes (ecriture_id, entreprise_id, exercice_id, ordre, compte,
      intitule, libelle, debit, credit)
    VALUES (v_id, _entreprise_id, _exercice_id, i, l->>'compte', COALESCE(l->>'intitule',''),
      COALESCE(l->>'libelle', _libelle), ROUND(COALESCE((l->>'debit')::numeric,0),2),
      ROUND(COALESCE((l->>'credit')::numeric,0),2));

    INSERT INTO public.journal (entreprise_id, exercice_id, ecriture_id, date_ecriture, piece,
      journal_code, libelle, compte, intitule, debit, credit, statut_validation)
    VALUES (_entreprise_id, _exercice_id, v_id, _date, COALESCE(_piece, v_num), _journal_code,
      COALESCE(l->>'libelle', _libelle), l->>'compte', COALESCE(l->>'intitule',''),
      ROUND(COALESCE((l->>'debit')::numeric,0),2), ROUND(COALESCE((l->>'credit')::numeric,0),2),
      CASE WHEN _statut='validee' THEN 'valide' ELSE 'brouillon' END);
    i := i + 1;
  END LOOP;

  INSERT INTO public.journal_audit (journal_id, entreprise_id, exercice_id, action, new_data, user_id)
  VALUES (NULL, _entreprise_id, _exercice_id, 'ECRITURE_' || upper(_statut),
    jsonb_build_object('ecriture_id', v_id, 'numero', v_num, 'total', v_debit), auth.uid());

  PERFORM public.fn_refresh_balance();
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.fn_creer_ecriture(uuid,uuid,text,date,text,jsonb,text,text,text) TO authenticated;