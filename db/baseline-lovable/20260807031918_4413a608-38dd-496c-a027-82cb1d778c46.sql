-- ============================================================
-- PRIORITE 0 : FONDATIONS D'INTEGRITE COMPTABLE
-- ============================================================

-- ---------- 5. ROLES APPLICATIFS EN BASE ----------
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  entreprise_id uuid REFERENCES public.entreprises(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, entreprise_id)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- Role effectif sur une entreprise : proprietaire => admin, sinon role cabinet, sinon user_roles
CREATE OR REPLACE FUNCTION public.get_entreprise_role(_user_id uuid, _entreprise_id uuid)
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT 'admin'::public.app_role FROM public.entreprises e
      WHERE e.id = _entreprise_id AND e.user_id = _user_id),
    (SELECT cm.role FROM public.entreprises e
       JOIN public.cabinet_members cm ON cm.cabinet_id = e.cabinet_id
      WHERE e.id = _entreprise_id AND cm.user_id = _user_id LIMIT 1),
    (SELECT ur.role FROM public.user_roles ur
      WHERE ur.user_id = _user_id AND ur.entreprise_id = _entreprise_id LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_entreprise(_entreprise_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.get_entreprise_role(auth.uid(), _entreprise_id) IN ('admin','comptable');
$$;

CREATE OR REPLACE FUNCTION public.can_admin_entreprise(_entreprise_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.get_entreprise_role(auth.uid(), _entreprise_id) = 'admin';
$$;

CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (entreprise_id IS NOT NULL AND public.can_admin_entreprise(entreprise_id)));
CREATE POLICY "Admins manage entreprise roles" ON public.user_roles FOR ALL TO authenticated
  USING (entreprise_id IS NOT NULL AND public.can_admin_entreprise(entreprise_id))
  WITH CHECK (entreprise_id IS NOT NULL AND public.can_admin_entreprise(entreprise_id));

-- ---------- 1. ENTITE ECRITURES ----------
CREATE TABLE IF NOT EXISTS public.ecritures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  exercice_id uuid NOT NULL REFERENCES public.exercices(id) ON DELETE CASCADE,
  journal_code text NOT NULL,
  numero_sequence bigint NOT NULL,
  numero text NOT NULL,
  date_ecriture date NOT NULL,
  piece text,
  libelle text NOT NULL,
  statut text NOT NULL DEFAULT 'brouillon',
  total_debit numeric(18,2) NOT NULL DEFAULT 0,
  total_credit numeric(18,2) NOT NULL DEFAULT 0,
  origine text NOT NULL DEFAULT 'saisie',
  contrepasse_par uuid REFERENCES public.ecritures(id),
  contrepassation_de uuid REFERENCES public.ecritures(id),
  motif_annulation text,
  created_by uuid,
  valide_par uuid,
  valide_le timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ecritures_statut_chk CHECK (statut IN ('brouillon','validee','annulee')),
  CONSTRAINT ecritures_equilibre_chk CHECK (total_debit = total_credit),
  CONSTRAINT ecritures_seq_uk UNIQUE (entreprise_id, exercice_id, journal_code, numero_sequence)
);

CREATE TABLE IF NOT EXISTS public.ecriture_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ecriture_id uuid NOT NULL REFERENCES public.ecritures(id) ON DELETE CASCADE,
  entreprise_id uuid NOT NULL,
  exercice_id uuid NOT NULL,
  ordre integer NOT NULL DEFAULT 0,
  compte text NOT NULL,
  intitule text NOT NULL DEFAULT '',
  libelle text,
  debit numeric(18,2) NOT NULL DEFAULT 0,
  credit numeric(18,2) NOT NULL DEFAULT 0,
  lettrage text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ligne_sens_chk CHECK (debit >= 0 AND credit >= 0 AND NOT (debit > 0 AND credit > 0))
);

