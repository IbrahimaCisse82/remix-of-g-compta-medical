CREATE FUNCTION public.banque_peut_ecrire(_entreprise_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT auth.uid() IS NOT NULL AND public.mfa_conforme() AND (public.can_write_entreprise(_entreprise_id) OR EXISTS(SELECT 1 FROM public.structures s JOIN public.structure_memberships m ON m.structure_id=s.id JOIN public.medical_user_roles r ON r.membership_id=m.id WHERE s.entreprise_id=_entreprise_id AND m.user_id=auth.uid() AND m.statut='actif' AND r.role IN ('admin_structure','comptable'))); $$;
REVOKE ALL ON FUNCTION public.banque_peut_ecrire(uuid) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.banque_peut_ecrire(uuid) TO authenticated, service_role;
CREATE TABLE public.releves_bancaires(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entreprise_id uuid NOT NULL REFERENCES public.entreprises(id), exercice_id uuid NOT NULL REFERENCES public.exercices(id), compte text NOT NULL CHECK(compte ~ '^52[0-9]+$'), nom_fichier text NOT NULL, empreinte text NOT NULL, solde_initial numeric(18,2) NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL DEFAULT auth.uid(), UNIQUE(entreprise_id,exercice_id,compte,empreinte));
GRANT SELECT ON public.releves_bancaires TO authenticated; GRANT ALL ON public.releves_bancaires TO service_role;
ALTER TABLE public.releves_bancaires ENABLE ROW LEVEL SECURITY;
CREATE POLICY banque_releves_lecture ON public.releves_bancaires FOR SELECT TO authenticated USING(entreprise_id IN(SELECT public.get_user_entreprise_ids(auth.uid())) AND public.mfa_conforme());
CREATE TABLE public.operations_bancaires(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), releve_id uuid NOT NULL REFERENCES public.releves_bancaires(id), entreprise_id uuid NOT NULL REFERENCES public.entreprises(id), exercice_id uuid NOT NULL REFERENCES public.exercices(id), compte text NOT NULL, numero_ligne integer NOT NULL, date_operation date NOT NULL, libelle text NOT NULL, reference text NOT NULL DEFAULT '', montant numeric(18,2) NOT NULL CHECK(montant<>0), journal_id uuid REFERENCES public.journal(id), rapproche_par uuid, rapproche_le timestamptz, UNIQUE(releve_id,numero_ligne), UNIQUE(journal_id));
GRANT SELECT ON public.operations_bancaires TO authenticated; GRANT ALL ON public.operations_bancaires TO service_role;
ALTER TABLE public.operations_bancaires ENABLE ROW LEVEL SECURITY;
CREATE POLICY banque_operations_lecture ON public.operations_bancaires FOR SELECT TO authenticated USING(entreprise_id IN(SELECT public.get_user_entreprise_ids(auth.uid())) AND public.mfa_conforme());
CREATE INDEX banque_operations_scope ON public.operations_bancaires(entreprise_id,exercice_id,compte);
CREATE TABLE public.rapprochements_bancaires_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entreprise_id uuid NOT NULL REFERENCES public.entreprises(id), operation_id uuid NOT NULL REFERENCES public.operations_bancaires(id), journal_id uuid NOT NULL REFERENCES public.journal(id), action text NOT NULL CHECK(action IN('rapprocher','annuler')), user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.rapprochements_bancaires_audit TO authenticated; GRANT ALL ON public.rapprochements_bancaires_audit TO service_role;
ALTER TABLE public.rapprochements_bancaires_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY banque_audit_lecture ON public.rapprochements_bancaires_audit FOR SELECT TO authenticated USING(entreprise_id IN(SELECT public.get_user_entreprise_ids(auth.uid())) AND public.mfa_conforme());
CREATE FUNCTION public.banque_importer(_entreprise_id uuid,_exercice_id uuid,_compte text,_nom_fichier text,_empreinte text,_solde_initial numeric,_operations jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid; x jsonb; n integer:=0; d date; m numeric; ex public.exercices%ROWTYPE;
BEGIN
IF NOT public.banque_peut_ecrire(_entreprise_id) THEN RAISE EXCEPTION 'Accès refusé : rôle comptable requis'; END IF;
SELECT * INTO ex FROM public.exercices WHERE id=_exercice_id AND entreprise_id=_entreprise_id FOR SHARE;
IF NOT FOUND OR ex.statut='cloture' THEN RAISE EXCEPTION 'Exercice absent ou clôturé'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.plan_comptable WHERE entreprise_id=_entreprise_id AND numero=_compte AND actif AND numero ~ '^52[0-9]+$') THEN RAISE EXCEPTION 'Compte bancaire actif requis'; END IF;
IF jsonb_typeof(_operations) IS DISTINCT FROM 'array' OR jsonb_array_length(_operations)<1 OR jsonb_array_length(_operations)>10000 OR length(_nom_fichier)>255 OR length(_empreinte)<>64 OR _solde_initial IS NULL THEN RAISE EXCEPTION 'Relevé invalide'; END IF;
INSERT INTO public.releves_bancaires(entreprise_id,exercice_id,compte,nom_fichier,empreinte,solde_initial) VALUES(_entreprise_id,_exercice_id,_compte,_nom_fichier,_empreinte,_solde_initial) RETURNING id INTO rid;
FOR x IN SELECT value FROM jsonb_array_elements(_operations) LOOP
n:=n+1; d:=(x->>'date')::date; m:=(x->>'montant')::numeric;
IF d IS NULL OR d<ex.date_debut OR d>ex.date_fin OR m IS NULL OR m::text IN('NaN','Infinity','-Infinity') OR m=0 OR m<>round(m,2) OR nullif(trim(x->>'libelle'),'') IS NULL THEN RAISE EXCEPTION 'Opération invalide à la ligne %',n; END IF;
INSERT INTO public.operations_bancaires(releve_id,entreprise_id,exercice_id,compte,numero_ligne,date_operation,libelle,reference,montant) VALUES(rid,_entreprise_id,_exercice_id,_compte,n,d,x->>'libelle',coalesce(x->>'reference',''),m);
END LOOP; RETURN rid;
END; $$;
REVOKE ALL ON FUNCTION public.banque_importer(uuid,uuid,text,text,text,numeric,jsonb) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.banque_importer(uuid,uuid,text,text,text,numeric,jsonb) TO authenticated,service_role;
CREATE FUNCTION public.banque_rapprocher(_operation_id uuid,_journal_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE op public.operations_bancaires%ROWTYPE; j public.journal%ROWTYPE;
BEGIN
SELECT * INTO op FROM public.operations_bancaires WHERE id=_operation_id FOR UPDATE;
IF NOT FOUND OR NOT public.banque_peut_ecrire(op.entreprise_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
PERFORM 1 FROM public.exercices WHERE id=op.exercice_id AND statut<>'cloture' FOR SHARE;
IF NOT FOUND THEN RAISE EXCEPTION 'Exercice clôturé'; END IF;
IF _journal_id IS NULL THEN
IF op.journal_id IS NOT NULL THEN INSERT INTO public.rapprochements_bancaires_audit(entreprise_id,operation_id,journal_id,action,user_id) VALUES(op.entreprise_id,op.id,op.journal_id,'annuler',auth.uid()); END IF;
UPDATE public.operations_bancaires SET journal_id=NULL,rapproche_par=NULL,rapproche_le=NULL WHERE id=op.id; RETURN;
END IF;
IF op.journal_id IS NOT NULL THEN RAISE EXCEPTION 'Opération déjà rapprochée'; END IF;
SELECT * INTO j FROM public.journal WHERE id=_journal_id FOR SHARE;
IF NOT FOUND OR j.entreprise_id<>op.entreprise_id OR j.exercice_id<>op.exercice_id OR j.compte<>op.compte OR round(j.debit-j.credit,2)<>op.montant THEN RAISE EXCEPTION 'Écriture incompatible : entreprise, exercice, compte ou montant'; END IF;
IF j.ecriture_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ecritures WHERE id=j.ecriture_id AND statut='valide') THEN RAISE EXCEPTION 'Écriture non validée'; END IF;
UPDATE public.operations_bancaires SET journal_id=j.id,rapproche_par=auth.uid(),rapproche_le=now() WHERE id=op.id;
INSERT INTO public.rapprochements_bancaires_audit(entreprise_id,operation_id,journal_id,action,user_id) VALUES(op.entreprise_id,op.id,j.id,'rapprocher',auth.uid());
END; $$;
REVOKE ALL ON FUNCTION public.banque_rapprocher(uuid,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.banque_rapprocher(uuid,uuid) TO authenticated,service_role;
COMMENT ON TABLE public.releves_bancaires IS 'Relevés importés sans modification des écritures comptables. Débit bancaire = sortie, crédit bancaire = entrée.';