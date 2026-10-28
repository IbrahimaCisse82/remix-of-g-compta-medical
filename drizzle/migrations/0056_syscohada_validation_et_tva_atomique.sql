CREATE OR REPLACE FUNCTION public.syscohada_equilibre_differe() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE eid uuid; e public.ecritures%ROWTYPE; d numeric;c numeric;n integer;
BEGIN
 eid:=CASE WHEN TG_TABLE_NAME='ecritures' THEN coalesce(NEW.id,OLD.id) ELSE coalesce(NEW.ecriture_id,OLD.ecriture_id) END;
 SELECT * INTO e FROM public.ecritures WHERE id=eid;
 IF NOT FOUND OR e.statut<>'validee' THEN RETURN NULL; END IF;
 SELECT count(*),coalesce(sum(debit),0),coalesce(sum(credit),0) INTO n,d,c FROM public.ecriture_lignes WHERE ecriture_id=eid;
 IF n<2 OR d<>c OR d<=0 OR d<>e.total_debit OR c<>e.total_credit THEN RAISE EXCEPTION 'Écriture validée incohérente ou déséquilibrée'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER syscohada_equilibre_header AFTER INSERT OR UPDATE ON public.ecritures DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.syscohada_equilibre_differe();
CREATE CONSTRAINT TRIGGER syscohada_equilibre_lignes AFTER INSERT OR UPDATE OR DELETE ON public.ecriture_lignes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.syscohada_equilibre_differe();
CREATE OR REPLACE FUNCTION public.sante_valider_tva(_declaration_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.declarations_tva%ROWTYPE; ex public.exercices%ROWTYPE; l jsonb:='[]'; b record; col numeric:=0;ded numeric:=0;prec numeric:=0;net numeric;eid uuid;
BEGIN
 SELECT * INTO d FROM public.declarations_tva WHERE id=_declaration_id FOR UPDATE;
 IF NOT FOUND OR NOT public.banque_peut_ecrire(d.entreprise_id) THEN RAISE EXCEPTION 'Accès comptable requis'; END IF;
 SELECT * INTO ex FROM public.exercices WHERE id=d.exercice_id FOR UPDATE;
 IF ex.entreprise_id IS DISTINCT FROM d.entreprise_id OR ex.statut='cloture' OR d.date_debut>d.date_fin OR d.date_debut<ex.date_debut OR d.date_fin>ex.date_fin THEN RAISE EXCEPTION 'Période TVA invalide'; END IF;
 IF d.statut='validee' OR EXISTS(SELECT 1 FROM public.declarations_tva WHERE entreprise_id=d.entreprise_id AND id<>d.id AND statut='validee' AND date_debut<=d.date_fin AND date_fin>=d.date_debut) THEN RAISE EXCEPTION 'Période TVA déjà validée'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tva_parametrage WHERE entreprise_id=d.entreprise_id AND actif) THEN RAISE EXCEPTION 'Comptes TVA non paramétrés'; END IF;
 IF EXISTS(SELECT 1 FROM public.tva_parametrage a JOIN public.tva_parametrage b ON b.entreprise_id=a.entreprise_id AND b.compte_tva_deductible=a.compte_tva_collectee WHERE a.entreprise_id=d.entreprise_id AND a.actif AND b.actif) THEN RAISE EXCEPTION 'Comptes TVA collectée et déductible confondus'; END IF;
 FOR b IN SELECT j.compte,sum(j.debit-j.credit) solde,
 EXISTS(SELECT 1 FROM public.tva_parametrage p WHERE p.entreprise_id=d.entreprise_id AND p.actif AND p.compte_tva_collectee=j.compte) collected
 FROM public.journal j WHERE j.entreprise_id=d.entreprise_id AND j.exercice_id=d.exercice_id AND j.date_ecriture BETWEEN d.date_debut AND d.date_fin AND j.journal_code<>'AN' AND j.statut_validation='valide'
 AND EXISTS(SELECT 1 FROM public.tva_parametrage p WHERE p.entreprise_id=d.entreprise_id AND p.actif AND j.compte IN(p.compte_tva_collectee,p.compte_tva_deductible)) GROUP BY j.compte LOOP
 IF b.collected THEN col:=col-b.solde; ELSE ded:=ded+b.solde; END IF;
 IF b.solde<>0 THEN l:=l||jsonb_build_array(jsonb_build_object('compte',b.compte,'intitule','Liquidation TVA','debit',greatest(-b.solde,0),'credit',greatest(b.solde,0))); END IF;
 END LOOP;
 IF col<0 OR ded<0 THEN RAISE EXCEPTION 'Solde TVA inversé : régularisation à examiner'; END IF;
 SELECT greatest(-tva_a_payer,0) INTO prec FROM public.declarations_tva WHERE entreprise_id=d.entreprise_id AND statut='validee' AND date_fin<d.date_debut ORDER BY date_fin DESC LIMIT 1;
 prec:=coalesce(prec,0);net:=col-ded-prec;
 IF prec>0 THEN l:=l||jsonb_build_array(jsonb_build_object('compte','4449','intitule','Crédit TVA antérieur','debit',0,'credit',prec)); END IF;
 IF net<>0 THEN l:=l||jsonb_build_array(jsonb_build_object('compte',CASE WHEN net>0 THEN '4441' ELSE '4449' END,'intitule','TVA nette','debit',greatest(-net,0),'credit',greatest(net,0))); END IF;
 IF jsonb_array_length(l)>0 THEN eid:=public.fn_creer_ecriture(d.entreprise_id,d.exercice_id,'OD',d.date_fin,'Liquidation TVA '||d.periode,l,'TVA-'||d.id::text,'validee','tva'); END IF;
 UPDATE public.declarations_tva SET statut='validee',tva_collectee=col,tva_deductible=ded,tva_nette=col-ded,credit_precedent=prec,tva_a_payer=net WHERE id=d.id;
 RETURN eid;
END $$;
CREATE OR REPLACE FUNCTION public.syscohada_garde_tva() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.statut='validee' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Déclaration TVA validée immuable'; END IF;
 IF TG_OP='INSERT' AND NEW.statut='validee' THEN RAISE EXCEPTION 'Validation TVA via fonction serveur requise'; END IF;
 IF TG_OP='UPDATE' AND NEW.statut='validee' AND OLD.statut IS DISTINCT FROM NEW.statut AND coalesce(current_setting('app.tva_validation',true),'')<>'1' THEN RAISE EXCEPTION 'Validation TVA via fonction serveur requise'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER syscohada_tva_garde BEFORE INSERT OR UPDATE ON public.declarations_tva FOR EACH ROW EXECUTE FUNCTION public.syscohada_garde_tva();
REVOKE ALL ON FUNCTION public.syscohada_equilibre_differe(),public.syscohada_garde_tva() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sante_valider_tva(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sante_valider_tva(uuid) TO authenticated,service_role;