import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
const url=process.env.SUPABASE_URL,service=process.env.SUPABASE_SERVICE_ROLE_KEY,key=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
let c:SupabaseClient,admin:SupabaseClient,sid='',rid='',param='',demande='',ctrl='';
const run=randomBytes(8).toString('hex');
describe.skipIf(!url||!service||!key)('Livraison qualité et réactifs',()=>{
 beforeAll(async()=>{
  if(!url||!service||!key)throw new Error('Configuration absente');
  admin=createClient(url,service);const email=`p0-qualite-${run}@gsante.test`,password=randomBytes(24).toString('base64url');
  const u=await admin.auth.admin.createUser({email,password,email_confirm:true});if(u.error)throw u.error;
  c=createClient(url,key,{auth:{persistSession:false}});const login=await c.auth.signInWithPassword({email,password});if(login.error)throw login.error;
  const s=await c.rpc('sante_creer_structure',{_type:'laboratoire',_nom:`TEST qualité ${run}`,_role_metier:'biologiste'});if(s.error)throw s.error;sid=s.data;
  const r=await c.from('sante_reactifs').insert({structure_id:sid,nom:'Réactif fictif',unite:'mL',seuil_alerte:2}).select('id').single();if(r.error)throw r.error;rid=r.data.id;
  const a=await c.rpc('sante_catalogue_creer_analyse',{_structure_id:sid,_code:'CQ',_libelle:'Analyse fictive CQ',_section:'biochimie',_tarif:0,_delai:24,_tube:'',_echantillon:'',_parametre:'CQ fictif',_unite:'',_type:'numerique'});if(a.error)throw a.error;
  const p=await c.from('sante_analyse_parametres').select('id').eq('analyse_id',a.data).single();if(p.error)throw p.error;param=p.data.id;
  const rule=await c.from('sante_analyse_parametres').update({cq_absent:'bloquer'}).eq('id',param);if(rule.error)throw rule.error;
  const pat=await c.rpc('sante_creer_patient',{_structure_id:sid,_nom:'RECETTE',_prenoms:run,_sexe:'F'});if(pat.error)throw pat.error;
  const d=await c.rpc('sante_creer_demande_labo',{_patient_id:pat.data,_analyses:[a.data]});if(d.error)throw d.error;demande=d.data;
 });
 it('consommations concurrentes ne rendent jamais le stock négatif',async()=>{
  expect((await c.rpc('sante_mouvement_reactif',{_reactif_id:rid,_type:'reception',_quantite:10,_numero_lot:'CONCURRENT',_peremption:'2027-12-31'})).error).toBeNull();
  const lot=await c.from('sante_lots_reactifs').select('id').eq('reactif_id',rid).eq('numero_lot','CONCURRENT').single();expect(lot.error).toBeNull();
  const args={_reactif_id:rid,_type:'consommation',_quantite:7,_lot_id:lot.data?.id};
  const results=await Promise.all([c.rpc('sante_mouvement_reactif',args),c.rpc('sante_mouvement_reactif',args)]);
  expect(results.filter(r=>!r.error)).toHaveLength(1);expect(results.filter(r=>r.error)).toHaveLength(1);
  const stock=await c.from('sante_lots_reactifs').select('quantite_restante').eq('id',lot.data?.id).single();expect(stock.data?.quantite_restante).toBe(3);
 });
 it('lot périmé et quantités nulles ou négatives sont refusés',async()=>{
  expect((await c.rpc('sante_mouvement_reactif',{_reactif_id:rid,_type:'reception',_quantite:5,_numero_lot:'EXPIRE',_peremption:'2020-01-01'})).error).toBeNull();
  const l=await c.from('sante_lots_reactifs').select('id').eq('reactif_id',rid).eq('numero_lot','EXPIRE').single();
  expect((await c.rpc('sante_mouvement_reactif',{_reactif_id:rid,_type:'consommation',_quantite:1,_lot_id:l.data?.id})).error).toBeTruthy();
  for(const q of [0,-1])expect((await c.rpc('sante_mouvement_reactif',{_reactif_id:rid,_type:'reception',_quantite:q,_numero_lot:'INVALID',_peremption:'2027-01-01'})).error).toBeTruthy();
 });
 it('absence de CQ configurée bloquante puis rejet et retour accepté sont appliqués',async()=>{
  expect((await c.rpc('sante_cq_bloquant',{_demande_id:demande})).data).toBe(true);
  const r=await c.from('sante_controles_qualite').insert({structure_id:sid,parametre_id:param,lot:'CQTEST',niveau:'normal',cible:10,ecart_type:1}).select('id').single();expect(r.error).toBeNull();ctrl=r.data?.id||'';
  expect((await c.rpc('sante_saisir_cq',{_controle_id:ctrl,_valeur:14})).data).toBe('rejete');
  expect((await c.rpc('sante_cq_bloquant',{_demande_id:demande})).data).toBe(true);
  expect((await c.rpc('sante_saisir_cq',{_controle_id:ctrl,_valeur:10})).data).toBe('accepte');
  expect((await c.rpc('sante_cq_bloquant',{_demande_id:demande})).data).toBe(false);
 });
 it('une évaluation externe hors seuil ouvre une non-conformité qui exige une action pour clôturer',async()=>{
  const r=await c.rpc('sante_saisir_eeq',{_structure_id:sid,_organisme:'TEST',_campagne:'Recette',_analyse:'Fictive',_date:null,_obtenue:14,_cible:10,_ecart:1});expect(r.error).toBeNull();
  const eeq=await c.from('sante_eeq').select('zscore,non_conformite_id').eq('id',r.data).single();expect(eeq.data?.zscore).toBe(4);expect(eeq.data?.non_conformite_id).toBeTruthy();
  const id=eeq.data?.non_conformite_id;
  expect((await c.rpc('sante_traiter_non_conformite',{_id:id,_action:'',_cloturer:true})).error).toBeTruthy();
  expect((await c.rpc('sante_traiter_non_conformite',{_id:id,_action:'Action corrective fictive vérifiée',_cloturer:true})).error).toBeNull();
  const nc=await c.from('sante_non_conformites').select('statut,cloture_le').eq('id',id).single();expect(nc.data?.statut).toBe('cloturee');expect(nc.data?.cloture_le).toBeTruthy();
 });
});