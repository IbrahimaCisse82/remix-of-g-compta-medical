import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_PUBLISHABLE_KEY, service=process.env.SUPABASE_SERVICE_ROLE_KEY;
const run=randomBytes(7).toString('hex'), org=`IPM Santé ${run}`;
let admin:SupabaseClient,c:SupabaseClient,sid='',pid='',mid='',prid='',fid='';
const today=new Date().toISOString().slice(0,10);
async function call(body:Record<string,unknown>,authenticated=false){
 if(!url||!key)throw new Error('Configuration absente');
 const session=(await c.auth.getSession()).data.session;
 const r=await fetch(`${url}/functions/v1/portail-patient`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json',...(authenticated&&session?{Authorization:`Bearer ${session.access_token}`}:{})},body:JSON.stringify(body)});
 return {status:r.status,data:await r.json()};
}
describe.skipIf(!url||!key||!service)('Livraison des parcours santé restants',()=>{
 beforeAll(async()=>{
  if(!url||!key||!service)throw new Error('Configuration absente');
  admin=createClient(url,service,{auth:{persistSession:false}});
  const email=`p0-sante-fin-${run}@gsante.test`,password=randomBytes(24).toString('base64url');
  const user=await admin.auth.admin.createUser({email,password,email_confirm:true});if(user.error)throw user.error;
  c=createClient(url,key,{auth:{persistSession:false}});const login=await c.auth.signInWithPassword({email,password});if(login.error)throw login.error;
  const st=await c.rpc('sante_creer_structure',{_nom:`TEST santé fin ${run}`,_type:'cabinet',_role_metier:'medecin'});if(st.error)throw st.error;sid=st.data;
  const p=await c.rpc('sante_creer_patient',{_structure_id:sid,_nom:'RECETTE',_prenoms:run,_sexe:'F',_date_naissance:'1990-04-12'});if(p.error)throw p.error;pid=p.data;
  const m=await c.from('structure_memberships').select('id').eq('structure_id',sid).single();if(m.error)throw m.error;mid=m.data.id;
  const pr=await c.from('sante_praticiens').insert({structure_id:sid,nom:'Dr Fictif',user_id:user.data.user?.id}).select('id').single();if(pr.error)throw pr.error;prid=pr.data.id;
  const o=await c.from('sante_organismes').insert({structure_id:sid,nom:org,type:'ipm',bascule_patient_autorisee:true});if(o.error)throw o.error;
  const a=await c.from('sante_patient_assurances').insert({patient_id:pid,organisme:org,taux_couverture:80}).select('id').single();if(a.error)throw a.error;
  const f=await c.rpc('sante_creer_facture',{_patient_id:pid,_assurance_id:a.data.id,_lignes:[{libelle:'Acte fictif',prix_unitaire:10000}]});if(f.error)throw f.error;fid=f.data;
  const rule=await c.from('sante_retrocession_regles').insert({structure_id:sid,praticien_id:prid,categorie:'toutes',taux:30});if(rule.error)throw rule.error;
  // Configuration validée fictive uniquement pour la recette écran.
  const config=await c.rpc('sante_configuration_sauver',{_structure_id:sid,_donnees:{nom:`TEST santé fin ${run}`},_etape:2,_revision:0,_terminer:true});if(config.error)throw config.error;
  if(process.env.SANTE_FIN_BROWSER_FIXTURE)writeFileSync(process.env.SANTE_FIN_BROWSER_FIXTURE,JSON.stringify({storage_key:`sb-${new URL(url).hostname.split('.')[0]}-auth-token`,session:(await c.auth.getSession()).data.session,structure:sid,patient:pid,organisme:org,praticien:'Dr Fictif'}));
 });
 it('règlement partiel 3 000 puis bascule de 5 000 laisse zéro dû organisme',async()=>{
  const r=await c.rpc('sante_imputer_reglement',{_structure_id:sid,_organisme:org,_montant:3000,_mode:'virement',_reference:`REG-${run}`,_imputations:[{facture_id:fid,montant:3000}]});expect(r.error).toBeNull();
  expect((await c.rpc('sante_rejet_tiers',{_facture_id:fid,_type:'perte',_motif:'Fraction refusée',_montant:0.5})).error).toBeTruthy();
  const rej=await c.rpc('sante_rejet_tiers',{_facture_id:fid,_type:'non_prise_en_charge',_motif:'Refus convention fictive',_montant:5000});expect(rej.error).toBeNull();
  const remain=await admin.rpc('sante_reste_organisme',{_facture_id:fid});expect(Number(remain.data)).toBe(0);
  const row=await c.from('sante_tiers_rejets').select('facture_bascule_id').eq('id',rej.data).single();expect(row.error).toBeNull();
  const bascule=await c.from('sante_factures').select('part_patient').eq('id',row.data?.facture_bascule_id??'').single();expect(Number(bascule.data?.part_patient)).toBe(5000);
 });
 it('affiche une plage chevauchant deux mois et verrouille les chevauchements concurrents',async()=>{
  const r=await c.from('sante_plannings').insert({structure_id:sid,membership_id:mid,type:'garde',debut:'2026-10-31T22:00:00Z',fin:'2026-11-01T06:00:00Z'}).select('id').single();expect(r.error).toBeNull();
  const nov=await c.from('sante_plannings').select('id').eq('structure_id',sid).gt('fin','2026-11-01T00:00:00Z').lt('debut','2026-12-01T00:00:00Z');expect(nov.data?.map(x=>x.id)).toContain(r.data?.id);
  const args={structure_id:sid,membership_id:mid,type:'poste',debut:'2026-11-03T08:00:00Z',fin:'2026-11-03T10:00:00Z'};
  const rs=await Promise.all([c.from('sante_plannings').insert(args),c.from('sante_plannings').insert(args)]);expect(rs.filter(x=>!x.error)).toHaveLength(1);
 });
 it('refuse les forfaits fractionnaires et garde les montants FCFA entiers',async()=>{
  expect((await c.from('sante_personnel_parametres').upsert({structure_id:sid,forfait_garde:0.5,forfait_astreinte:0})).error).toBeTruthy();
  expect((await c.from('sante_personnel_parametres').upsert({structure_id:sid,forfait_garde:5000,forfait_astreinte:2000})).error).toBeNull();
 });
 it('simule, valide, paie et refuse un deuxième paiement et une annulation après paiement',async()=>{
  const consult=await c.rpc('sante_demarrer_consultation',{_patient_id:pid,_praticien_id:prid,_motif:'Consultation fictive'});expect(consult.error).toBeNull();
  const f=await c.rpc('sante_creer_facture',{_patient_id:pid,_consultation_id:consult.data,_lignes:[{libelle:'Consultation fictive',categorie:'consultation',prix_unitaire:10000}]});expect(f.error).toBeNull();
  const sim=await c.rpc('sante_calcul_retrocession',{_praticien_id:prid,_debut:today,_fin:today});expect(sim.error).toBeNull();expect((sim.data as any).montant_brut).toBe(3000);
  const r=await c.rpc('sante_valider_retrocession',{_praticien_id:prid,_debut:today,_fin:today});expect(r.error).toBeNull();
  expect((await c.rpc('sante_payer_retrocession',{_id:r.data,_mode:'virement'})).error).toBeTruthy();
  expect((await c.rpc('sante_payer_retrocession',{_id:r.data,_mode:'virement',_reference:`RET-${run}`})).error).toBeNull();
  expect((await c.rpc('sante_payer_retrocession',{_id:r.data,_mode:'especes'})).error).toBeTruthy();
  expect((await c.rpc('sante_annuler_retrocession',{_id:r.data,_motif:'Annulation impossible après paiement'})).error).toBeTruthy();
 });
 it('lien patient à usage unique, session relue puis révoquée',async()=>{
  const l=await call({action:'lien',patient_id:pid,heures:24},true);expect(l.status).toBe(200);
  const opened=await call({action:'ouvrir_lien',token:l.data.token,date_naissance:'1990-04-12'});expect(opened.status).toBe(200);
  expect((await call({action:'ouvrir_lien',token:l.data.token,date_naissance:'1990-04-12'})).status).toBe(401);
  expect((await call({action:'donnees',token:opened.data.token})).status).toBe(200);
  expect((await c.rpc('sante_revoquer_portail',{_patient_id:pid})).error).toBeNull();
  expect((await call({action:'donnees',token:opened.data.token})).status).toBe(401);
 });
 it('refuse un lien expiré',async()=>{
  const l=await call({action:'lien',patient_id:pid,heures:24},true);expect(l.status).toBe(200);
  await admin.from('sante_portail_patient').update({expire_le:'2020-01-01T00:00:00Z'}).eq('patient_id',pid).eq('type','lien');
  expect((await call({action:'ouvrir_lien',token:l.data.token,date_naissance:'1990-04-12'})).status).toBe(401);
 });
 it('annule un relevé validé non payé avec motif long et conserve son historique',async()=>{
  const tomorrow=new Date();tomorrow.setUTCDate(tomorrow.getUTCDate()+1);const date=tomorrow.toISOString().slice(0,10);
  const f=await c.rpc('sante_creer_facture',{_patient_id:pid,_lignes:[{libelle:'Acte recette annulation',prix_unitaire:10000}]});expect(f.error).toBeNull();
  const setup=await admin.from('sante_factures').update({praticien_id:prid,created_at:`${date}T12:00:00Z`}).eq('id',f.data);expect(setup.error).toBeNull();
  const r=await c.rpc('sante_valider_retrocession',{_praticien_id:prid,_debut:date,_fin:date});expect(r.error).toBeNull();
  expect((await c.rpc('sante_annuler_retrocession',{_id:r.data,_motif:'court'})).error).toBeTruthy();
  expect((await c.rpc('sante_annuler_retrocession',{_id:r.data,_motif:'Erreur de période fictive'})).error).toBeNull();
  const read=await c.from('sante_retrocessions').select('statut,motif_annulation').eq('id',r.data).single();expect(read.data).toEqual({statut:'annulee',motif_annulation:'Erreur de période fictive'});
 });
});