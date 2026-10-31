-- Factures d'un organisme restant à régler, calculées en base (31/10/2026).
-- Avant : l'écran Règlements chargeait les 1 000 plus anciennes factures de l'organisme (soldées comprises) puis
-- envoyait leurs identifiants dans l'URL ; au-delà, les factures récentes impayées disparaissaient et l'URL
-- devenait trop longue. Fonction en droits de l'appelant (SECURITY INVOKER) : la sécurité de lignes existante
-- s'applique telle quelle. Reste = part organisme − imputations − rejets définitifs (perte, non prise en charge).
CREATE OR REPLACE FUNCTION public.sante_factures_ouvertes_organisme(_structure_id uuid, _organisme text)
 RETURNS TABLE(id uuid, numero text, part_organisme numeric, organisme text, statut_tiers text, created_at timestamptz, reste numeric)
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $function$
  SELECT f.id, f.numero, f.part_organisme, f.organisme, f.statut_tiers, f.created_at,
         f.part_organisme
           - coalesce((SELECT sum(i.montant) FROM sante_reglement_imputations i WHERE i.facture_id = f.id AND i.structure_id = _structure_id), 0)
           - coalesce((SELECT sum(r.montant) FROM sante_tiers_rejets r WHERE r.facture_id = f.id AND r.structure_id = _structure_id AND r.type IN ('perte','non_prise_en_charge')), 0) AS reste
  FROM sante_factures f
  WHERE f.structure_id = _structure_id AND f.organisme = _organisme AND f.type = 'facture' AND NOT f.annulee AND f.part_organisme > 0
    AND f.part_organisme
      - coalesce((SELECT sum(i.montant) FROM sante_reglement_imputations i WHERE i.facture_id = f.id AND i.structure_id = _structure_id), 0)
      - coalesce((SELECT sum(r.montant) FROM sante_tiers_rejets r WHERE r.facture_id = f.id AND r.structure_id = _structure_id AND r.type IN ('perte','non_prise_en_charge')), 0) > 0
  ORDER BY f.created_at, f.id
$function$;
REVOKE ALL ON FUNCTION public.sante_factures_ouvertes_organisme(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sante_factures_ouvertes_organisme(uuid, text) TO authenticated;
