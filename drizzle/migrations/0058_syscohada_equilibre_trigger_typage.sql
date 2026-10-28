CREATE OR REPLACE FUNCTION public.syscohada_equilibre_differe() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE eid uuid; e public.ecritures%ROWTYPE; d numeric;c numeric;n integer; row_data jsonb;
BEGIN
 row_data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 eid:=(row_data->>CASE WHEN TG_TABLE_NAME='ecritures' THEN 'id' ELSE 'ecriture_id' END)::uuid;
 SELECT * INTO e FROM public.ecritures WHERE id=eid;
 IF NOT FOUND OR e.statut<>'validee' THEN RETURN NULL; END IF;
 SELECT count(*),coalesce(sum(debit),0),coalesce(sum(credit),0) INTO n,d,c FROM public.ecriture_lignes WHERE ecriture_id=eid;
 IF n<2 OR d<>c OR d<=0 OR d<>e.total_debit OR c<>e.total_credit THEN RAISE EXCEPTION 'Écriture validée incohérente ou déséquilibrée'; END IF;
 RETURN NULL;
END $$;