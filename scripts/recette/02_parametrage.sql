-- Phase 3 (suite) : paramétrage des 3 structures par leurs administrateurs et biologistes. TEST uniquement.
-- Prérequis : recette.fichiers('catalogue') chargé depuis scripts/recette/generateurs/catalogue.json.
DO $g$ BEGIN
  IF (SELECT count(*) FROM auth.users WHERE email NOT LIKE '%@recette.test') > 0 THEN RAISE EXCEPTION 'Refus : base non TEST'; END IF;
END $g$;
CREATE TABLE IF NOT EXISTS recette.fichiers(nom text PRIMARY KEY, contenu jsonb NOT NULL);
CREATE OR REPLACE FUNCTION recette.sid(_c text) RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT structure_id FROM recette.structures WHERE cle = _c $f$;
CREATE OR REPLACE FUNCTION recette.uid(_c text) RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT user_id FROM recette.comptes WHERE cle = _c $f$;
GRANT EXECUTE ON FUNCTION recette.sid(text), recette.uid(text) TO authenticated;

-- Spécialités et mode CIM-10 (A : recommandé, C : strict, pour tester les deux).
SELECT recette.essai('3','Paramètres','A-admin','Spécialités du cabinet A','5 spécialités enregistrées','egal:5',
  $$SELECT public.sante_structure_specialites_definir(recette.sid('A'), ARRAY['medecine-generale','cardiologie','pediatrie','gynecologie-obstetrique','dermatologie'])::text$$, 'STR-02');
SELECT recette.essai('3','Paramètres','C-admin','Spécialités de la structure mixte C','3 spécialités enregistrées','egal:3',
  $$SELECT public.sante_structure_specialites_definir(recette.sid('C'), ARRAY['medecine-generale','pediatrie','dermatologie'])::text$$, 'STR-02');
SELECT recette.essai('3','Paramètres','C-admin','Mode CIM-10 strict pour C','Mode strict enregistré','ok',
  $$SELECT public.sante_cim10_mode_definir(recette.sid('C'), 'strict')::text$$, 'STR-08');
SELECT recette.essai('3','Paramètres','A-secr','Une secrétaire ne peut pas changer le mode CIM-10','Refus','refus',
  $$SELECT public.sante_cim10_mode_definir(recette.sid('A'), 'strict')::text$$, 'STR-08', 'critique');

-- Sites (A : deux sites).
SELECT recette.essai('3','Paramètres','A-admin','Création du site principal de A','Site créé','ok',
  $$SELECT public.create_medical_site(recette.sid('A'), 'Site Plateau (TEST)', 'Plateau, Dakar (TEST)', '+221 33 000 10 01', true)::text$$, 'STR-04');
SELECT recette.essai('3','Paramètres','A-admin','Création d''un second site pour A','Site créé','ok',
  $$SELECT public.create_medical_site(recette.sid('A'), 'Site Almadies (TEST)', 'Almadies, Dakar (TEST)', '+221 33 000 10 02', false)::text$$, 'STR-04');

-- Praticiens (n° d'ordre fictifs), reliés à leur compte.
DO $d$ DECLARE r record; BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('A','A-admin','A-med-1','medecine-generale','Médecine générale'),('A','A-admin','A-med-2','cardiologie','Cardiologie'),
    ('A','A-admin','A-med-3','gynecologie-obstetrique','Gynécologie'),('C','C-admin','C-med-1','pediatrie','Pédiatrie'),
    ('C','C-admin','C-med-2','dermatologie','Dermatologie'),('B','B-admin','B-bio-1',NULL,'Biologie médicale'),
    ('B','B-admin','B-bio-2',NULL,'Biologie médicale'),('C','C-admin','C-bio',NULL,'Biologie médicale')) v(s,a,m,sp,lib)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.sante_praticiens WHERE user_id = recette.uid(r.m) AND structure_id = recette.sid(r.s)) THEN
      PERFORM recette.essai('3','Paramètres',r.a,'Fiche praticien de ' || r.m,'Praticien créé avec n° d''ordre et spécialité','ok',
        format($$INSERT INTO public.sante_praticiens(structure_id, user_id, nom, specialite, specialite_id, numero_ordre, email)
                 SELECT %L, user_id, nom, %L, %L, 'ORD-TEST-' || %L, email FROM recette.comptes WHERE cle = %L RETURNING id::text$$,
               recette.sid(r.s), r.lib, r.sp, r.m, r.m), 'STR-07');
    END IF;
  END LOOP;