CREATE TABLE IF NOT EXISTS public.ecriture_sequences (
  entreprise_id uuid NOT NULL,
  exercice_id uuid NOT NULL,
  journal_code text NOT NULL,
  dernier_numero bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (entreprise_id, exercice_id, journal_code)
);

CREATE INDEX IF NOT EXISTS idx_ecritures_ent_exc ON public.ecritures(entreprise_id, exercice_id, date_ecriture);
CREATE INDEX IF NOT EXISTS idx_ecritures_statut ON public.ecritures(entreprise_id, statut);
CREATE INDEX IF NOT EXISTS idx_lignes_ecriture ON public.ecriture_lignes(ecriture_id);
CREATE INDEX IF NOT EXISTS idx_lignes_compte ON public.ecriture_lignes(entreprise_id, exercice_id, compte);
CREATE INDEX IF NOT EXISTS idx_journal_ent_exc_compte ON public.journal(entreprise_id, exercice_id, compte);

GRANT SELECT ON public.ecritures TO authenticated;
GRANT SELECT ON public.ecriture_lignes TO authenticated;
GRANT SELECT ON public.ecriture_sequences TO authenticated;
GRANT ALL ON public.ecritures TO service_role;
GRANT ALL ON public.ecriture_lignes TO service_role;
GRANT ALL ON public.ecriture_sequences TO service_role;

ALTER TABLE public.ecritures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecriture_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecriture_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own ecritures" ON public.ecritures FOR SELECT TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY "Read own ecriture_lignes" ON public.ecriture_lignes FOR SELECT TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));
CREATE POLICY "Read own sequences" ON public.ecriture_sequences FOR SELECT TO authenticated
  USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())));

-- 2. Aucune ecriture directe possible : tout passe par les fonctions serveur
REVOKE INSERT, UPDATE, DELETE ON public.ecritures FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.ecriture_lignes FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.ecriture_sequences FROM authenticated, anon;

-- ---------- 6. VERROU DE PERIODE ----------
CREATE OR REPLACE FUNCTION public.exercice_est_cloture(_exercice_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT statut = 'cloture' FROM public.exercices WHERE id = _exercice_id), false);
$$;

CREATE OR REPLACE FUNCTION public.trg_ecritures_periode()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.exercice_est_cloture(COALESCE(NEW.exercice_id, OLD.exercice_id)) THEN
    RAISE EXCEPTION 'Exercice cloture : aucune ecriture ne peut etre enregistree ou modifiee';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER ecritures_periode_lock BEFORE INSERT OR UPDATE ON public.ecritures
  FOR EACH ROW EXECUTE FUNCTION public.trg_ecritures_periode();

-- ---------- 4. IMMUABILITE DES ECRITURES VALIDEES ----------
CREATE OR REPLACE FUNCTION public.trg_ecritures_immuable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.statut <> 'brouillon' THEN
      RAISE EXCEPTION 'Ecriture validee : suppression interdite, utilisez la contre-passation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.statut = 'validee' AND NEW.statut = 'validee'
     AND (NEW.total_debit, NEW.total_credit, NEW.date_ecriture, NEW.journal_code, NEW.numero_sequence)
      IS DISTINCT FROM (OLD.total_debit, OLD.total_credit, OLD.date_ecriture, OLD.journal_code, OLD.numero_sequence) THEN
    RAISE EXCEPTION 'Ecriture validee : modification interdite (immuabilite comptable)';
  END IF;
  IF OLD.statut = 'annulee' THEN
    RAISE EXCEPTION 'Ecriture annulee : modification interdite';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END; $$;
CREATE TRIGGER ecritures_immuable BEFORE UPDATE OR DELETE ON public.ecritures
  FOR EACH ROW EXECUTE FUNCTION public.trg_ecritures_immuable();

