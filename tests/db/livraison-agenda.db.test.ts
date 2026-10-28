import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
const url=process.env.SUPABASE_URL, service=process.env.SUPABASE_SERVICE_ROLE_KEY,key=process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
let c:SupabaseClient, sid='',pid='',pr='',other='',rdv='';
const run=randomBytes(8).toString('hex');
describe.skipIf(!url||!service||!key)('Livraison agenda — cohérence serveur',()=>{
 beforeAll(async()=>{
  if(!url||!service||!key)throw new Error('Configuration absente');
  const admin=createClient(url,service);const email=`p0-agenda-${run}@gsante.test`,password=randomBytes(24).toString('base64url');
  const u=await admin.auth.admin.createUser({email,password,email_confirm:true});if(u.error||!u.data.user)throw new Error('Compte absent');
  c=createClient(url,key,{auth:{persistSession:false}});const login=await c.auth.signInWithPassword({email,password});if(login.error)throw login.error;
  const s=await c.rpc('sante_creer_structure',{_type:'cabinet',_nom:`TEST agenda ${run}`,_role_metier:'medecin'});if(s.error)throw s.error;sid=s.data;
  const p=await c.rpc('sante_creer_patient',{_structure_id:sid,_nom:'RECETTE',_prenoms:run,_sexe:'F'});if(p.error)throw p.error;pid=p.data;
  const first=await c.from('sante_praticiens').insert({structure_id:sid,nom:'Praticien recette',user_id:u.data.user.id}).select('id').single();if(first.error)throw first.error;pr=first.data?.id || '';
  const second=await c.from('sante_praticiens').insert({structure_id:sid,nom:'Autre praticien'}).select('id').single();if(second.error)throw second.error;other=second.data?.id || '';
 });
 it('la durée enregistrée est celle choisie, pas systématiquement vingt minutes',async()=>{
  const r=await c.from('sante_rendez_vous').insert({structure_id:sid,patient_id:pid,praticien_id:pr,debut:'2026-11-02T09:00:00Z',duree_min:45}).select('id,duree_min').single();expect(r.error).toBeNull();expect(r.data?.duree_min).toBe(45);rdv=r.data?.id || '';
 });
 it('un chevauchement du même praticien est refusé, un créneau adjacent est accepté',async()=>{
  expect((await c.from('sante_rendez_vous').insert({structure_id:sid,patient_id:pid,praticien_id:pr,debut:'2026-11-02T09:30:00Z',duree_min:20})).error).toBeTruthy();
  expect((await c.from('sante_rendez_vous').insert({structure_id:sid,patient_id:pid,praticien_id:pr,debut:'2026-11-02T09:45:00Z',duree_min:20})).error).toBeNull();
 });
 it('un déplacement ne peut créer de chevauchement',async()=>{
  expect((await c.from('sante_rendez_vous').update({debut:'2026-11-02T09:20:00Z'}).eq('id',rdv)).error).toBeTruthy();
 });
 it('la consultation doit conserver le praticien du rendez-vous',async()=>{
  expect((await c.from('sante_rendez_vous').update({statut:'arrive'}).eq('id',rdv)).error).toBeNull();
  expect((await c.rpc('sante_demarrer_consultation',{_patient_id:pid,_praticien_id:other,_rdv_id:rdv})).error).toBeTruthy();
  const still=await c.from('sante_rendez_vous').select('statut').eq('id',rdv).single();expect(still.data?.statut).toBe('arrive');
  expect((await c.rpc('sante_demarrer_consultation',{_patient_id:pid,_praticien_id:pr,_rdv_id:rdv})).error).toBeNull();
 });
});