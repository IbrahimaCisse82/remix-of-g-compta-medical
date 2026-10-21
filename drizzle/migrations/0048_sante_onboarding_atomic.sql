CREATE OR REPLACE FUNCTION public.sante_creer_structure(_type public.structure_type, _nom text, _role_metier public.medical_role DEFAULT 'secretaire', _ninea text DEFAULT NULL, _autorisation_exercice text DEFAULT NULL, _adresse text DEFAULT NULL, _telephone text DEFAULT NULL, _theme public.medical_theme DEFAULT 'clinique')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sid uuid; _eid uuid; _mid uuid; _secteur text; _modules text[];
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise : reconnectez-vous.'; END IF;
 IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise : validez la vérification en deux étapes.'; END IF;
 IF _role_metier IS NULL OR _role_metier NOT IN ('admin_structure','secretaire','medecin','biologiste') THEN RAISE EXCEPTION 'Rôle métier invalide'; END IF;
 IF (_type = 'cabinet' AND _role_metier = 'biologiste') OR (_type = 'laboratoire' AND _role_metier = 'medecin') THEN RAISE EXCEPTION 'Rôle incompatible avec le type de structure'; END IF;
 _sid := public.create_medical_structure(_type, _nom, _ninea, NULL, _autorisation_exercice, NULL, _adresse, _telephone, _theme);
 SELECT id INTO _mid FROM public.structure_memberships WHERE structure_id = _sid AND user_id = auth.uid();
 IF _role_metier <> 'admin_structure' THEN
  INSERT INTO public.medical_user_roles(membership_id,role) VALUES (_mid,_role_metier);
  INSERT INTO public.medical_audit_log(structure_id,user_id,action,table_name,record_id,new_data) VALUES (_sid,auth.uid(),'CREATE','medical_user_roles',_mid,jsonb_build_object('role',_role_metier,'origine','creation_structure'));
 END IF;
 _secteur := CASE _type WHEN 'cabinet' THEN 'sante_clinique' WHEN 'laboratoire' THEN 'sante_laboratoire' ELSE 'sante_mixte' END;
 _modules := CASE _type WHEN 'cabinet' THEN ARRAY['sante_patients','sante_clinique','sante_tiers_payant'] WHEN 'laboratoire' THEN ARRAY['sante_patients','sante_laboratoire','sante_tiers_payant','sante_portail_resultats'] ELSE ARRAY['sante_patients','sante_clinique','sante_laboratoire','sante_tiers_payant','sante_portail_resultats'] END;
 INSERT INTO public.entreprises(nom,user_id,ninea,adresse,tel,monnaie,secteur_activite) VALUES (trim(_nom),auth.uid(),nullif(trim(_ninea),''),nullif(trim(_adresse),''),nullif(trim(_telephone),''),'FCFA',_secteur) RETURNING id INTO _eid;
 INSERT INTO public.entreprise_modules(entreprise_id,module,actif,date_activation) SELECT _eid,m,true,now() FROM unnest(_modules) m;
 UPDATE public.structures SET entreprise_id = _eid WHERE id = _sid;
 RETURN _sid;
END $$;
REVOKE ALL ON FUNCTION public.sante_creer_structure(public.structure_type,text,public.medical_role,text,text,text,text,public.medical_theme) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sante_creer_structure(public.structure_type,text,public.medical_role,text,text,text,text,public.medical_theme) TO authenticated,service_role;
COMMENT ON FUNCTION public.sante_creer_structure(public.structure_type,text,public.medical_role,text,text,text,text,public.medical_theme) IS 'Atomic health onboarding: dedicated new entreprise, type-scoped modules and explicit creator business role. Existing entreprises and subscriptions are unchanged.';
CREATE OR REPLACE FUNCTION public.sante_creer_patient(_structure_id uuid, _nom text, _prenoms text, _sexe text, _date_naissance date DEFAULT NULL, _telephone text DEFAULT NULL, _adresse text DEFAULT NULL, _contact_urgence_nom text DEFAULT NULL, _contact_urgence_tel text DEFAULT NULL, _consentement boolean DEFAULT false, _ignorer_doublons boolean DEFAULT false, _date_naissance_estimee boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE _id uuid; _seq bigint; _an int := extract(year FROM now())::int;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise : reconnectez-vous.'; END IF;
 IF NOT public.has_any_medical_role(_structure_id, ARRAY['medecin','secretaire','biologiste','preleveur']) THEN RAISE EXCEPTION 'Accès refusé : un rôle Médecin, Secrétaire, Biologiste ou Préleveur actif dans cette structure est requis pour créer un dossier patient. Contactez votre administrateur.'; END IF;
 IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise : validez la vérification en deux étapes avant de créer un dossier patient.'; END IF;
 IF NOT public.structure_module_actif(_structure_id,'sante_patients') THEN RAISE EXCEPTION 'Module Dossier patient inactif : contactez votre administrateur pour son activation.'; END IF;
 IF char_length(trim(_nom)) < 2 OR char_length(trim(_prenoms)) < 1 THEN RAISE EXCEPTION 'Nom et prénoms obligatoires'; END IF;
 IF _date_naissance IS NOT NULL AND _date_naissance > current_date THEN RAISE EXCEPTION 'Date de naissance invalide'; END IF;
 IF _date_naissance IS NULL AND _date_naissance_estimee THEN RAISE EXCEPTION 'Une date estimée exige une date de naissance'; END IF;
 IF NOT _ignorer_doublons AND EXISTS (SELECT 1 FROM public.sante_doublons_patient(_structure_id,_nom,_prenoms,_date_naissance,_telephone)) THEN RAISE EXCEPTION 'DOUBLON_POSSIBLE'; END IF;
 INSERT INTO public.sante_patient_sequences(structure_id,annee,dernier) VALUES (_structure_id,_an,1) ON CONFLICT (structure_id,annee) DO UPDATE SET dernier = public.sante_patient_sequences.dernier + 1 RETURNING dernier INTO _seq;
 INSERT INTO public.sante_patients(structure_id,numero_dossier,nom,prenoms,sexe,date_naissance,date_naissance_estimee,telephone,adresse,contact_urgence_nom,contact_urgence_tel,created_by)
 VALUES (_structure_id,'P' || _an || '-' || lpad(_seq::text,6,'0'),upper(trim(_nom)),initcap(trim(_prenoms)),_sexe,_date_naissance,coalesce(_date_naissance_estimee,false) AND _date_naissance IS NOT NULL,nullif(trim(_telephone),''),nullif(trim(_adresse),''),nullif(trim(_contact_urgence_nom),''),nullif(trim(_contact_urgence_tel),''),auth.uid()) RETURNING id INTO _id;
 INSERT INTO public.sante_consentements(patient_id,type,version_texte,accorde,preuve) VALUES (_id,'traitement_donnees','v1-2026',_consentement,'recueil oral à l''accueil');
 RETURN _id;
END $$;