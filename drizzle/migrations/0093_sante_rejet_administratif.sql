-- Rejet administratif du tiers payant (01/11/2026).
-- Constat (test visuel tiers payant) : « Enregistrer le rejet » de type administratif échouait avec « Montant FCFA
-- invalide ». sante_rejet_tiers n'indique pas de montant pour ce type (l'organisme demande seulement une correction
-- du dossier) ; la colonne montant vaut alors 0 par défaut, et le garde-fou refusait tout montant ≤ 0. Aucun rejet
-- administratif n'avait pu être enregistré sur la plateforme.
-- Correction : montant 0 accepté pour le seul type administratif ; les autres types gardent un montant entier > 0.
CREATE OR REPLACE FUNCTION public.sante_rejet_entree_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN IF auth.uid() IS NOT NULL AND NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise' USING ERRCODE='42501'; END IF; IF NEW.montant IS NOT NULL AND (NEW.montant::text IN ('NaN','Infinity','-Infinity') OR NEW.montant<>trunc(NEW.montant) OR (NEW.type = 'administratif' AND NEW.montant <> 0) OR (NEW.type <> 'administratif' AND NEW.montant<=0)) THEN RAISE EXCEPTION 'Montant FCFA invalide'; END IF; RETURN NEW; END; $function$;
