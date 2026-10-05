CREATE OR REPLACE FUNCTION public.sante_provisionner_creance(_structure_id uuid, _organisme text, _montant numeric, _motif text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid := gen_random_uuid(); _ent uuid; _exe uuid;
BEGIN
  IF NOT has_any_medical_role(_structure_id, ARRAY['admin_structure','comptable']) THEN RAISE EXCEPTION 'Réservé à l''administrateur ou au comptable'; END IF;
  IF _montant IS NULL OR _montant <= 0 OR coalesce(trim(_motif),'') = '' THEN RAISE EXCEPTION 'Montant et motif obligatoires'; END IF;
  PERFORM sante_comptabiliser(_structure_id, 'provision_creance', _id, 'OD', current_date, 'Provision créance douteuse ' || _organisme, NULL, jsonb_build_array(
    jsonb_build_object('compte', sante_compte(_structure_id,'dotation_provision'), 'intitule','Dotation provisions créances', 'debit', round(_montant)),
    jsonb_build_object('compte', sante_compte(_structure_id,'provision_creance'), 'intitule','Provision créances douteuses', 'credit', round(_montant),
      'compte_auxiliaire', sante_aux_organisme(_structure_id, _organisme), 'auxiliaire_libelle', _organisme)));
  SELECT entreprise_id INTO _ent FROM structures WHERE id = _structure_id;
  SELECT id INTO _exe FROM exercices WHERE entreprise_id = _ent AND statut='en_cours' AND current_date BETWEEN date_debut AND date_fin LIMIT 1;
  IF _exe IS NOT NULL THEN
    BEGIN
      INSERT INTO provisions(entreprise_id, exercice_id, code, libelle, nature, compte_provision, compte_dotation, montant_initial, montant_actuel, date_constitution, statut, notes)
      VALUES (_ent, _exe, 'SANTE-' || left(_id::text, 8), 'Créance douteuse ' || _organisme, 'creance', sante_compte(_structure_id,'provision_creance'), sante_compte(_structure_id,'dotation_provision'),
        round(_montant), round(_montant), current_date, 'active', trim(_motif));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN _id;
END $$;