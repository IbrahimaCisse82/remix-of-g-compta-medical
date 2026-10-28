CREATE TABLE public.sante_repertoire_partages (structure_id uuid PRIMARY KEY REFERENCES public.structures(id), groupe_id uuid NOT NULL);
GRANT SELECT ON public.sante_repertoire_partages TO authenticated;
GRANT ALL ON public.sante_repertoire_partages TO service_role;
ALTER TABLE public.sante_repertoire_partages ENABLE ROW LEVEL SECURITY;
CREATE POLICY repertoire_groupe_lecture ON public.sante_repertoire_partages FOR SELECT TO authenticated USING (public.is_structure_member(structure_id) AND public.mfa_conforme());
CREATE TABLE public.sante_repertoire_organismes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), groupe_id uuid NOT NULL, cle text NOT NULL, nom text NOT NULL, type text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(groupe_id,cle));
GRANT SELECT ON public.sante_repertoire_organismes TO authenticated;
GRANT ALL ON public.sante_repertoire_organismes TO service_role;
ALTER TABLE public.sante_repertoire_organismes ENABLE ROW LEVEL SECURITY;
CREATE POLICY repertoire_organismes_lecture ON public.sante_repertoire_organismes FOR SELECT TO authenticated USING (public.mfa_conforme() AND EXISTS (SELECT 1 FROM public.sante_repertoire_partages p WHERE p.groupe_id = sante_repertoire_organismes.groupe_id AND public.has_any_medical_role(p.structure_id, ARRAY['admin_structure','tiers_payant','secretaire','caissier','comptable'])));
CREATE FUNCTION public.sante_cle_repertoire(_nom text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT lower(regexp_replace(translate(btrim(_nom),'ÀÂÄàâäÉÈÊËéèêëÎÏîïÔÖôöÙÛÜùûüÇç','AAAaaaEEEEeeeeIIiiOOooUUUuuuCc'),'\s+',' ','g')); $$;
CREATE FUNCTION public.sante_partager_organisme() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g uuid; canon public.sante_repertoire_organismes; cible record;
BEGIN
 IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
 SELECT groupe_id INTO g FROM public.sante_repertoire_partages WHERE structure_id=NEW.structure_id;
 IF g IS NULL THEN RETURN NEW; END IF;
 IF auth.uid() IS NOT NULL AND (NOT public.mfa_conforme() OR NOT public.has_any_medical_role(NEW.structure_id, ARRAY['admin_structure','tiers_payant'])) THEN RAISE EXCEPTION 'Accès refusé au répertoire partagé' USING ERRCODE='42501'; END IF;
 IF btrim(NEW.nom)='' OR NEW.type NOT IN ('ipm','assurance','mutuelle','entreprise','autre') THEN RAISE EXCEPTION 'Organisme invalide'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(g::text,0));
 INSERT INTO public.sante_repertoire_organismes(groupe_id,cle,nom,type) VALUES(g,public.sante_cle_repertoire(NEW.nom),btrim(NEW.nom),NEW.type) ON CONFLICT(groupe_id,cle) DO NOTHING;
 SELECT * INTO canon FROM public.sante_repertoire_organismes WHERE groupe_id=g AND cle=public.sante_cle_repertoire(NEW.nom);
 FOR cible IN SELECT structure_id FROM public.sante_repertoire_partages WHERE groupe_id=g AND structure_id<>NEW.structure_id LOOP
  INSERT INTO public.sante_organismes(structure_id,nom,type) SELECT cible.structure_id,canon.nom,canon.type WHERE NOT EXISTS(SELECT 1 FROM public.sante_organismes o WHERE o.structure_id=cible.structure_id AND public.sante_cle_repertoire(o.nom)=canon.cle);
 END LOOP;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.sante_partager_organisme() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sante_organisme_repertoire AFTER INSERT ON public.sante_organismes FOR EACH ROW EXECUTE FUNCTION public.sante_partager_organisme();
COMMENT ON TABLE public.sante_repertoire_organismes IS 'Shared names and types only; local organisms retain separate conventions, auxiliary accounts, coverage and settlements. New inserts propagate; local updates never propagate.';