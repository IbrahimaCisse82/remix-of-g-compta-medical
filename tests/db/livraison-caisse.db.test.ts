import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
const url=process.env.SUPABASE_URL,service=process.env.SUPABASE_SERVICE_ROLE_KEY,key=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const run=randomBytes(8).toString('hex');
let c:SupabaseClient,sid='',pid='',session='',facture='';
describe.skipIf(!url||!service||!key)('Livraison caisse — clôture et remboursement',()=>{
 beforeAll(async()=>{
  if(!url||!service||!key)throw new Error('Configuration absente');
  const admin=createClient(url,service),email=`p0-caisse-${run}@gsante.test`,password=randomBytes(24).toString('base64url');
  const u=await admin.auth.admin.createUser({email,password,email_confirm:true});if(u.error)throw u.error;
  c=createClient(url,key,{auth:{persistSession:false}});const l=await c.auth.signInWithPassword({email,password});if(l.error)throw l.error;
  const s=await c.rpc('sante_creer_structure',{_type:'cabinet',_nom:`TEST caisse ${run}`,_role_metier:'medecin'});if(s.error)throw s.error;sid=s.data;
  const p=await c.rpc('sante_creer_patient',{_structure_id:sid,_nom:'RECETTE',_prenoms:run,_sexe:'F'});if(p.error)throw p.error;pid=p.data;
 });
 it('refuse les fonds négatifs et fractionnaires puis ouvre un fond entier',async()=>{
  for(const fond of [-1,0.5])expect((await c.rpc('sante_ouvrir_caisse',{_structure_id:sid,_fond:fond})).error).toBeTruthy();
  const s=await c.rpc('sante_ouvrir_caisse',{_structure_id:sid,_fond:5000});expect(s.error).toBeNull();session=s.data;
 });
 it('remboursement payé est déduit et comptabilisé une seule fois',async()=>{
  const f=await c.rpc('sante_creer_facture',{_patient_id:pid,_lignes:[{libelle:'Prestation fictive',prix_unitaire:10000}]});expect(f.error).toBeNull();facture=f.data;
  expect((await c.rpc('sante_encaisser',{_facture_id:facture,_mode:'especes',_montant:10000})).error).toBeNull();
  expect((await c.rpc('sante_annuler_facture',{_facture_id:facture,_motif:'Annulation fictive de recette'})).error).toBeNull();
  const r=await c.from('sante_remboursements').select('id,montant').eq('facture_id',facture).single();expect(r.error).toBeNull();expect(r.data?.montant).toBe(10000);
  expect((await c.rpc('sante_decider_remboursement',{_id:r.data?.id,_approuver:true,_motif:'Accord fictif de recette'})).error).toBeNull();
  expect((await c.rpc('sante_payer_remboursement',{_id:r.data?.id,_mode:'especes'})).error).toBeNull();
  expect((await c.rpc('sante_payer_remboursement',{_id:r.data?.id,_mode:'especes'})).error).toBeTruthy();
  const rapport=await c.rpc('sante_rapport_caisse',{_session_id:session});expect(rapport.error).toBeNull();expect(rapport.data?.remboursements_especes).toBe(10000);
  const ev=await c.from('sante_compta_evenements').select('id,statut').eq('source_id',r.data?.id).eq('source_type','remboursement');expect(ev.error).toBeNull();expect(ev.data).toHaveLength(1);expect(ev.data?.[0]?.statut).toBe('comptabilise');
 });
 it('clôture refuse le montant fractionnaire et verrouille le fond initial',async()=>{
  expect((await c.rpc('sante_fermer_caisse',{_session_id:session,_compte:5000.5})).error).toBeTruthy();
  expect((await c.from('sante_sessions_caisse').update({fond_initial:0}).eq('id',session)).error).toBeTruthy();
  const closed=await c.rpc('sante_fermer_caisse',{_session_id:session,_compte:5000});expect(closed.error).toBeNull();expect(closed.data).toBe(0);
  expect((await c.rpc('sante_fermer_caisse',{_session_id:session,_compte:5000})).error).toBeTruthy();
 });
 it('encaissement concurrent à la clôture est inclus ou refusé, jamais ajouté après calcul',async()=>{
  const s=await c.rpc('sante_ouvrir_caisse',{_structure_id:sid,_fond:0});expect(s.error).toBeNull();
  const f=await c.rpc('sante_creer_facture',{_patient_id:pid,_lignes:[{libelle:'Test concurrence',prix_unitaire:100}]});expect(f.error).toBeNull();
  const [enc,cl]=await Promise.all([c.rpc('sante_encaisser',{_facture_id:f.data,_mode:'especes',_montant:100}),c.rpc('sante_fermer_caisse',{_session_id:s.data,_compte:0})]);expect(cl.error).toBeNull();
  const report=await c.rpc('sante_rapport_caisse',{_session_id:s.data});expect(report.error).toBeNull();
  expect(report.data?.session?.montant_attendu).toBe(enc.error?0:100);expect(report.data?.nb_encaissements).toBe(enc.error?0:1);
 });
});