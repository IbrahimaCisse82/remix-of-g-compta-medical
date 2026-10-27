CREATE OR REPLACE FUNCTION public.banque_rapprocher(_operation_id uuid,_journal_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
IF j.statut_validation IS DISTINCT FROM 'valide' OR (j.ecriture_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ecritures WHERE id=j.ecriture_id AND statut='validee')) THEN RAISE EXCEPTION 'Écriture non validée'; END IF;
UPDATE public.operations_bancaires SET journal_id=j.id,rapproche_par=auth.uid(),rapproche_le=now() WHERE id=op.id;
INSERT INTO public.rapprochements_bancaires_audit(entreprise_id,operation_id,journal_id,action,user_id) VALUES(op.entreprise_id,op.id,j.id,'rapprocher',auth.uid());
END; $$;
REVOKE ALL ON FUNCTION public.banque_rapprocher(uuid,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.banque_rapprocher(uuid,uuid) TO authenticated,service_role;