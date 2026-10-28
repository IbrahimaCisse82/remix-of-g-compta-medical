CREATE OR REPLACE FUNCTION public.sante_equipe_lister(_structure_id uuid)
RETURNS TABLE(id uuid, user_id uuid, nom text, email text, statut text, roles text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_structure_admin(_structure_id) OR NOT public.mfa_conforme() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
 RETURN QUERY SELECT m.id,m.user_id,p.full_name,p.email,m.statut::text,coalesce(array_agg(r.role::text ORDER BY r.role::text) FILTER(WHERE r.role IS NOT NULL),'{}'::text[])
 FROM public.structure_memberships m LEFT JOIN public.profiles p ON p.id=m.user_id LEFT JOIN public.medical_user_roles r ON r.membership_id=m.id
 WHERE m.structure_id=_structure_id GROUP BY m.id,p.full_name,p.email ORDER BY m.created_at;
END $$;
REVOKE ALL ON FUNCTION public.sante_equipe_lister(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sante_equipe_lister(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sante_equipe_modifier(_structure_id uuid,_membership_id uuid,_roles text[],_statut text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _m public.structure_memberships%ROWTYPE; _before jsonb; _type public.structure_type;
BEGIN
 PERFORM 1 FROM public.structures WHERE id=_structure_id FOR UPDATE;
 IF NOT public.is_structure_admin(_structure_id) OR NOT public.mfa_conforme() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
 SELECT * INTO _m FROM public.structure_memberships WHERE id=_membership_id AND structure_id=_structure_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Membre introuvable'; END IF;
 IF _statut NOT IN ('actif','suspendu') OR _statut IS NULL THEN RAISE EXCEPTION 'Statut invalide'; END IF;
 IF coalesce(cardinality(_roles),0)=0 OR EXISTS(SELECT 1 FROM unnest(_roles) r WHERE r IS NULL OR r NOT IN ('admin_structure','medecin','biologiste','technicien','preleveur','secretaire','caissier','comptable','lecteur','tiers_payant')) THEN RAISE EXCEPTION 'Rôles invalides'; END IF;
 SELECT type INTO _type FROM public.structures WHERE id=_structure_id;
 IF (_type='cabinet' AND _roles && ARRAY['biologiste','technicien','preleveur']) OR (_type='laboratoire' AND 'medecin'=ANY(_roles)) THEN RAISE EXCEPTION 'Rôle incompatible avec la structure'; END IF;
 IF _m.statut='actif' AND EXISTS(SELECT 1 FROM public.medical_user_roles WHERE membership_id=_m.id AND role='admin_structure')
 AND (_statut<>'actif' OR NOT ('admin_structure'=ANY(_roles)))
 AND NOT EXISTS(SELECT 1 FROM public.structure_memberships m JOIN public.medical_user_roles r ON r.membership_id=m.id WHERE m.structure_id=_structure_id AND m.id<>_m.id AND m.statut='actif' AND r.role='admin_structure') THEN RAISE EXCEPTION 'Le dernier administrateur actif doit être conservé'; END IF;
 SELECT jsonb_build_object('statut',_m.statut,'roles',coalesce(jsonb_agg(role),'[]'::jsonb)) INTO _before FROM public.medical_user_roles WHERE membership_id=_m.id;
 DELETE FROM public.medical_user_roles WHERE membership_id=_m.id;
 INSERT INTO public.medical_user_roles(membership_id,role) SELECT _m.id,r::public.medical_role FROM (SELECT DISTINCT unnest(_roles) r) roles;
 UPDATE public.structure_memberships SET statut=_statut::public.membership_status,updated_at=now() WHERE id=_m.id;
 INSERT INTO public.medical_audit_log(structure_id,user_id,action,table_name,record_id,old_data,new_data) VALUES(_structure_id,auth.uid(),'UPDATE','structure_memberships',_m.id,_before,jsonb_build_object('statut',_statut,'roles',_roles));
END $$;
REVOKE ALL ON FUNCTION public.sante_equipe_modifier(uuid,uuid,text[],text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sante_equipe_modifier(uuid,uuid,text[],text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sante_invitation_revoquer(_structure_id uuid,_invitation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_structure_admin(_structure_id) OR NOT public.mfa_conforme() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
 UPDATE public.medical_invitations SET statut='expiree',expires_at=least(expires_at,now()) WHERE id=_invitation_id AND structure_id=_structure_id AND statut='en_attente';
 IF NOT FOUND THEN RAISE EXCEPTION 'Invitation introuvable ou déjà traitée'; END IF;
 INSERT INTO public.medical_audit_log(structure_id,user_id,action,table_name,record_id,new_data) VALUES(_structure_id,auth.uid(),'UPDATE','medical_invitations',_invitation_id,jsonb_build_object('statut','expiree','motif','revocation'));
END $$;
REVOKE ALL ON FUNCTION public.sante_invitation_revoquer(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sante_invitation_revoquer(uuid,uuid) TO authenticated;