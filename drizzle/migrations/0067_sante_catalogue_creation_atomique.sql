CREATE OR REPLACE FUNCTION public.sante_catalogue_creer_analyse(_structure_id uuid, _code text, _libelle text, _section text, _tarif numeric, _delai integer, _tube text, _echantillon text, _parametre text, _unite text, _type text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id uuid;
BEGIN
 IF NOT public.mfa_conforme() OR NOT public.has_any_medical_role(_structure_id, ARRAY['admin_structure','biologiste']) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
 IF coalesce(trim(_code),'')='' OR coalesce(trim(_libelle),'')='' OR coalesce(trim(_parametre),'')='' THEN RAISE EXCEPTION 'Code, libellé et paramètre obligatoires'; END IF;
 IF _tarif IS NULL OR _tarif::text IN ('NaN','Infinity','-Infinity') OR _tarif<0 OR _tarif<>trunc(_tarif) THEN RAISE EXCEPTION 'Tarif FCFA entier positif ou nul obligatoire'; END IF;
 IF _delai IS NULL OR _delai<=0 THEN RAISE EXCEPTION 'Délai positif obligatoire'; END IF;
 IF _type NOT IN ('numerique','qualitatif','texte') OR _type IS NULL THEN RAISE EXCEPTION 'Type de résultat invalide'; END IF;
 INSERT INTO public.sante_analyses(structure_id,code,libelle,section,tarif,delai_heures,tube,echantillon)
 VALUES (_structure_id,upper(trim(_code)),trim(_libelle),_section,_tarif,_delai,nullif(trim(_tube),''),nullif(trim(_echantillon),'')) RETURNING id INTO _id;
 INSERT INTO public.sante_analyse_parametres(structure_id,analyse_id,code,libelle,unite,type,ordre)
 VALUES (_structure_id,_id,upper(trim(_code)),trim(_parametre),nullif(trim(_unite),''),_type,0);
 RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.sante_catalogue_creer_analyse(uuid,text,text,text,numeric,integer,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_catalogue_creer_analyse(uuid,text,text,text,numeric,integer,text,text,text,text,text) TO authenticated;