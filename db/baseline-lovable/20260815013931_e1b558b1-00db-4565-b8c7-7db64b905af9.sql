CREATE OR REPLACE FUNCTION public.fn_generer_alertes_echeances()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n integer := 0;
BEGIN
  WITH cible AS (
    SELECT e.id, e.entreprise_id, e.libelle, e.date_limite, e.montant_du,
           CASE WHEN e.date_limite < CURRENT_DATE THEN 'echeance_retard' ELSE 'echeance_proche' END AS type_notif
    FROM public.echeances_fiscales e
    WHERE e.statut NOT IN ('paye', 'declare_paye', 'annule')
      AND e.date_limite <= CURRENT_DATE + 7
  ), ins AS (
    INSERT INTO public.notifications (entreprise_id, user_id, type, titre, message, lien, meta)
    SELECT c.entreprise_id, NULL, c.type_notif,
           CASE WHEN c.type_notif = 'echeance_retard' THEN 'Échéance en retard : ' || c.libelle
                ELSE 'Échéance dans moins de 7 jours : ' || c.libelle END,
           'Date limite : ' || to_char(c.date_limite, 'DD/MM/YYYY')
             || COALESCE(' — Montant dû : ' || to_char(c.montant_du, 'FM999999999D00') || ' FCFA', ''),
           '/echeancier',
           jsonb_build_object('echeance_id', c.id, 'date_limite', c.date_limite)
    FROM cible c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.entreprise_id = c.entreprise_id
        AND n.type = c.type_notif
        AND n.meta->>'echeance_id' = c.id::text
        AND n.created_at > now() - interval '7 days'
    )
    RETURNING 1
  )
  SELECT count(*) INTO _n FROM ins;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_generer_alertes_echeances() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_generer_alertes_echeances() TO authenticated, service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('alertes-echeances-quotidiennes');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

SELECT cron.schedule('alertes-echeances-quotidiennes', '0 6 * * *', $$SELECT public.fn_generer_alertes_echeances();$$);