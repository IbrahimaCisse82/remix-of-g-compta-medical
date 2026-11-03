-- 0108 — Diagnostic du 03/11 :
-- 1. Outbox santé : une facture ou un avoir de montant nul (acte gratuit) n'a pas d'écriture à produire ; il restait
--    « en erreur » (« au moins deux lignes »), était rejoué toutes les heures et bloquait la clôture. Il est désormais
--    marqué comptabilisé sans écriture, avec la mention « Montant nul ».
-- 2. Fonctions utilitaires de lecture (compte auxiliaire d'organisme, catégorie d'acte, compte de trésorerie, durée de
--    conservation) exécutables par un visiteur non connecté : droit retiré (elles ne servent qu'à l'intérieur des
--    fonctions serveur).
-- Retour : docs/rollback/0108_outbox_montant_nul_droits_down.sql

DO $$
DECLARE d text := pg_get_functiondef('public.sante_traiter_evenement'::regproc);
  ancre text := '    PERFORM set_config(''app.sante_compta'',''1'',true);';
BEGIN
  IF position('Montant nul' in d) > 0 THEN RETURN; END IF;
  IF position(ancre in d) = 0 THEN RAISE EXCEPTION 'sante_traiter_evenement : ancre introuvable'; END IF;
  d := replace(d, ancre,
    '    IF jsonb_array_length(_propres) = 0 THEN' || E'\n' ||
    '      UPDATE sante_compta_evenements SET statut=''comptabilise'', ecriture_id=NULL, tentatives=tentatives+1,' || E'\n' ||
    '        derniere_erreur=''Montant nul : aucune écriture comptable'', traite_le=now() WHERE id = _id;' || E'\n' ||
    '      RETURN ''sans_objet'';' || E'\n' ||
    '    END IF;' || E'\n' || ancre);
  EXECUTE d;
END $$;

REVOKE EXECUTE ON FUNCTION public.sante_aux_organisme(uuid, text), public.sante_categorie_code(uuid, text),
  public.sante_compte_tresorerie(uuid, text), public.sante_duree_conservation(uuid, text) FROM PUBLIC, anon, authenticated;

-- 3. Dispensation : la sortie de stock valorisée au CUMP (4 décimales) produisait un montant à centimes (ex. 1101,33),
--    rejeté par le contrôle SYSCOHADA (FCFA entiers) : l'événement restait en erreur. Arrondi au franc.
DO $$
DECLARE d text := pg_get_functiondef('public.sante_dispenser'::regproc);
  a text := '_montant := round(_q * coalesce(a.prix_achat_moyen, 0), 2);';
BEGIN
  IF position(a in d) = 0 THEN
    IF position('_montant := round(_q * coalesce(a.prix_achat_moyen, 0));' in d) > 0 THEN RETURN; END IF;
    RAISE EXCEPTION 'sante_dispenser : ancre introuvable';
  END IF;
  EXECUTE replace(d, a, '_montant := round(_q * coalesce(a.prix_achat_moyen, 0));');
END $$;