END $d$;

-- Paramètres fiscaux et de facturation (aucun taux légal inventé : structures exonérées de TVA, prorata 0).
SELECT recette.essai('3','Paramètres','A-admin','Régime fiscal de A','Enregistré','ok',$$SELECT public.sante_config_fiscal(recette.sid('A'),'exonere',0,false)::text$$,'STR-10');
SELECT recette.essai('3','Paramètres','B-admin','Régime fiscal de B, compte rendu conditionné au règlement','Enregistré','ok',$$SELECT public.sante_config_fiscal(recette.sid('B'),'exonere',0,true)::text$$,'STR-10');
SELECT recette.essai('3','Paramètres','C-admin','Régime fiscal de C','Enregistré','ok',$$SELECT public.sante_config_fiscal(recette.sid('C'),'exonere',0,false)::text$$,'STR-10');
SELECT recette.essai('3','Paramètres','B-admin','Facturation des analyses à l''enregistrement (B)','Enregistré','ok',$$SELECT public.sante_config_labo_moment(recette.sid('B'),'enregistrement')::text$$,'STR-10');
SELECT recette.essai('3','Paramètres','C-admin','Facturation des analyses à la validation (C)','Enregistré','ok',$$SELECT public.sante_config_labo_moment(recette.sid('C'),'validation')::text$$,'STR-10');
SELECT recette.essai('3','Paramètres','B-admin','Valeur de paramètre invalide refusée','Refus','refus',$$SELECT public.sante_config_labo_moment(recette.sid('B'),'jamais')::text$$,'STR-10','mineure');

-- Actes et tarifs (A et C).
DO $d$ DECLARE s text; r record; BEGIN
  FOREACH s IN ARRAY ARRAY['A','C'] LOOP
    FOR r IN SELECT * FROM (VALUES
      ('CS','Consultation de médecine générale','consultation',10000),('CSS','Consultation de spécialiste','consultation',20000),
      ('CSP','Consultation pédiatrique','consultation',12000),('CU','Consultation d''urgence','consultation',15000),('CTRL','Consultation de contrôle','consultation',5000),
      ('ECG','Électrocardiogramme','acte',15000),('ECHO','Échographie abdominale','acte',25000),('ECHOP','Échographie pelvienne','acte',25000),
      ('PANS','Pansement simple','acte',3000),('INJ','Injection IM/IV','acte',1500),('PERF','Pose de perfusion','acte',5000),('SUT','Suture simple','acte',10000),
      ('FROT','Frottis cervico-vaginal','acte',8000),('BIOP','Biopsie cutanée','acte',30000),('CRYO','Cryothérapie','acte',15000),
      ('VACC','Vaccination (acte)','acte',2000),('CERT','Certificat médical','autres',5000),('DOSS','Ouverture de dossier','autres',1000),
      ('MAPA','MAPA 24 h','acte',35000),('HOLT','Holter ECG 24 h','acte',40000),('KINE','Séance de kinésithérapie','acte',7000),
      ('NEBU','Nébulisation','acte',3000),('AERO','Aérosolthérapie','acte',3000),('PLATR','Pose de plâtre','acte',20000),('VD','Visite à domicile','consultation',25000)
    ) v(code, lib, cat, tarif) LOOP
      IF NOT EXISTS (SELECT 1 FROM public.sante_actes WHERE structure_id = recette.sid(s) AND code = r.code) THEN
        PERFORM recette.agir(s || '-admin');
        INSERT INTO public.sante_actes(structure_id, code, libelle, categorie, tarif, regime_tva, actif) VALUES (recette.sid(s), r.code, r.lib, r.cat, r.tarif, 'exonere', true);
        PERFORM recette.sortir();
      END IF;
    END LOOP;
  END LOOP;
  PERFORM recette.noter('3','Catalogue','A-admin / C-admin','Saisie de 25 actes et tarifs par structure (A et C)','Actes enregistrés','25 actes par structure',true,'STR-06');