CREATE OR REPLACE FUNCTION public.trg_lignes_immuable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE st text;
BEGIN
  SELECT statut INTO st FROM public.ecritures WHERE id = COALESCE(NEW.ecriture_id, OLD.ecriture_id);
  IF st IS NOT NULL AND st <> 'brouillon' THEN
    RAISE EXCEPTION 'Lignes d''une ecriture validee : modification interdite';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE TRIGGER lignes_immuable BEFORE UPDATE OR DELETE ON public.ecriture_lignes
  FOR EACH ROW EXECUTE FUNCTION public.trg_lignes_immuable();

-- ---------- 2. CREATION D'ECRITURE PAR FONCTION SERVEUR ----------
CREATE OR REPLACE FUNCTION public.fn_creer_ecriture(
  _entreprise_id uuid,
  _exercice_id uuid,
  _journal_code text,
  _date date,
  _libelle text,
  _lignes jsonb,
  _piece text DEFAULT NULL,
  _statut text DEFAULT 'validee',
  _origine text DEFAULT 'saisie'
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
  IF _statut NOT IN ('brouillon','validee') THEN
    RAISE EXCEPTION 'Statut invalide';
  END IF;
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
    date_ecriture, piece, libelle, statut, total_debit, total_credit, origine, created_by,
    valide_par, valide_le)
  VALUES (_entreprise_id, _exercice_id, _journal_code, v_seq, v_num, _date,
    COALESCE(_piece, v_num), _libelle, _statut, v_debit, v_credit, _origine, auth.uid(),
    CASE WHEN _statut = 'validee' THEN auth.uid() END,
    CASE WHEN _statut = 'validee' THEN now() END)
  RETURNING id INTO v_id;

  FOR l IN SELECT * FROM jsonb_array_elements(_lignes) LOOP
    INSERT INTO public.ecriture_lignes (ecriture_id, entreprise_id, exercice_id, ordre, compte,
      intitule, libelle, debit, credit)
    VALUES (v_id, _entreprise_id, _exercice_id, i, l->>'compte',
      COALESCE(l->>'intitule',''), COALESCE(l->>'libelle', _libelle),
      ROUND(COALESCE((l->>'debit')::numeric,0),2), ROUND(COALESCE((l->>'credit')::numeric,0),2));
    i := i + 1;
  END LOOP;

  INSERT INTO public.journal_audit (journal_id, entreprise_id, exercice_id, action, new_data, user_id)
  VALUES (NULL, _entreprise_id, _exercice_id, 'ECRITURE_' || upper(_statut),
    jsonb_build_object('ecriture_id', v_id, 'numero', v_num, 'total', v_debit, 'lignes', _lignes), auth.uid());

  RETURN v_id;
END; $$;

