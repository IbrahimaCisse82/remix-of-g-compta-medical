-- 0122 — Spécialités médicales et CIM-10 : chaque structure déclare ses spécialités, chaque praticien la sienne ;
-- la recherche CIM-10 propose d'abord les codes de la spécialité du praticien de la consultation.
-- * sante_specialites : référentiel des spécialités et des plages de codes CIM-10 correspondantes (chapitres et blocs
--   de la classification de l'OMS). Une spécialité sans plage (médecine générale, pédiatrie, urgences) couvre tout.
--   Les symptômes (R00-R99) et motifs de recours (Z00-Z99) sont proposés à toutes les spécialités.
-- * sante_structure_specialites : spécialités choisies pour la structure (à la création ou dans Structure & équipe).
-- * sante_praticiens.specialite_id : spécialité du praticien (colonne ajoutée, l'ancienne colonne texte est conservée).
-- * sante_cim10_specialite : recherche classée (spécialité d'abord) ; « toutes » élargit à toute la CIM-10.
-- Retour : docs/rollback/0122_specialites_cim10_down.sql

CREATE TABLE IF NOT EXISTS public.sante_specialites (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{2,40}$'),
  libelle text NOT NULL,
  plages text[] NOT NULL DEFAULT '{}',
  ordre int NOT NULL DEFAULT 100
);
ALTER TABLE public.sante_specialites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sante_specialites FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sante_specialites TO authenticated;
DROP POLICY IF EXISTS "Lecture spécialités" ON public.sante_specialites;
CREATE POLICY "Lecture spécialités" ON public.sante_specialites FOR SELECT TO authenticated USING (true);

INSERT INTO public.sante_specialites(id, libelle, plages, ordre) VALUES
  ('medecine-generale', 'Médecine générale', '{}', 1),
  ('pediatrie', 'Pédiatrie et néonatologie', '{}', 2),
  ('urgences', 'Urgences', '{}', 3),
  ('gynecologie-obstetrique', 'Gynécologie et obstétrique', '{O00-O99,N70-N98,Z30-Z39,C50-C58,D06-D07,D24-D28,A50-A64}', 4),
  ('cardiologie', 'Cardiologie', '{I00-I99,Q20-Q28,E78-E78}', 5),
  ('pneumologie', 'Pneumologie', '{J00-J99,A15-A19,C33-C39,D38-D38}', 6),
  ('endocrinologie', 'Endocrinologie, diabétologie, nutrition', '{E00-E90,C73-C75,D34-D35}', 7),
  ('gastro-enterologie', 'Gastro-entérologie et hépatologie', '{K00-K93,B15-B19,C15-C26,D12-D13,B65-B83}', 8),
  ('infectiologie', 'Infectiologie et maladies tropicales', '{A00-B99,U07-U10,J09-J18}', 9),
  ('neurologie', 'Neurologie', '{G00-G99,I60-I69,C70-C72}', 10),
  ('psychiatrie', 'Psychiatrie', '{F00-F99,X60-X84}', 11),
  ('dermatologie', 'Dermatologie', '{L00-L99,B00-B09,B35-B49,B85-B89,C43-C44,A30-A30}', 12),
  ('rhumatologie', 'Rhumatologie', '{M00-M99}', 13),
  ('traumatologie-orthopedie', 'Traumatologie et orthopédie', '{S00-T98,M00-M25,M40-M54,M60-M79,Q65-Q79}', 14),
  ('nephrologie-urologie', 'Néphrologie et urologie', '{N00-N51,C60-C68,D29-D30,B65-B65}', 15),
  ('hematologie', 'Hématologie', '{D50-D89,C81-C96}', 16),
  ('oncologie', 'Oncologie', '{C00-D48}', 17),
  ('ophtalmologie', 'Ophtalmologie', '{H00-H59,C69-C69}', 18),
  ('orl', 'ORL', '{H60-H95,J00-J06,J30-J39,C30-C32}', 19),
  ('stomatologie', 'Stomatologie et chirurgie dentaire', '{K00-K14,C00-C14,S02-S02}', 20),
  ('chirurgie-generale', 'Chirurgie générale et viscérale', '{K20-K93,K35-K46,S30-S39,T79-T88}', 21)
ON CONFLICT (id) DO UPDATE SET libelle = EXCLUDED.libelle, plages = EXCLUDED.plages, ordre = EXCLUDED.ordre;

CREATE TABLE IF NOT EXISTS public.sante_structure_specialites (
  structure_id uuid NOT NULL REFERENCES public.structures(id) ON DELETE CASCADE,
  specialite_id text NOT NULL REFERENCES public.sante_specialites(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (structure_id, specialite_id)
);
ALTER TABLE public.sante_structure_specialites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sante_structure_specialites FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sante_structure_specialites TO authenticated;
DROP POLICY IF EXISTS "Lecture spécialités de la structure" ON public.sante_structure_specialites;
CREATE POLICY "Lecture spécialités de la structure" ON public.sante_structure_specialites FOR SELECT TO authenticated
  USING (public.has_any_medical_role(structure_id, ARRAY['admin_structure', 'medecin', 'biologiste', 'technicien', 'preleveur', 'secretaire', 'caissier', 'comptable', 'lecteur']));

ALTER TABLE public.sante_praticiens ADD COLUMN IF NOT EXISTS specialite_id text REFERENCES public.sante_specialites(id);

-- Un code appartient-il à l'une des plages (« I00-I99 ») ? Comparaison sur les 3 premiers caractères.
CREATE OR REPLACE FUNCTION public.sante_cim10_dans_plages(_code text, _plages text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM unnest(_plages) p WHERE left(_code, 3) BETWEEN split_part(p, '-', 1) AND split_part(p, '-', 2))
$$;

CREATE OR REPLACE FUNCTION public.sante_structure_specialites_definir(_structure_id uuid, _specialites text[])
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  IF NOT public.mfa_conforme() THEN RAISE EXCEPTION 'MFA requise'; END IF;
  IF NOT public.has_any_medical_role(_structure_id, ARRAY['admin_structure']) THEN
    RAISE EXCEPTION 'Seul l''administrateur de la structure choisit ses spécialités' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(_specialites, '{}')) s WHERE s NOT IN (SELECT id FROM public.sante_specialites)) THEN
    RAISE EXCEPTION 'Spécialité inconnue';
  END IF;
  DELETE FROM public.sante_structure_specialites WHERE structure_id = _structure_id AND specialite_id <> ALL (coalesce(_specialites, '{}'));
  INSERT INTO public.sante_structure_specialites(structure_id, specialite_id)
    SELECT _structure_id, s FROM unnest(coalesce(_specialites, '{}')) s ON CONFLICT DO NOTHING;
  SELECT count(*) INTO _n FROM public.sante_structure_specialites WHERE structure_id = _structure_id;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.sante_structure_specialites_definir(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_structure_specialites_definir(uuid, text[]) TO authenticated;

-- Recherche pour une consultation : spécialité du praticien, sinon celles de la structure, sinon toute la CIM-10.
-- Les codes de la spécialité (et symptômes / motifs de recours) viennent d'abord ; « _toutes » ajoute le reste.
CREATE OR REPLACE FUNCTION public.sante_cim10_specialite(_consultation_id uuid, _q text, _toutes boolean DEFAULT false, _limite int DEFAULT 20)
RETURNS TABLE(code text, libelle text, chapitre text, dans_specialite boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.sante_consultations; _plages text[]; _tout boolean := false;
  _t text := public.sante_texte_recherche(btrim(coalesce(_q, ''))); _mots text[]; _c text := public.sante_cim10_code(_q);
BEGIN
  SELECT * INTO c FROM public.sante_consultations WHERE id = _consultation_id;
  IF c.id IS NULL OR NOT public.sante_medecin_du_dossier(c.structure_id, c.patient_id) THEN
    RAISE EXCEPTION 'Consultation introuvable' USING ERRCODE = '42501';
  END IF;
  IF length(_t) < 2 THEN RETURN; END IF;
  _mots := regexp_split_to_array(_t, '\s+');
  -- Spécialités retenues : celle du praticien, à défaut celles de la structure.
  SELECT array_agg(s.id) INTO _plages FROM public.sante_specialites s
   WHERE s.id = (SELECT specialite_id FROM public.sante_praticiens WHERE id = c.praticien_id);
  IF _plages IS NULL THEN
    SELECT array_agg(specialite_id) INTO _plages FROM public.sante_structure_specialites WHERE structure_id = c.structure_id;
  END IF;
  IF _plages IS NULL OR EXISTS (SELECT 1 FROM public.sante_specialites WHERE id = ANY(_plages) AND plages = '{}') THEN
    _tout := true;
  ELSE
    SELECT array_agg(DISTINCT p) || ARRAY['R00-R99', 'Z00-Z99'] INTO _plages
      FROM public.sante_specialites s, unnest(s.plages) p WHERE s.id = ANY(_plages);
  END IF;
  RETURN QUERY
    SELECT k.code, k.libelle, k.chapitre, (_tout OR public.sante_cim10_dans_plages(k.code, _plages)) AS dans
    FROM public.sante_cim10 k
    WHERE k.actif AND (k.code LIKE _c || '%' OR NOT EXISTS (SELECT 1 FROM unnest(_mots) m WHERE position(m IN k.recherche) = 0))
      AND (_tout OR _toutes OR public.sante_cim10_dans_plages(k.code, _plages))
    ORDER BY (k.code = _c) DESC, (_tout OR public.sante_cim10_dans_plages(k.code, _plages)) DESC, (k.code LIKE _c || '%') DESC, length(k.code), k.code
    LIMIT greatest(least(coalesce(_limite, 20), 50), 1);
END $$;
REVOKE ALL ON FUNCTION public.sante_cim10_specialite(uuid, text, boolean, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_cim10_specialite(uuid, text, boolean, int) TO authenticated;

-- Nombre de codes couverts par les spécialités de la structure (affiché à l'administrateur).
CREATE OR REPLACE FUNCTION public.sante_cim10_couverture(_structure_id uuid)
RETURNS TABLE(specialite_id text, libelle text, codes bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.libelle,
    (SELECT count(*) FROM public.sante_cim10 k WHERE k.actif AND (s.plages = '{}' OR public.sante_cim10_dans_plages(k.code, s.plages)))
  FROM public.sante_structure_specialites ss JOIN public.sante_specialites s ON s.id = ss.specialite_id
  WHERE ss.structure_id = _structure_id AND public.has_any_medical_role(_structure_id, ARRAY['admin_structure', 'medecin'])
  ORDER BY s.ordre
$$;
REVOKE ALL ON FUNCTION public.sante_cim10_couverture(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_cim10_couverture(uuid) TO authenticated;
