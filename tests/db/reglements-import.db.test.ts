import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const url=process.env.SUPABASE_URL, service=process.env.SUPABASE_SERVICE_ROLE_KEY, key=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const run=randomBytes(7).toString('hex');
let c:SupabaseClient, admin:SupabaseClient, sid='', pid='', factures:{id:string;numero:string}[]=[];
const org=`IPM Import ${run}`;
const ligne=(id:string,ref='VIR-RECETTE',montant=3000)=>({date:new Date().toISOString().slice(0,10),reference:ref,organisme:org,facture_id:id,montant,mode:'virement',confirme:true});
describe.skipIf(!url||!service||!key)('Import validé des règlements — API réelle',()=>{
 beforeAll(async()=>{
  if(!url||!service||!key)throw new Error('Configuration absente');
  admin=createClient(url,service,{auth:{persistSession:false}});
  const email=`p0-import-reglements-${run}@gsante.test`,password=randomBytes(24).toString('base64url');
  const u=await admin.auth.admin.createUser({email,password,email_confirm:true});if(u.error||!u.data.user)throw new Error('Compte test absent');
  c=createClient(url,key,{auth:{persistSession:false}});const login=await c.auth.signInWithPassword({email,password});if(login.error)throw login.error;
  const st=await c.rpc('sante_creer_structure',{_type:'cabinet',_nom:`TEST import règlements ${run}`,_role_metier:'medecin'});if(st.error)throw st.error;sid=st.data;
  const p=await c.rpc('sante_creer_patient',{_structure_id:sid,_nom:'RECETTE',_prenoms:run,_sexe:'F'});if(p.error)throw p.error;pid=p.data;
  const o=await c.from('sante_organismes').insert({structure_id:sid,nom:org,type:'ipm'});if(o.error)throw o.error;
  const a=await admin.from('sante_patient_assurances').insert({patient_id:pid,organisme:org,taux_couverture:80}).select('id').single();if(a.error)throw a.error;
  for(const age of [0,30,31,60,61,90,91]){
   const f=await c.rpc('sante_creer_facture',{_patient_id:pid,_assurance_id:a.data.id,_lignes:[{libelle:'Prestation fictive',prix_unitaire:10000}]});if(f.error)throw f.error;
   const date=new Date();date.setUTCDate(date.getUTCDate()-age);
   const d=await admin.from('sante_factures').update({envoye_tiers_le:date.toISOString(),statut_tiers:'envoye'}).eq('id',f.data).select('id,numero').single();if(d.error)throw d.error;factures.push(d.data);
  }
  if(process.env.REGLEMENTS_BROWSER_FIXTURE){
   const session=(await c.auth.getSession()).data.session;
   if(!session)throw new Error('Session absente');
   writeFileSync(process.env.REGLEMENTS_BROWSER_FIXTURE,JSON.stringify({storage_key:`sb-${new URL(url).hostname.split('.')[0]}-auth-token`,session,structure:sid,nom:`TEST import règlements ${run}`,organisme:org,facture:factures[0].numero}));
  }
 },90000);
 it('répartit les âges 0/30,31/60,61/90,91 dans les quatre tranches demandées',async()=>{
  const r=await c.rpc('sante_creances_organismes',{_structure_id:sid});expect(r.error).toBeNull();expect(r.data?.[0]).toMatchObject({j0_30:16000,j31_60:16000,j61_90:16000,plus_90:8000,total:56000});
 });
 it('refuse une correspondance non confirmée et un montant fractionnaire',async()=>{
  expect((await c.rpc('sante_importer_reglements',{_structure_id:sid,_lignes:[{...ligne(factures[0].id),confirme:false}]})).error).toBeTruthy();
  expect((await c.rpc('sante_importer_reglements',{_structure_id:sid,_lignes:[ligne(factures[0].id,'FRACTION',0.5)]})).error).toBeTruthy();
 });
 it('importe 3 000 une fois et réutilise le même règlement au second appel',async()=>{
  const args={_structure_id:sid,_lignes:[ligne(factures[0].id)]};
  const a=await c.rpc('sante_importer_reglements',args),b=await c.rpc('sante_importer_reglements',args);
  expect(a.error).toBeNull();expect(b.error).toBeNull();expect(a.data).toMatchObject({ajoutes:1,existants:0});expect(b.data).toMatchObject({ajoutes:0,existants:1});
  const r=await c.rpc('sante_factures_rapprochables',{_structure_id:sid});expect(r.error).toBeNull();expect(r.data?.find((f:any)=>f.id===factures[0].id)?.reste).toBe(5000);
  const ev=await c.from('sante_compta_evenements').select('id').eq('source_type','reglement_organisme').eq('source_id',(a.data as any).ids[0]);expect(ev.error).toBeNull();expect(ev.data).toHaveLength(1);
 });
 it('refuse une référence réutilisée avec un montant différent',async()=>{
  expect((await c.rpc('sante_importer_reglements',{_structure_id:sid,_lignes:[ligne(factures[0].id,'VIR-RECETTE',4000)]})).error).toBeTruthy();
 });
 it('deux imports simultanés ne créent qu’un règlement',async()=>{
  const args={_structure_id:sid,_lignes:[ligne(factures[1].id,'CONCURRENT',2000)]};
  const rs=await Promise.all([c.rpc('sante_importer_reglements',args),c.rpc('sante_importer_reglements',args)]);
  expect(rs.every(r=>!r.error)).toBe(true);expect(rs.map(r=>(r.data as any).ajoutes).sort()).toEqual([0,1]);
 });
 it('annule tout le relevé si une ligne dépasse le reste dû',async()=>{
  const r=await c.rpc('sante_importer_reglements',{_structure_id:sid,_lignes:[ligne(factures[2].id,'ATOMIC-1',1000),ligne(factures[2].id,'ATOMIC-2',8000)]});expect(r.error).toBeTruthy();
  const check=await c.from('sante_reglements_organisme').select('id').eq('structure_id',sid).in('reference',['ATOMIC-1','ATOMIC-2']);expect(check.error).toBeNull();expect(check.data).toEqual([]);
 });
 it('refuse un organisme incompatible et un appel anonyme',async()=>{
  expect((await c.rpc('sante_importer_reglements',{_structure_id:sid,_lignes:[{...ligne(factures[0].id,'BAD-ORG'),organisme:'Autre'}]})).error).toBeTruthy();
  if(!url||!key)throw new Error('Configuration absente');const anon=createClient(url,key,{auth:{persistSession:false}});
  expect((await anon.rpc('sante_importer_reglements',{_structure_id:sid,_lignes:[ligne(factures[0].id)]})).error).toBeTruthy();
 });
});