CREATE TABLE public.syscohada_references (version text PRIMARY KEY, source text NOT NULL, comptes jsonb NOT NULL DEFAULT '[]', mapping jsonb NOT NULL DEFAULT '[]', valide_officiellement boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.syscohada_references TO authenticated;
GRANT ALL ON public.syscohada_references TO service_role;
ALTER TABLE public.syscohada_references ENABLE ROW LEVEL SECURITY;
CREATE POLICY reference_lecture ON public.syscohada_references FOR SELECT TO authenticated USING (public.mfa_conforme());
ALTER TABLE public.plan_comptable ADD COLUMN IF NOT EXISTS poste_cible text;
CREATE OR REPLACE FUNCTION public.syscohada_garde_ecriture() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ex public.exercices%ROWTYPE;
BEGIN
 SELECT * INTO ex FROM public.exercices WHERE id=NEW.exercice_id FOR SHARE;
 IF NOT FOUND OR ex.entreprise_id IS DISTINCT FROM NEW.entreprise_id OR NEW.date_ecriture IS NULL OR NEW.date_ecriture<ex.date_debut OR NEW.date_ecriture>ex.date_fin THEN RAISE EXCEPTION 'Exercice, entreprise ou date incohérents'; END IF;
 IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise'; END IF;
 IF NEW.origine='cloture' AND coalesce(current_setting('app.syscohada_cloture',true),'')<>'1' THEN RAISE EXCEPTION 'Origine clôture réservée au serveur'; END IF;
 IF nullif(trim(NEW.piece),'') IS NULL THEN RAISE EXCEPTION 'Pièce justificative obligatoire'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER syscohada_ecriture_garde BEFORE INSERT OR UPDATE ON public.ecritures FOR EACH ROW EXECUTE FUNCTION public.syscohada_garde_ecriture();
CREATE OR REPLACE FUNCTION public.syscohada_garde_ligne() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.ecritures%ROWTYPE;
BEGIN
 SELECT * INTO e FROM public.ecritures WHERE id=NEW.ecriture_id;
 IF NOT FOUND OR NEW.entreprise_id IS DISTINCT FROM e.entreprise_id OR NEW.exercice_id IS DISTINCT FROM e.exercice_id THEN RAISE EXCEPTION 'Ligne hors entreprise ou exercice'; END IF;
 IF NEW.debit IS NULL OR NEW.credit IS NULL OR NEW.debit::text IN ('NaN','Infinity','-Infinity') OR NEW.credit::text IN ('NaN','Infinity','-Infinity') OR NEW.debit<0 OR NEW.credit<0 OR (NEW.debit>0 AND NEW.credit>0) OR NEW.debit<>round(NEW.debit) OR NEW.credit<>round(NEW.credit) THEN RAISE EXCEPTION 'Montants FCFA entiers, positifs et sur un seul côté requis'; END IF;
 IF NEW.compte ~ '^(20|6811|1374)' THEN RAISE EXCEPTION 'Compte supprimé du SYSCOHADA révisé : %',NEW.compte; END IF;
 IF EXISTS(SELECT 1 FROM public.plan_comptable WHERE entreprise_id=NEW.entreprise_id AND numero=NEW.compte AND NOT actif) THEN RAISE EXCEPTION 'Compte désactivé'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER syscohada_ligne_garde BEFORE INSERT OR UPDATE ON public.ecriture_lignes FOR EACH ROW EXECUTE FUNCTION public.syscohada_garde_ligne();
CREATE OR REPLACE FUNCTION public.fn_balance_ecarts(_entreprise_id uuid, _exercice_id uuid) RETURNS TABLE(compte text,md_stockee numeric,md_calculee numeric,mc_stockee numeric,mc_calculee numeric,ecart_debit numeric,ecart_credit numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(b.compte,m.compte),coalesce(b.md,0),coalesce(m.md,0),coalesce(b.mc,0),coalesce(m.mc,0),round(coalesce(b.md,0)-coalesce(m.md,0),2),round(coalesce(b.mc,0)-coalesce(m.mc,0),2)
 FROM (SELECT * FROM public.balance WHERE entreprise_id=_entreprise_id AND exercice_id=_exercice_id) b FULL JOIN (SELECT * FROM public.mv_balance WHERE entreprise_id=_entreprise_id AND exercice_id=_exercice_id) m ON m.compte=b.compte
 WHERE public.mfa_conforme() AND _entreprise_id IN (SELECT public.get_user_entreprise_ids(auth.uid())) AND (round(coalesce(b.md,0)-coalesce(m.md,0),2)<>0 OR round(coalesce(b.mc,0)-coalesce(m.mc,0),2)<>0);
$$;
CREATE OR REPLACE FUNCTION public.fn_balance(_entreprise_id uuid,_exercice_id uuid) RETURNS TABLE(compte text,intitule text,md numeric,mc numeric,sfd numeric,sfc numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT b.compte,b.intitule,b.md,b.mc,b.sfd,b.sfc FROM public.mv_balance b WHERE b.entreprise_id=_entreprise_id AND b.exercice_id=_exercice_id AND public.mfa_conforme() AND b.entreprise_id IN(SELECT public.get_user_entreprise_ids(auth.uid())) ORDER BY b.compte;
$$;
CREATE OR REPLACE FUNCTION public.syscohada_cloture_garde() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.statut='cloture' AND NEW.statut IS DISTINCT FROM OLD.statut THEN
  IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.syscohada_references WHERE version='SYSCOHADA_REVISE_2019_V1' AND valide_officiellement) THEN RAISE EXCEPTION 'Clôture bloquée : référentiel et mappings SYSCOHADA non validés officiellement'; END IF;
  IF EXISTS(SELECT 1 FROM public.ecritures WHERE exercice_id=NEW.id AND statut='brouillon') THEN RAISE EXCEPTION 'Clôture bloquée : brouillons à valider'; END IF;
  IF EXISTS(SELECT 1 FROM public.journal WHERE exercice_id=NEW.id AND compte ~ '^(20|6811|1374)') THEN RAISE EXCEPTION 'Clôture bloquée : comptes supprimés'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER syscohada_cloture_garde BEFORE UPDATE ON public.exercices FOR EACH ROW EXECUTE FUNCTION public.syscohada_cloture_garde();
REVOKE ALL ON FUNCTION public.syscohada_garde_ecriture(),public.syscohada_garde_ligne(),public.syscohada_cloture_garde() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fn_balance(uuid,uuid),public.fn_balance_ecarts(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_balance(uuid,uuid),public.fn_balance_ecarts(uuid,uuid) TO authenticated,service_role;