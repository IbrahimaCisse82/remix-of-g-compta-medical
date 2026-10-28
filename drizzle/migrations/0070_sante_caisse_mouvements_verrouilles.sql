CREATE OR REPLACE FUNCTION public.sante_caisse_controler_session() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.mfa_conforme() OR NOT public.has_any_medical_role(NEW.structure_id, ARRAY['admin_structure','caissier','secretaire']) THEN RAISE EXCEPTION 'Droit insuffisant'; END IF;
 IF NEW.caissier IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Caisse personnelle uniquement'; END IF;
 IF NEW.fond_initial IS NULL OR NEW.fond_initial::text IN ('NaN','Infinity','-Infinity') OR NEW.fond_initial<0 OR NEW.fond_initial<>trunc(NEW.fond_initial) THEN RAISE EXCEPTION 'Fond FCFA entier positif ou nul obligatoire'; END IF;
 IF TG_OP='UPDATE' AND (NEW.structure_id IS DISTINCT FROM OLD.structure_id OR NEW.caissier IS DISTINCT FROM OLD.caissier OR NEW.fond_initial IS DISTINCT FROM OLD.fond_initial) THEN RAISE EXCEPTION 'Identité et fond de caisse immuables'; END IF;
 IF NEW.fermee_le IS NOT NULL AND (NEW.montant_compte IS NULL OR NEW.montant_compte::text IN ('NaN','Infinity','-Infinity') OR NEW.montant_compte<0 OR NEW.montant_compte<>trunc(NEW.montant_compte)) THEN RAISE EXCEPTION 'Montant compté FCFA entier positif ou nul obligatoire'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sante_caisse_controle BEFORE INSERT OR UPDATE ON public.sante_sessions_caisse FOR EACH ROW EXECUTE FUNCTION public.sante_caisse_controler_session();
CREATE OR REPLACE FUNCTION public.sante_encaissement_controler_session() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.sante_sessions_caisse;
BEGIN
 IF NEW.mode='organisme' THEN RETURN NEW; END IF;
 IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'Vérification MFA requise'; END IF;
 SELECT * INTO s FROM public.sante_sessions_caisse WHERE id=NEW.session_id FOR UPDATE;
 IF s.id IS NULL OR s.fermee_le IS NOT NULL OR s.caissier IS DISTINCT FROM auth.uid() OR s.structure_id IS DISTINCT FROM NEW.structure_id THEN RAISE EXCEPTION 'Caisse fermée ou non autorisée'; END IF;
 IF NEW.montant IS NULL OR NEW.montant::text IN ('NaN','Infinity','-Infinity') OR NEW.montant<=0 OR NEW.montant<>trunc(NEW.montant) THEN RAISE EXCEPTION 'Montant encaissé FCFA entier positif obligatoire'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sante_encaissement_session BEFORE INSERT ON public.sante_encaissements FOR EACH ROW EXECUTE FUNCTION public.sante_encaissement_controler_session();
CREATE OR REPLACE FUNCTION public.sante_remboursement_controler_session() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.sante_sessions_caisse;
BEGIN
 IF NEW.statut='paye' AND OLD.statut IS DISTINCT FROM NEW.statut THEN
  IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'Vérification MFA requise'; END IF;
  IF NEW.mode='especes' THEN
   SELECT * INTO s FROM public.sante_sessions_caisse WHERE id=NEW.session_id FOR UPDATE;
   IF s.id IS NULL OR s.fermee_le IS NOT NULL OR s.caissier IS DISTINCT FROM auth.uid() OR s.structure_id IS DISTINCT FROM NEW.structure_id THEN RAISE EXCEPTION 'Caisse fermée ou non autorisée'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sante_remboursement_session BEFORE UPDATE ON public.sante_remboursements FOR EACH ROW EXECUTE FUNCTION public.sante_remboursement_controler_session();
REVOKE ALL ON FUNCTION public.sante_caisse_controler_session(),public.sante_encaissement_controler_session(),public.sante_remboursement_controler_session() FROM PUBLIC,anon,authenticated;