END $d$;
SELECT recette.essai('3','Paramètres','A-admin','Acte de consultation par défaut (facturation automatique)','Enregistré','ok',$$SELECT public.sante_config_facturation(recette.sid('A'), true, 'CS')::text$$,'STR-10');
SELECT recette.essai('3','Paramètres','C-admin','Acte de consultation par défaut (C)','Enregistré','ok',$$SELECT public.sante_config_facturation(recette.sid('C'), true, 'CS')::text$$,'STR-10');
SELECT recette.essai('3','Catalogue','A-caisse','Un caissier ne crée pas d''acte','Refus','refus',
  $$INSERT INTO public.sante_actes(structure_id, code, libelle, categorie, tarif) VALUES (recette.sid('A'),'PIRATE','Acte pirate','acte',1) RETURNING id::text$$,'STR-06','critique');
SELECT recette.essai('3','Catalogue','A-admin','Tarif négatif refusé','Refus','refus',
  $$INSERT INTO public.sante_actes(structure_id, code, libelle, categorie, tarif) VALUES (recette.sid('A'),'NEG','Tarif négatif','acte',-100) RETURNING id::text$$,'STR-06','majeure');

-- Organismes (15 répartis sur les 3 structures) et conventions (20).
DO $d$ DECLARE r record; c record; BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('A','IPM TEST Industries','ipm'),('A','ASSURANCE TEST Santé Plus','assurance'),('A','MUTUELLE TEST Enseignants','mutuelle'),('A','ENTREPRISE TEST Transport','entreprise'),('A','IPM TEST Banques','ipm'),
    ('B','IPM TEST Industries','ipm'),('B','ASSURANCE TEST Santé Plus','assurance'),('B','ASSURANCE TEST Horizon','assurance'),('B','MUTUELLE TEST Commerce','mutuelle'),('B','ENTREPRISE TEST Mines','entreprise'),
    ('C','IPM TEST Industries','ipm'),('C','ASSURANCE TEST Horizon','assurance'),('C','IPM TEST Port','ipm'),('C','MUTUELLE TEST Santé Rurale','mutuelle'),('C','ASSURANCE TEST Atlantique','assurance')
  ) v(s, nom, type) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.sante_organismes WHERE structure_id = recette.sid(r.s) AND nom = r.nom) THEN
      PERFORM recette.essai('3','Tiers payant', r.s || '-admin', 'Création de l''organisme ' || r.nom, 'Organisme créé avec compte auxiliaire','ok',
        format($$INSERT INTO public.sante_organismes(structure_id, nom, type, actif) VALUES (%L, %L, %L, true) RETURNING coalesce(compte_auxiliaire, 'sans compte auxiliaire')$$, recette.sid(r.s), r.nom, r.type), 'TP-01');
    END IF;
  END LOOP;
  FOR c IN SELECT * FROM (VALUES
    ('A','IPM TEST Industries','consultation',80,NULL),('A','IPM TEST Industries','acte',80,NULL),('A','ASSURANCE TEST Santé Plus','consultation',70,500000),
    ('A','ASSURANCE TEST Santé Plus','acte',70,500000),('A','MUTUELLE TEST Enseignants','consultation',50,100000),('A','IPM TEST Banques','consultation',90,NULL),
    ('A','ENTREPRISE TEST Transport','consultation',100,NULL),
    ('B','IPM TEST Industries','analyses',80,NULL),('B','ASSURANCE TEST Santé Plus','analyses',70,300000),('B','ASSURANCE TEST Horizon','analyses',75,NULL),
    ('B','MUTUELLE TEST Commerce','analyses',50,50000),('B','ENTREPRISE TEST Mines','analyses',100,NULL),
    ('C','IPM TEST Industries','consultation',80,NULL),('C','IPM TEST Industries','analyses',80,NULL),('C','ASSURANCE TEST Horizon','consultation',75,NULL),
    ('C','ASSURANCE TEST Horizon','analyses',75,NULL),('C','IPM TEST Port','consultation',85,NULL),('C','IPM TEST Port','analyses',85,NULL),
    ('C','MUTUELLE TEST Santé Rurale','consultation',50,25000),('C','ASSURANCE TEST Atlantique','medicaments',60,NULL)
  ) v(s, org, cat, taux, plafond) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.sante_conventions WHERE structure_id = recette.sid(c.s) AND organisme = c.org AND categorie = c.cat) THEN
      PERFORM recette.essai('3','Tiers payant', c.s || '-admin', 'Convention ' || c.org || ' / ' || c.cat || ' (' || c.taux || ' %)', 'Convention créée','ok',
        format($$INSERT INTO public.sante_conventions(structure_id, organisme, categorie, taux, plafond, date_debut) VALUES (%L,%L,%L,%s,%s,'2025-01-01') RETURNING id::text$$,
               recette.sid(c.s), c.org, c.cat, c.taux, coalesce(c.plafond::text, 'NULL')), 'TP-02');
    END IF;
  END LOOP;
