CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Accès patient : codes et sessions (lu uniquement par le serveur)
CREATE TABLE public.sante_portail_patient (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.sante_patients(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('otp','lien','session')),
  secret_hash text NOT NULL,
  expire_le timestamptz NOT NULL,
  tentatives int NOT NULL DEFAULT 0,
  utilise boolean NOT NULL DEFAULT false,
  cree_par uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.sante_portail_patient(secret_hash);
CREATE INDEX ON public.sante_portail_patient(patient_id, created_at);
GRANT ALL ON public.sante_portail_patient TO service_role;
ALTER TABLE public.sante_portail_patient ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sante_portail_patient_essais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cle text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.sante_portail_patient_essais(cle, created_at);
GRANT ALL ON public.sante_portail_patient_essais TO service_role;
ALTER TABLE public.sante_portail_patient_essais ENABLE ROW LEVEL SECURITY;

-- Jeton interne pour la tâche planifiée
CREATE TABLE public.sante_cron_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  jeton text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32),'hex')
);
GRANT ALL ON public.sante_cron_config TO service_role;
ALTER TABLE public.sante_cron_config ENABLE ROW LEVEL SECURITY;
INSERT INTO public.sante_cron_config DEFAULT VALUES ON CONFLICT DO NOTHING;

-- Tableau de bord médico-économique
CREATE OR REPLACE FUNCTION public.sante_tableau_bord(_structure_id uuid, _debut date, _fin date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE d timestamptz := _debut; f timestamptz := _fin + 1; jours int := greatest(1, (_fin - _debut) + 1); r jsonb;
BEGIN
  IF NOT has_any_medical_role(_structure_id, ARRAY['admin_structure','comptable','biologiste','medecin']) THEN
    RAISE EXCEPTION 'Droit insuffisant'; END IF;
  SELECT jsonb_build_object(
    'praticiens', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'nom'),'[]') FROM (
      SELECT jsonb_build_object('nom', p.nom, 'specialite', p.specialite,
        'rdv', count(rv.id),
        'honores', count(rv.id) FILTER (WHERE rv.statut IN ('termine','en_cours','arrive')),
        'absents', count(rv.id) FILTER (WHERE rv.statut = 'absent'),
        'occupation', round(100.0 * coalesce(sum(rv.duree_min) FILTER (WHERE rv.statut <> 'annule'),0) / (jours * 480), 1),
        'attente_min', round(avg(extract(epoch FROM (c.created_at - rv.arrive_le))/60) FILTER (WHERE rv.arrive_le IS NOT NULL AND c.created_at > rv.arrive_le))::numeric
      ) x
      FROM sante_praticiens p
      LEFT JOIN sante_rendez_vous rv ON rv.praticien_id = p.id AND rv.debut >= d AND rv.debut < f
      LEFT JOIN sante_consultations c ON c.rdv_id = rv.id
      WHERE p.structure_id = _structure_id GROUP BY p.id) s),
    'attente_moyenne_min', (SELECT round(avg(extract(epoch FROM (c.created_at - rv.arrive_le))/60))
      FROM sante_rendez_vous rv JOIN sante_consultations c ON c.rdv_id = rv.id
      WHERE rv.structure_id = _structure_id AND rv.debut >= d AND rv.debut < f AND rv.arrive_le IS NOT NULL AND c.created_at > rv.arrive_le),
    'ca_actes', (SELECT coalesce(jsonb_agg(x ORDER BY (x->>'montant')::numeric DESC),'[]') FROM (
      SELECT jsonb_build_object('libelle', l.libelle, 'nombre', sum(l.quantite), 'montant', sum(CASE WHEN fa.type='avoir' THEN -abs(l.montant) ELSE l.montant END)) x
      FROM sante_facture_lignes l JOIN sante_factures fa ON fa.id = l.facture_id
      WHERE fa.structure_id = _structure_id AND fa.created_at >= d AND fa.created_at < f GROUP BY l.libelle LIMIT 30) s),
    'ca_specialites', (SELECT coalesce(jsonb_agg(x),'[]') FROM (
      SELECT jsonb_build_object('specialite', coalesce(CASE WHEN fa.demande_id IS NOT NULL THEN 'Laboratoire' END, p.specialite, 'Non précisée'), 'montant', sum(CASE WHEN fa.type='avoir' THEN -abs(fa.total) ELSE fa.total END)) x
      FROM sante_factures fa LEFT JOIN sante_consultations c ON c.id = fa.consultation_id LEFT JOIN sante_praticiens p ON p.id = c.praticien_id
      WHERE fa.structure_id = _structure_id AND fa.created_at >= d AND fa.created_at < f
      GROUP BY 1->>0 IS NULL, coalesce(CASE WHEN fa.demande_id IS NOT NULL THEN 'Laboratoire' END, p.specialite, 'Non précisée')) s),
    'labo', (SELECT jsonb_build_object(
        'demandes', count(*),
        'validees', count(*) FILTER (WHERE validee_le IS NOT NULL),
        'urgentes', count(*) FILTER (WHERE urgence),
        'tat_total_h', round((avg(extract(epoch FROM (validee_le - created_at))/3600) FILTER (WHERE validee_le IS NOT NULL))::numeric, 1),
        'tat_analytique_h', round((avg(extract(epoch FROM (validee_le - recue_le))/3600) FILTER (WHERE validee_le IS NOT NULL AND recue_le IS NOT NULL))::numeric, 1),
        'tat_urgent_h', round((avg(extract(epoch FROM (validee_le - created_at))/3600) FILTER (WHERE validee_le IS NOT NULL AND urgence))::numeric, 1))
      FROM sante_demandes_labo WHERE structure_id = _structure_id AND created_at >= d AND created_at < f),
    'techniciens', (SELECT coalesce(jsonb_agg(x ORDER BY (x->>'resultats')::int DESC),'[]') FROM (
      SELECT jsonb_build_object('nom', coalesce(pr.full_name, pr.email, 'Inconnu'), 'resultats', count(*), 'demandes', count(DISTINCT rs.demande_id)) x
      FROM sante_resultats rs LEFT JOIN profiles pr ON pr.id = rs.saisi_par
      WHERE rs.structure_id = _structure_id AND rs.saisi_le >= d AND rs.saisi_le < f GROUP BY pr.id, pr.full_name, pr.email) s),
    'tiers', (SELECT coalesce(jsonb_agg(x ORDER BY (x->>'creances')::numeric DESC),'[]') FROM (
      SELECT jsonb_build_object('organisme', fa.organisme,
        'factures', count(*),
        'montant', sum(fa.part_organisme),
        'paye', coalesce(sum(fa.part_organisme) FILTER (WHERE fa.statut_tiers='paye'),0),
        'creances', coalesce(sum(fa.part_organisme) FILTER (WHERE fa.statut_tiers IN ('a_facturer','envoye')),0),
        'rejets', count(*) FILTER (WHERE fa.statut_tiers='rejete'),
        'taux_rejet', round(100.0 * count(*) FILTER (WHERE fa.statut_tiers='rejete') / nullif(count(*) FILTER (WHERE fa.statut_tiers <> 'a_facturer'),0), 1),
        'delai_jours', round(avg(extract(epoch FROM (e.created_at - fa.created_at))/86400)::numeric, 1)) x
      FROM sante_factures fa
      LEFT JOIN LATERAL (SELECT min(created_at) created_at FROM sante_encaissements WHERE facture_id = fa.id AND mode = 'organisme') e ON true
      WHERE fa.structure_id = _structure_id AND fa.part_organisme > 0 AND NOT fa.annulee AND fa.created_at >= d AND fa.created_at < f
      GROUP BY fa.organisme) s)
  ) INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.sante_tableau_bord(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_tableau_bord(uuid,date,date) TO authenticated, service_role;