-- 4bis. CONTRE-PASSATION
CREATE OR REPLACE FUNCTION public.fn_contrepasser_ecriture(_ecriture_id uuid, _motif text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.ecritures%ROWTYPE; v_lignes jsonb; v_new uuid;
BEGIN
  SELECT * INTO e FROM public.ecritures WHERE id = _ecriture_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ecriture introuvable'; END IF;
  IF NOT public.can_write_entreprise(e.entreprise_id) THEN RAISE EXCEPTION 'Droits insuffisants'; END IF;
  IF e.contrepasse_par IS NOT NULL THEN RAISE EXCEPTION 'Ecriture deja contre-passee'; END IF;
  IF _motif IS NULL OR length(trim(_motif)) < 5 THEN RAISE EXCEPTION 'Motif d''extourne obligatoire'; END IF;

  SELECT jsonb_agg(jsonb_build_object('compte', compte, 'intitule', intitule,
           'libelle', 'EXTOURNE ' || COALESCE(libelle,''), 'debit', credit, 'credit', debit)
         ORDER BY ordre)
    INTO v_lignes FROM public.ecriture_lignes WHERE ecriture_id = _ecriture_id;

  v_new := public.fn_creer_ecriture(e.entreprise_id, e.exercice_id, e.journal_code, CURRENT_DATE,
    'EXTOURNE ' || e.numero || ' — ' || _motif, v_lignes, NULL, 'validee', 'contrepassation');

  UPDATE public.ecritures SET contrepasse_par = v_new, motif_annulation = _motif WHERE id = _ecriture_id;
  UPDATE public.ecritures SET contrepassation_de = _ecriture_id WHERE id = v_new;

  INSERT INTO public.journal_audit (entreprise_id, exercice_id, action, old_data, new_data, user_id)
  VALUES (e.entreprise_id, e.exercice_id, 'CONTREPASSATION',
    jsonb_build_object('ecriture_id', _ecriture_id, 'numero', e.numero),
    jsonb_build_object('ecriture_id', v_new, 'motif', _motif), auth.uid());
  RETURN v_new;
END; $$;

CREATE OR REPLACE FUNCTION public.fn_valider_ecriture(_ecriture_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.ecritures%ROWTYPE;
BEGIN
  SELECT * INTO e FROM public.ecritures WHERE id = _ecriture_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ecriture introuvable'; END IF;
  IF NOT public.can_write_entreprise(e.entreprise_id) THEN RAISE EXCEPTION 'Droits insuffisants'; END IF;
  IF e.statut <> 'brouillon' THEN RAISE EXCEPTION 'Seul un brouillon peut etre valide'; END IF;
  UPDATE public.ecritures SET statut = 'validee', valide_par = auth.uid(), valide_le = now()
   WHERE id = _ecriture_id;
  INSERT INTO public.journal_audit (entreprise_id, exercice_id, action, new_data, user_id)
  VALUES (e.entreprise_id, e.exercice_id, 'ECRITURE_VALIDEE',
    jsonb_build_object('ecriture_id', _ecriture_id, 'numero', e.numero), auth.uid());
END; $$;

-- ---------- 6bis. REOUVERTURE D'EXERCICE TRACEE ----------
CREATE OR REPLACE FUNCTION public.fn_rouvrir_exercice(_exercice_id uuid, _motif text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ent uuid;
BEGIN
  SELECT entreprise_id INTO v_ent FROM public.exercices WHERE id = _exercice_id;
  IF v_ent IS NULL THEN RAISE EXCEPTION 'Exercice introuvable'; END IF;
  IF NOT public.can_admin_entreprise(v_ent) THEN RAISE EXCEPTION 'Reouverture reservee a l''administrateur'; END IF;
  IF _motif IS NULL OR length(trim(_motif)) < 5 THEN RAISE EXCEPTION 'Motif de reouverture obligatoire'; END IF;
  UPDATE public.exercices SET statut = 'ouvert' WHERE id = _exercice_id;
  INSERT INTO public.cloture_logs (entreprise_id, exercice_id, action, details, user_id)
  VALUES (v_ent, _exercice_id, 'REOUVERTURE', jsonb_build_object('motif', _motif), auth.uid());
END; $$;

-- ---------- 3. BALANCE DERIVEE (vue materialisee) ----------
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_balance AS
SELECT entreprise_id, exercice_id, compte,
       min(intitule) AS intitule,
       ROUND(sum(debit), 2)  AS md,
       ROUND(sum(credit), 2) AS mc,
       GREATEST(ROUND(sum(debit) - sum(credit), 2), 0) AS sfd,
       GREATEST(ROUND(sum(credit) - sum(debit), 2), 0) AS sfc
FROM (
  SELECT entreprise_id, exercice_id, compte, intitule, debit, credit FROM public.journal
  UNION ALL
  SELECT el.entreprise_id, el.exercice_id, el.compte, el.intitule, el.debit, el.credit
    FROM public.ecriture_lignes el
    JOIN public.ecritures e ON e.id = el.ecriture_id
   WHERE e.statut = 'validee'
) src
GROUP BY entreprise_id, exercice_id, compte;

CREATE UNIQUE INDEX IF NOT EXISTS mv_balance_uk ON public.mv_balance(entreprise_id, exercice_id, compte);
REVOKE ALL ON public.mv_balance FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_refresh_balance()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_balance;
EXCEPTION WHEN OTHERS THEN
  REFRESH MATERIALIZED VIEW public.mv_balance;
END; $$;

CREATE OR REPLACE FUNCTION public.fn_balance(_entreprise_id uuid, _exercice_id uuid)
RETURNS TABLE (compte text, intitule text, md numeric, mc numeric, sfd numeric, sfc numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.compte, b.intitule, b.md, b.mc, b.sfd, b.sfc
    FROM public.mv_balance b
   WHERE b.entreprise_id = _entreprise_id AND b.exercice_id = _exercice_id
     AND b.entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid()))
   ORDER BY b.compte;
$$;

-- Rapport d'ecarts : ancienne table balance vs balance derivee (double-tenue)
CREATE OR REPLACE FUNCTION public.fn_balance_ecarts(_entreprise_id uuid, _exercice_id uuid)
RETURNS TABLE (compte text, md_stockee numeric, md_calculee numeric, mc_stockee numeric,
               mc_calculee numeric, ecart_debit numeric, ecart_credit numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(b.compte, m.compte),
         COALESCE(b.md,0), COALESCE(m.md,0), COALESCE(b.mc,0), COALESCE(m.mc,0),
         ROUND(COALESCE(b.md,0) - COALESCE(m.md,0), 2),
         ROUND(COALESCE(b.mc,0) - COALESCE(m.mc,0), 2)
    FROM (SELECT * FROM public.balance WHERE entreprise_id=_entreprise_id AND exercice_id=_exercice_id) b
    FULL OUTER JOIN (SELECT * FROM public.mv_balance WHERE entreprise_id=_entreprise_id AND exercice_id=_exercice_id) m
      ON m.compte = b.compte
   WHERE _entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid()))
     AND ROUND(COALESCE(b.md,0)-COALESCE(m.md,0),2) <> 0
      OR ROUND(COALESCE(b.mc,0)-COALESCE(m.mc,0),2) <> 0
   ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION public.fn_creer_ecriture(uuid,uuid,text,date,text,jsonb,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_contrepasser_ecriture(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_valider_ecriture(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_rouvrir_exercice(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_balance(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_balance_ecarts(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_entreprise_role(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_entreprise(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_admin_entreprise(uuid) TO authenticated;

-- ---------- 7. AUDIT IMMUABLE ----------
REVOKE UPDATE, DELETE ON public.journal_audit FROM authenticated, anon;
REVOKE UPDATE, DELETE ON public.cloture_logs FROM authenticated, anon;

-- ---------- 5bis. LE ROLE LECTEUR NE PEUT PLUS ECRIRE (toutes les tables metier) ----------
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.tablename, p.policyname
      FROM pg_policies p
      JOIN information_schema.columns c
        ON c.table_schema = 'public' AND c.table_name = p.tablename AND c.column_name = 'entreprise_id'
     WHERE p.schemaname = 'public' AND p.cmd = 'ALL'
       AND p.qual LIKE '%get_user_entreprise_ids%'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())))', r.tablename||'_sel', r.tablename);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_write_entreprise(entreprise_id))', r.tablename||'_ins', r.tablename);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.can_write_entreprise(entreprise_id)) WITH CHECK (public.can_write_entreprise(entreprise_id))', r.tablename||'_upd', r.tablename);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.can_admin_entreprise(entreprise_id))', r.tablename||'_del', r.tablename);
  END LOOP;
END $do$;

-- L'ancienne table balance devient lecture seule pour les utilisateurs (derivee desormais)
DROP POLICY IF EXISTS balance_ins ON public.balance;
DROP POLICY IF EXISTS balance_upd ON public.balance;
DROP POLICY IF EXISTS balance_del ON public.balance;
CREATE POLICY balance_ins ON public.balance FOR INSERT TO authenticated
  WITH CHECK (public.can_write_entreprise(entreprise_id));
CREATE POLICY balance_upd ON public.balance FOR UPDATE TO authenticated
  USING (public.can_write_entreprise(entreprise_id)) WITH CHECK (public.can_write_entreprise(entreprise_id));