END $d$;
SELECT recette.essai('3','Tiers payant','A-admin','Taux de convention supérieur à 100 % refusé','Refus','refus',
  $$INSERT INTO public.sante_conventions(structure_id, organisme, categorie, taux) VALUES (recette.sid('A'),'IPM TEST Industries','autres',150) RETURNING id::text$$,'TP-02','majeure');

-- Catalogue d'analyses (B et C) : 1er paramètre par l'écran, autres paramètres et valeurs de référence par l'import tableur.
DO $d$ DECLARE s text; a jsonb; p jsonb; _lignes jsonb; _r jsonb; _n int := 0; BEGIN
  FOREACH s IN ARRAY ARRAY['B','C'] LOOP
    FOR a IN SELECT x FROM recette.fichiers f, jsonb_array_elements(f.contenu) x WHERE f.nom = 'catalogue' LOOP
      IF NOT EXISTS (SELECT 1 FROM public.sante_analyses WHERE structure_id = recette.sid(s) AND code = a->>'code') THEN
        PERFORM recette.agir(s || CASE s WHEN 'B' THEN '-bio-1' ELSE '-bio' END);
        PERFORM public.sante_catalogue_creer_analyse(recette.sid(s), a->>'code', a->>'libelle', a->>'section', (a->>'tarif')::numeric, (a->>'delai')::int,
                 a->>'tube', a->>'echantillon', a->'parametres'->0->>'libelle', a->'parametres'->0->>'unite', a->'parametres'->0->>'type');
        PERFORM recette.sortir();
        _n := _n + 1;
      END IF;
    END LOOP;
    -- Lignes d'import : chaque paramètre ; les valeurs numériques reçoivent une plage adulte (et une plage enfant fictive pour certains).
    SELECT jsonb_agg(l) INTO _lignes FROM (
      SELECT jsonb_build_object('code_analyse', an->>'code', 'code_parametre', CASE WHEN o = 1 THEN an->>'code' ELSE pa->>'code' END,
             'libelle_parametre', pa->>'libelle', 'unite', pa->>'unite', 'type', pa->>'type', 'sensible', CASE WHEN (an->>'sensible')::boolean THEN 'oui' ELSE 'non' END,
             'bas', pa->>'bas', 'haut', pa->>'haut', 'critique_bas', pa->>'critique_bas', 'critique_haut', pa->>'critique_haut', 'age_min_ans', '18', 'age_max_ans', '150') l
        FROM recette.fichiers f, jsonb_array_elements(f.contenu) an, jsonb_array_elements(an->'parametres') WITH ORDINALITY q(pa, o) WHERE f.nom = 'catalogue'
      UNION ALL
      SELECT jsonb_build_object('code_analyse', an->>'code', 'code_parametre', CASE WHEN o = 1 THEN an->>'code' ELSE pa->>'code' END, 'type', 'numerique',
             'bas', round((pa->>'bas')::numeric * 0.9, 2)::text, 'haut', round((pa->>'haut')::numeric * 1.1, 2)::text, 'age_min_ans', '0', 'age_max_ans', '17')
        FROM recette.fichiers f, jsonb_array_elements(f.contenu) an, jsonb_array_elements(an->'parametres') WITH ORDINALITY q(pa, o)
       WHERE f.nom = 'catalogue' AND pa->>'type' = 'numerique' AND (pa->>'haut')::numeric > 0 AND (pa->>'bas') IS NOT NULL) t;
    PERFORM recette.agir(s || CASE s WHEN 'B' THEN '-bio-1' ELSE '-bio' END);
    _r := public.sante_catalogue_importer_references(recette.sid(s), _lignes);
    PERFORM recette.sortir();
    PERFORM recette.noter('3','Catalogue', s || '-bio', 'Import des paramètres et valeurs de référence (' || jsonb_array_length(_lignes) || ' lignes)',
      'Import accepté, compteurs cohérents', _r::text, (_r->>'analyses')::int >= 100, 'LAB-02, LAB-03');
  END LOOP;
END $d$;
