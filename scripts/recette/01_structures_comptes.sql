-- Phase 3 : comptes fictifs, 3 structures, équipes (invitation puis acceptation), praticiens, paramétrage. TEST uniquement.
DO $g$ BEGIN
  IF (SELECT count(*) FROM auth.users WHERE email NOT LIKE '%@recette.test') > 0 THEN RAISE EXCEPTION 'Refus : base non TEST'; END IF;
END $g$;

-- 1. Comptes (sans mot de passe utilisable). Les administrateurs et les opérateurs ont la double authentification.
SELECT recette.creer_compte(c, n, s, m) FROM (VALUES
  ('A-admin','Awa Diop (admin, TEST)','A',true), ('A-med-1','Dr Moussa Fall (MG, TEST)','A',false), ('A-med-2','Dr Aïssatou Ndiaye (cardio, TEST)','A',false),
  ('A-med-3','Dr Ibou Sarr (gynéco, TEST)','A',false), ('A-secr','Fatou Sow (secrétaire, TEST)','A',false), ('A-caisse','Modou Ba (caissier, TEST)','A',false),
  ('A-compta','Khady Gueye (comptable, TEST)','A',true), ('A-lecteur','Pape Diallo (lecteur, TEST)','A',false), ('A-tp','Ndeye Faye (tiers payant, TEST)','A',false),
  ('B-admin','Cheikh Mbaye (admin, TEST)','B',true), ('B-bio-1','Dr Mariama Kane (biologiste, TEST)','B',false), ('B-bio-2','Dr Ousmane Cissé (biologiste, TEST)','B',false),
  ('B-tech-1','Astou Diouf (technicienne, TEST)','B',false), ('B-tech-2','Babacar Ndour (technicien, TEST)','B',false), ('B-tech-3','Coumba Thiam (technicienne, TEST)','B',false),
  ('B-prel-1','Lamine Sy (préleveur, TEST)','B',false), ('B-prel-2','Rokhaya Seck (préleveuse, TEST)','B',false), ('B-secr','Adama Camara (secrétaire, TEST)','B',false),
  ('B-caisse','Mame Diarra Niang (caissière, TEST)','B',false), ('B-lecteur','Samba Ka (lecteur, TEST)','B',false), ('B-tp','Yacine Toure (tiers payant, TEST)','B',false),
  ('C-admin','Serigne Dieng (admin, TEST)','C',true), ('C-med-1','Dr Binta Gaye (pédiatre, TEST)','C',false), ('C-med-2','Dr Alioune Badiane (dermato, TEST)','C',false),
  ('C-bio','Dr Ramatoulaye Diagne (biologiste, TEST)','C',false), ('C-tech','Ibrahima Wade (technicien, TEST)','C',false), ('C-prel','Sokhna Mbengue (préleveuse, TEST)','C',false),
  ('C-secr','Aminata Lo (secrétaire, TEST)','C',false), ('C-caisse','Daouda Sene (caissier, TEST)','C',false), ('C-compta','Marème Kebe (comptable, TEST)','C',true),
  ('P-proprietaire','Propriétaire plateforme (TEST)',NULL,true), ('P-operateur','Opérateur GROW HUB (TEST)',NULL,true),
  ('X-externe','Compte sans structure (TEST)',NULL,false)
) v(c, n, s, m);
INSERT INTO public.plateforme_operateurs(user_id, role) SELECT user_id, 'proprietaire' FROM recette.comptes WHERE cle = 'P-proprietaire' ON CONFLICT DO NOTHING;
INSERT INTO public.plateforme_operateurs(user_id, role) SELECT user_id, 'operateur' FROM recette.comptes WHERE cle = 'P-operateur' ON CONFLICT DO NOTHING;

-- 2. Structures, créées par leur administrateur comme dans l'écran d'accueil (création + installation du plan comptable).
CREATE OR REPLACE FUNCTION recette.creer_structure(_cle text, _admin text, _type text, _nom text, _ninea text, _adresse text, _tel text)
RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE _sid uuid; _eid uuid; _n int;
BEGIN
  SELECT structure_id INTO _sid FROM recette.structures WHERE cle = _cle;
  IF _sid IS NOT NULL THEN RETURN _sid; END IF;
  PERFORM recette.agir(_admin);
  _sid := public.sante_creer_structure(_type::structure_type, _nom, 'admin_structure'::medical_role, _ninea, 'AUT-TEST-' || _cle, _adresse, _tel,
            CASE _type WHEN 'laboratoire' THEN 'laboratoire' ELSE 'clinique' END::medical_theme);
  SELECT entreprise_id INTO _eid FROM public.structures WHERE id = _sid;
  _n := public.plan_installer_reference(_eid);
  PERFORM recette.sortir();
  INSERT INTO recette.structures VALUES (_cle, _sid, _eid, _nom, _type);
  PERFORM recette.noter('3', 'Structure', _admin, 'Création de la structure ' || _nom || ' et installation du plan',
    'Structure créée, dossier comptable lié, plan installé', 'Structure ' || _sid || ', ' || _n || ' comptes installés', _n > 1000, 'STR-01, STR-03');
  RETURN _sid;
