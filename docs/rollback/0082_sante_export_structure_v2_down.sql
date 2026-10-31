-- Retour arrière de 0082 : export de sauvegarde v1 (0054), 15 rubriques seulement.
-- Déconseillé : la v1 ne contient ni le tiers payant, ni la caisse, ni le paramétrage du laboratoire.
CREATE OR REPLACE FUNCTION public.sante_export_structure(_structure_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _r jsonb;
BEGIN
  IF NOT public.has_any_medical_role(_structure_id, ARRAY['admin_structure']) THEN
    RAISE EXCEPTION 'Accès refusé : l''export de sauvegarde est réservé à l''administrateur de la structure.';
  END IF;
  IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise : validez la vérification en deux étapes.'; END IF;
  _r := jsonb_build_object(
    'format', 'g-sante-export-v1', 'genere_le', now(), 'genere_par', auth.uid(),
    'perimetre', 'Données administratives et financières. Le contenu clinique (consultations, résultats, ordonnances) est couvert par les sauvegardes de la plateforme et par l''export tracé de chaque dossier patient.',
    'structure', (SELECT to_jsonb(s) FROM structures s WHERE s.id = _structure_id),
    'sites', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]') FROM sites x WHERE x.structure_id = _structure_id),
    'praticiens', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]') FROM sante_praticiens x WHERE x.structure_id = _structure_id),
    'actes', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]') FROM sante_actes x WHERE x.structure_id = _structure_id),
    'analyses', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]') FROM sante_analyses x WHERE x.structure_id = _structure_id),
    'patients', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'numero_dossier', p.numero_dossier, 'nom', p.nom, 'prenoms', p.prenoms, 'sexe', p.sexe,
                   'date_naissance', p.date_naissance, 'date_naissance_estimee', p.date_naissance_estimee, 'telephone', p.telephone, 'email', p.email, 'adresse', p.adresse,
                   'contact_urgence_nom', p.contact_urgence_nom, 'contact_urgence_tel', p.contact_urgence_tel, 'statut', p.statut, 'fusionne_dans', p.fusionne_dans, 'created_at', p.created_at)), '[]')
                 FROM sante_patients p WHERE p.structure_id = _structure_id),
    'factures', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]') FROM sante_factures x WHERE x.structure_id = _structure_id),
    'facture_lignes', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]') FROM sante_facture_lignes x WHERE x.structure_id = _structure_id),
    'encaissements', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]') FROM sante_encaissements x WHERE x.structure_id = _structure_id),
    'reactifs', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]') FROM sante_reactifs x WHERE x.structure_id = _structure_id),
    'lots_reactifs', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]') FROM sante_lots_reactifs x WHERE x.structure_id = _structure_id),
    'plannings', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]') FROM sante_plannings x WHERE x.structure_id = _structure_id),
    'retrocessions', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]') FROM sante_retrocessions x WHERE x.structure_id = _structure_id),
    'compta_evenements', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]') FROM sante_compta_evenements x WHERE x.structure_id = _structure_id));
  PERFORM public.sante_journaliser(_structure_id, 'info', 'export', 'Export de sauvegarde téléchargé',
    jsonb_build_object('par', auth.uid(), 'patients', jsonb_array_length(_r->'patients'), 'factures', jsonb_array_length(_r->'factures'), 'octets', length(_r::text)));
  INSERT INTO public.medical_audit_log(structure_id, user_id, action, table_name, record_id, new_data)
  VALUES (_structure_id, auth.uid(), 'EXPORT', 'structures', _structure_id, jsonb_build_object('format', 'g-sante-export-v1', 'patients', jsonb_array_length(_r->'patients')));
  RETURN _r;
END $function$;
