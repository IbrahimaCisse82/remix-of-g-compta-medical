-- 0103 — Réceptions non facturées (FNP, 4081/4455) et réactifs du laboratoire alimentés par les réceptions.
-- Additive : deux colonnes nullables, trois fonctions, un déclencheur de contrôle ; fn_receptionner_commande complétée
-- (création du lot de réactif). Retour : docs/rollback/0103_fnp_reactifs_receptions_down.sql

ALTER TABLE public.commandes_achat_lignes ADD COLUMN IF NOT EXISTS reactif_id uuid REFERENCES public.sante_reactifs(id) ON DELETE RESTRICT;
ALTER TABLE public.receptions_achat_lignes ADD COLUMN IF NOT EXISTS lot_reactif_id uuid REFERENCES public.sante_lots_reactifs(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS commandes_achat_lignes_reactif_idx ON public.commandes_achat_lignes(reactif_id) WHERE reactif_id IS NOT NULL;

-- Le réactif doit appartenir à une structure de santé rattachée au dossier de la commande, et être actif.
CREATE OR REPLACE FUNCTION public.commandes_lignes_reactif_controle()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_ent uuid; v_ok boolean;
BEGIN
  IF NEW.reactif_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.nature = 'immobilisation' THEN RAISE EXCEPTION 'Un réactif ne peut pas être une immobilisation'; END IF;
  SELECT entreprise_id INTO v_ent FROM public.commandes_achat WHERE id = NEW.commande_id;
  SELECT r.actif INTO v_ok FROM public.sante_reactifs r JOIN public.structures s ON s.id = r.structure_id
   WHERE r.id = NEW.reactif_id AND s.entreprise_id = v_ent;
  IF v_ok IS NULL THEN RAISE EXCEPTION 'Réactif hors de ce dossier'; END IF;
  IF NOT v_ok THEN RAISE EXCEPTION 'Réactif désactivé'; END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS commandes_lignes_reactif_controle ON public.commandes_achat_lignes;
CREATE TRIGGER commandes_lignes_reactif_controle BEFORE INSERT OR UPDATE OF reactif_id, nature ON public.commandes_achat_lignes
  FOR EACH ROW EXECUTE FUNCTION public.commandes_lignes_reactif_controle();

-- Réception : une ligne liée à un réactif crée le lot (n° de lot et péremption obligatoires, lot non périmé à la réception).
DO $$
DECLARE d text := pg_get_functiondef('public.fn_receptionner_commande'::regproc);
  ancre text := '    IF cl.nature = ''stock'' THEN';
  ajout text := $a$    IF cl.reactif_id IS NOT NULL THEN
      IF nullif(trim(x->>'lot'), '') IS NULL OR nullif(x->>'peremption', '') IS NULL THEN
        RAISE EXCEPTION '« % » : n° de lot et péremption obligatoires pour un réactif', cl.designation;
      END IF;
      IF (x->>'peremption')::date <= _date THEN RAISE EXCEPTION '« % » : lot % déjà périmé', cl.designation, trim(x->>'lot'); END IF;
      INSERT INTO public.sante_lots_reactifs (structure_id, reactif_id, numero_lot, peremption, quantite_recue, quantite_restante, recu_par)
      SELECT r.structure_id, r.id, trim(x->>'lot'), (x->>'peremption')::date, v_q, v_q, auth.uid() FROM public.sante_reactifs r WHERE r.id = cl.reactif_id
      RETURNING id INTO v_lot;
      UPDATE public.receptions_achat_lignes SET lot_reactif_id = v_lot
        WHERE reception_id = v_rec AND commande_ligne_id = cl.id AND lot_reactif_id IS NULL;
      v_nb_reactifs := v_nb_reactifs + 1;
    END IF;
$a$;
BEGIN
  IF position('v_nb_reactifs' in d) > 0 THEN RETURN; END IF;
  IF position(ancre in d) = 0 THEN RAISE EXCEPTION 'fn_receptionner_commande : ancre introuvable'; END IF;
  d := replace(d, ancre, ajout || ancre);
  d := replace(d, 'v_nb_stock int := 0;', 'v_nb_stock int := 0; v_nb_reactifs int := 0; v_lot uuid;');
  d := replace(d, '''entrees_stock'', v_nb_stock,', '''entrees_stock'', v_nb_stock, ''lots_reactifs'', v_nb_reactifs,');
  EXECUTE d;
END $$;

-- Quantités reçues à la date de clôture et non couvertes par une facture comptabilisée datée au plus tard ce jour.
CREATE OR REPLACE FUNCTION public.fn_receptions_non_facturees(_exercice_id uuid)
 RETURNS TABLE(commande_ligne_id uuid, commande text, fournisseur text, designation text, nature text, compte text,
   quantite numeric, prix_unitaire numeric, montant_ht numeric, tva_deductible numeric, tva_non_deductible numeric, derniere_reception date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE x public.exercices%ROWTYPE; v_coef numeric;
BEGIN
  SELECT * INTO x FROM public.exercices WHERE id = _exercice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exercice introuvable'; END IF;
  IF x.entreprise_id NOT IN (SELECT public.get_user_entreprise_ids(auth.uid())) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  v_coef := least(greatest(coalesce(public.sante_coef_tva_deductible(x.entreprise_id), 1), 0), 1);
  RETURN QUERY
  WITH rec AS (
    SELECT rl.commande_ligne_id AS lid, sum(rl.quantite) AS q, max(r.date_reception) AS der
      FROM public.receptions_achat_lignes rl JOIN public.receptions_achat r ON r.id = rl.reception_id
     WHERE r.entreprise_id = x.entreprise_id AND r.date_reception <= x.date_fin GROUP BY rl.commande_ligne_id),
  fac AS (
    SELECT fl.commande_ligne_id AS lid, sum(fl.quantite) AS q
      FROM public.factures_achat_lignes fl JOIN public.factures_achat f ON f.id = fl.facture_id
     WHERE f.entreprise_id = x.entreprise_id AND f.comptabilisee AND f.statut <> 'annulee' AND f.date_facture <= x.date_fin
       AND fl.commande_ligne_id IS NOT NULL GROUP BY fl.commande_ligne_id),
  reste AS (
    SELECT cl.*, c.numero AS cmd, frn.raison_sociale AS frn, rec.q - coalesce(fac.q, 0) AS q, rec.der
      FROM rec JOIN public.commandes_achat_lignes cl ON cl.id = rec.lid
      JOIN public.commandes_achat c ON c.id = cl.commande_id
      JOIN public.fournisseurs frn ON frn.id = c.fournisseur_id
      LEFT JOIN fac ON fac.lid = rec.lid
     WHERE c.statut <> 'annulee' AND rec.q - coalesce(fac.q, 0) > 0)
  SELECT r.id, r.cmd, r.frn, r.designation, r.nature, r.compte_charge, r.q, r.prix_unitaire,
         round(r.q * r.prix_unitaire, 2),
         round(r.q * r.prix_unitaire * r.taux_tva / 100 * v_coef, 2),
         round(r.q * r.prix_unitaire * r.taux_tva / 100, 2) - round(r.q * r.prix_unitaire * r.taux_tva / 100 * v_coef, 2),
         r.der
    FROM reste r ORDER BY r.cmd, r.ordre;
END $function$;

-- Constatation au dernier jour de l'exercice (journal AC, pièce FNP-<année>) : débit des comptes de la commande
-- (HT + TVA non récupérable), débit 4455 (TVA récupérable sur factures non parvenues), crédit 4081.
-- L'extourne au premier jour de l'exercice suivant (pièce FNP-<année>-EXT) est passée dès que cet exercice existe.
CREATE OR REPLACE FUNCTION public.fn_extourner_fnp(_exercice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE x public.exercices%ROWTYPE; s public.exercices%ROWTYPE; e public.ecritures%ROWTYPE; v_lignes jsonb; v_ecr uuid;
BEGIN
  SELECT * INTO x FROM public.exercices WHERE id = _exercice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exercice introuvable'; END IF;
  IF NOT public.can_write_entreprise(x.entreprise_id) THEN RAISE EXCEPTION 'Droits insuffisants'; END IF;
  SELECT * INTO e FROM public.ecritures WHERE entreprise_id = x.entreprise_id AND exercice_id = x.id AND piece = 'FNP-' || x.annee
     AND origine = 'fnp' AND contrepasse_par IS NULL ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aucune constatation FNP-% à extourner', x.annee; END IF;
  SELECT * INTO s FROM public.exercices WHERE entreprise_id = x.entreprise_id AND date_debut = x.date_fin + 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('extourne', null, 'motif', 'Exercice suivant non créé'); END IF;
  IF EXISTS (SELECT 1 FROM public.ecritures WHERE entreprise_id = x.entreprise_id AND exercice_id = s.id AND piece = 'FNP-' || x.annee || '-EXT'
     AND contrepasse_par IS NULL AND origine = 'fnp') THEN
    RAISE EXCEPTION 'Extourne FNP-%-EXT déjà passée', x.annee;
  END IF;
  SELECT jsonb_agg(jsonb_build_object('compte', compte, 'intitule', intitule, 'libelle', 'Extourne ' || coalesce(libelle, ''),
           'debit', credit, 'credit', debit) ORDER BY ordre) INTO v_lignes FROM public.ecriture_lignes WHERE ecriture_id = e.id;
  v_ecr := public.fn_creer_ecriture(x.entreprise_id, s.id, 'AC', s.date_debut, 'Extourne factures non parvenues ' || x.annee,
    v_lignes, 'FNP-' || x.annee || '-EXT', 'validee', 'fnp');
  RETURN jsonb_build_object('extourne', v_ecr, 'date', s.date_debut);
END $function$;

CREATE OR REPLACE FUNCTION public.fn_constater_fnp(_exercice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE x public.exercices%ROWTYPE; v_lignes jsonb := '[]'::jsonb; v_ecr uuid; v_total numeric := 0; v_tva numeric := 0;
  r record; v_ext jsonb := null;
BEGIN
  SELECT * INTO x FROM public.exercices WHERE id = _exercice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exercice introuvable'; END IF;
  IF NOT public.can_write_entreprise(x.entreprise_id) THEN RAISE EXCEPTION 'Droits insuffisants'; END IF;
  IF EXISTS (SELECT 1 FROM public.ecritures WHERE entreprise_id = x.entreprise_id AND exercice_id = x.id AND piece = 'FNP-' || x.annee
     AND origine = 'fnp' AND contrepasse_par IS NULL) THEN
    RAISE EXCEPTION 'Factures non parvenues % déjà constatées : contre-passez la pièce FNP-% pour recalculer', x.annee, x.annee;
  END IF;
  FOR r IN SELECT compte, nature, sum(montant_ht + tva_non_deductible) AS m, sum(tva_deductible) AS t
             FROM public.fn_receptions_non_facturees(x.id) GROUP BY compte, nature ORDER BY compte LOOP
    IF r.m > 0 THEN
      v_lignes := v_lignes || jsonb_build_array(jsonb_build_object('compte', r.compte, 'intitule', 'Achats non facturés ' || r.compte,
        'libelle', 'Réceptions non facturées au ' || to_char(x.date_fin, 'DD/MM/YYYY'), 'debit', r.m, 'credit', 0));
    END IF;
    v_total := v_total + r.m + r.t; v_tva := v_tva + r.t;
  END LOOP;
  IF v_total = 0 THEN RETURN jsonb_build_object('ecriture', null, 'total', 0); END IF;
  IF v_tva > 0 THEN
    v_lignes := v_lignes || jsonb_build_array(jsonb_build_object('compte', '4455', 'intitule', 'TVA récupérable sur factures non parvenues',
      'libelle', 'TVA sur réceptions non facturées', 'debit', v_tva, 'credit', 0));
  END IF;
  v_lignes := v_lignes || jsonb_build_array(jsonb_build_object('compte', '4081', 'intitule', 'Fournisseurs, factures non parvenues',
    'libelle', 'Réceptions non facturées au ' || to_char(x.date_fin, 'DD/MM/YYYY'), 'debit', 0, 'credit', v_total));
  v_ecr := public.fn_creer_ecriture(x.entreprise_id, x.id, 'AC', x.date_fin, 'Factures non parvenues ' || x.annee,
    v_lignes, 'FNP-' || x.annee, 'validee', 'fnp');
  IF EXISTS (SELECT 1 FROM public.exercices WHERE entreprise_id = x.entreprise_id AND date_debut = x.date_fin + 1) THEN
    v_ext := public.fn_extourner_fnp(x.id);
  END IF;
  RETURN jsonb_build_object('ecriture', v_ecr, 'total', v_total, 'tva', v_tva, 'extourne', v_ext->'extourne');
END $function$;

REVOKE ALL ON FUNCTION public.fn_receptions_non_facturees(uuid), public.fn_constater_fnp(uuid), public.fn_extourner_fnp(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_receptions_non_facturees(uuid), public.fn_constater_fnp(uuid), public.fn_extourner_fnp(uuid) TO authenticated;
