-- Retour arrière de 0093 : garde-fou d'origine (tout montant ≤ 0 refusé).
CREATE OR REPLACE FUNCTION public.sante_rejet_entree_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN IF auth.uid() IS NOT NULL AND NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise' USING ERRCODE='42501'; END IF; IF NEW.montant IS NOT NULL AND (NEW.montant::text IN ('NaN','Infinity','-Infinity') OR NEW.montant<=0 OR NEW.montant<>trunc(NEW.montant)) THEN RAISE EXCEPTION 'Montant FCFA invalide'; END IF; RETURN NEW; END; $function$;
