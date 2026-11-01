-- Export de sauvegarde v2 (lot 6 du plan, 31/10/2026).
-- La v1 (0054) ne couvrait que 15 rubriques : il manquait le tiers payant (organismes, conventions, bons,
-- assurances, règlements, rejets), la caisse (sessions, remboursements), le paramétrage du laboratoire
-- (paramètres, valeurs de référence, réactifs par analyse), les textes de consentement, les règles de
-- rétrocession et de garde, les membres et leurs rôles.
-- Périmètre inchangé : données administratives, paramétrage et finances ; le contenu clinique
-- (consultations, résultats, ordonnances, documents, signatures) reste hors export.
-- Mêmes droits que la v1 (administrateur + MFA), journalisé et audité. Une table absente est ignorée.
CREATE OR REPLACE FUNCTION public.sante_export_structure(_structure_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _r jsonb; _v jsonb; _t text; _compteurs jsonb := '{}';
  _tables text[] := ARRAY[
    'praticiens','actes','analyses','analyse_parametres','valeurs_reference','analyse_reactifs','catalogue_medicaments',
    'consentement_modeles','conservation_regles','comptes_parametres','personnel_parametres','retrocession_regles',
    'organismes','conventions','convention_exclusions','tarifs_convention',
    'reactifs','lots_reactifs','consommations_reactifs','dispensations',
    'plannings','retrocessions',
    'factures','facture_lignes','encaissements','remboursements','sessions_caisse','bons_pec',
    'reglements_organisme','reglement_imputations','tiers_rejets','relances','remises_cheques','remise_cheque_lignes',
    'compta_evenements','compta_liens','sequences','patient_sequences','journal_exploitation'];
BEGIN
  IF NOT coalesce(public.has_any_medical_role(_structure_id, ARRAY['admin_structure']), false) THEN
    RAISE EXCEPTION 'Accès refusé : l''export de sauvegarde est réservé à l''administrateur de la structure.';
  END IF;
  IF NOT coalesce(public.mfa_conforme(), false) THEN RAISE EXCEPTION 'MFA requise : validez la vérification en deux étapes.'; END IF;

  _r := jsonb_build_object(
    'format', 'g-sante-export-v2', 'genere_le', now(), 'genere_par', auth.uid(),
    'perimetre', 'Données administratives, paramétrage et finances. Le contenu clinique (consultations, résultats, ordonnances, documents, signatures) est couvert par les sauvegardes de la plateforme et par l''export tracé de chaque dossier patient.',
    'structure', (SELECT to_jsonb(s) FROM structures s WHERE s.id = _structure_id),
    'sites', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]') FROM sites x WHERE x.structure_id = _structure_id),
    'membres', (SELECT coalesce(jsonb_agg(jsonb_build_object('membership_id', m.id, 'user_id', m.user_id, 'site_id', m.site_id, 'statut', m.statut,
                  'roles', (SELECT coalesce(jsonb_agg(r.role ORDER BY r.role), '[]') FROM medical_user_roles r WHERE r.membership_id = m.id))), '[]')
                FROM structure_memberships m WHERE m.structure_id = _structure_id),
    'patients', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'numero_dossier', p.numero_dossier, 'nom', p.nom, 'prenoms', p.prenoms, 'sexe', p.sexe,
                   'date_naissance', p.date_naissance, 'date_naissance_estimee', p.date_naissance_estimee, 'telephone', p.telephone, 'email', p.email, 'adresse', p.adresse,
                   'contact_urgence_nom', p.contact_urgence_nom, 'contact_urgence_tel', p.contact_urgence_tel, 'statut', p.statut, 'fusionne_dans', p.fusionne_dans, 'created_at', p.created_at)), '[]')
                 FROM sante_patients p WHERE p.structure_id = _structure_id),
    'patient_assurances', (SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]') FROM sante_patient_assurances a JOIN sante_patients p ON p.id = a.patient_id WHERE p.structure_id = _structure_id));

  FOREACH _t IN ARRAY _tables LOOP
    IF to_regclass('public.sante_' || _t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) FROM public.%I x WHERE x.structure_id = $1', 'sante_' || _t)
      INTO _v USING _structure_id;
    _r := _r || jsonb_build_object(_t, _v);
  END LOOP;

  SELECT jsonb_object_agg(k, jsonb_array_length(v)) INTO _compteurs FROM jsonb_each(_r) AS e(k, v) WHERE jsonb_typeof(v) = 'array';
  _r := _r || jsonb_build_object('compteurs', _compteurs);

  PERFORM public.sante_journaliser(_structure_id, 'info', 'export', 'Export de sauvegarde téléchargé',
    jsonb_build_object('par', auth.uid(), 'format', 'v2', 'patients', jsonb_array_length(_r->'patients'), 'factures', jsonb_array_length(_r->'factures'), 'octets', length(_r::text)));
  INSERT INTO public.medical_audit_log(structure_id, user_id, action, table_name, record_id, new_data)
  VALUES (_structure_id, auth.uid(), 'EXPORT', 'structures', _structure_id, jsonb_build_object('format', 'g-sante-export-v2', 'patients', jsonb_array_length(_r->'patients')));
  RETURN _r;
END $function$;