END $f$;
SELECT recette.creer_structure('A', 'A-admin', 'cabinet', 'CENTRE MÉDICAL TEST DAKAR', 'TEST-A-0001', 'Rue fictive 1, Plateau, Dakar (TEST)', '+221 33 000 00 01');
SELECT recette.creer_structure('B', 'B-admin', 'laboratoire', 'LABORATOIRE TEST BIO SANTÉ', 'TEST-B-0002', 'Avenue fictive 2, Médina, Dakar (TEST)', '+221 33 000 00 02');
SELECT recette.creer_structure('C', 'C-admin', 'mixte', 'POLYCLINIQUE TEST SÉNÉGAL', 'TEST-C-0003', 'Route fictive 3, Thiès (TEST)', '+221 33 000 00 03');

-- 3. Invitations (une par rôle) puis acceptation par l'invité ; rôles supplémentaires par l'écran Équipe.
CREATE OR REPLACE FUNCTION recette.inviter(_s text, _admin text, _membre text, _role text) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE _sid uuid := (SELECT structure_id FROM recette.structures WHERE cle = _s); _inv uuid; _email text := (SELECT email FROM recette.comptes WHERE cle = _membre);
BEGIN
  IF EXISTS (SELECT 1 FROM public.structure_memberships m JOIN recette.comptes c ON c.user_id = m.user_id WHERE c.cle = _membre AND m.structure_id = _sid) THEN RETURN; END IF;
  PERFORM recette.agir(_admin);
  _inv := public.create_medical_invitation(_sid, _email, _role::medical_role, NULL);
  PERFORM recette.sortir();
  PERFORM recette.agir(_membre, 'aal1');
  PERFORM public.accept_medical_invitation(_inv);
  PERFORM recette.sortir();
  PERFORM recette.noter('3', 'Équipe', _membre, 'Invitation (' || _role || ') puis acceptation', 'Membre actif avec le rôle', 'Invitation ' || _inv || ' acceptée', true, 'STR-05');
END $f$;
DO $d$ DECLARE r record; BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('A','A-admin','A-med-1','medecin'),('A','A-admin','A-med-2','medecin'),('A','A-admin','A-med-3','medecin'),('A','A-admin','A-secr','secretaire'),
    ('A','A-admin','A-caisse','caissier'),('A','A-admin','A-compta','comptable'),('A','A-admin','A-lecteur','lecteur'),('A','A-admin','A-tp','tiers_payant'),
    ('B','B-admin','B-bio-1','biologiste'),('B','B-admin','B-bio-2','biologiste'),('B','B-admin','B-tech-1','technicien'),('B','B-admin','B-tech-2','technicien'),
    ('B','B-admin','B-tech-3','technicien'),('B','B-admin','B-prel-1','preleveur'),('B','B-admin','B-prel-2','preleveur'),('B','B-admin','B-secr','secretaire'),
    ('B','B-admin','B-caisse','caissier'),('B','B-admin','B-lecteur','lecteur'),('B','B-admin','B-tp','tiers_payant'),
    ('C','C-admin','C-med-1','medecin'),('C','C-admin','C-med-2','medecin'),('C','C-admin','C-bio','biologiste'),('C','C-admin','C-tech','technicien'),
    ('C','C-admin','C-prel','preleveur'),('C','C-admin','C-secr','secretaire'),('C','C-admin','C-caisse','caissier'),('C','C-admin','C-compta','comptable')
  ) v(s, a, m, r) LOOP
    BEGIN PERFORM recette.inviter(r.s, r.a, r.m, r.r);
    EXCEPTION WHEN OTHERS THEN PERFORM recette.noter('3', 'Équipe', r.m, 'Invitation (' || r.r || ') puis acceptation', 'Membre actif avec le rôle', 'Erreur : ' || SQLERRM, false, 'STR-05', NULL, 'majeure');
    END;
  END LOOP;
END $d$;
UPDATE recette.comptes c SET roles = (SELECT array_agg(r.role::text ORDER BY r.role) FROM public.structure_memberships m JOIN public.medical_user_roles r ON r.membership_id = m.id WHERE m.user_id = c.user_id)
 WHERE structure IS NOT NULL;
