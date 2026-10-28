import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
const url=process.env.SUPABASE_URL, service=process.env.SUPABASE_SERVICE_ROLE_KEY, key=process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const run=randomBytes(8).toString('hex');
let admin: SupabaseClient, owner: SupabaseClient, second: SupabaseClient;
let sid='', first='', duplicate='', doc='', path='', fusion='';
describe.skipIf(!url || !service || !key)('Livraison dossier patient — API réelle',()=>{
  beforeAll(async()=>{
    if(!url || !service || !key) throw new Error('Configuration absente');
    admin=createClient(url,service);
    async function account(n:string){
      const email=`p0-patient-delivery-${n}-${run}@gsante.test`,password=randomBytes(24).toString('base64url');
      const u=await admin.auth.admin.createUser({email,password,email_confirm:true});
      if(u.error || !u.data.user) throw new Error('Compte absent');
      const c=createClient(url,key,{auth:{persistSession:false}});const login=await c.auth.signInWithPassword({email,password});if(login.error)throw login.error;
      return {c,id:u.data.user.id};
    }
    owner=(await account('owner')).c;const sec=await account('second');second=sec.c;
    const s=await owner.rpc('sante_creer_structure',{_type:'cabinet',_nom:`TEST dossier livraison ${run}`,_role_metier:'medecin'});if(s.error)throw s.error;sid=s.data;
    const m=await admin.from('structure_memberships').insert({structure_id:sid,user_id:sec.id,statut:'actif'}).select('id').single();if(m.error)throw m.error;
    await admin.from('medical_user_roles').insert({membership_id:m.data?.id,role:'secretaire'});
    for(const force of [false,true]){
      const p=await owner.rpc('sante_creer_patient',{_structure_id:sid,_nom:'RECETTE',_prenoms:`Patient${run}`,_sexe:'F',_date_naissance:'1990-04-12',_consentement:true,_ignorer_doublons:force});if(p.error)throw p.error;if(force)duplicate=p.data;else first=p.data;
    }
    path=`${sid}/${duplicate}/${randomBytes(8).toString('hex')}.txt`;
    const up=await owner.storage.from('sante-documents').upload(path,new Blob(['document fictif'],{type:'text/plain'}));if(up.error)throw up.error;
    const d=await owner.from('sante_documents_patient').insert({structure_id:sid,patient_id:duplicate,nom:'Document de recette',storage_path:path,mime_type:'text/plain',taille_octets:16});if(d.error)throw d.error;
    const savedDoc=await admin.from('sante_documents_patient').select('id').eq('storage_path',path).single();doc=savedDoc.data?.id || '';
  });
  it('un doublon est détecté avant de créer un troisième dossier',async()=>{
    const r=await owner.rpc('sante_creer_patient',{_structure_id:sid,_nom:'RECETTE',_prenoms:`Patient${run}`,_sexe:'F',_date_naissance:'1990-04-12'});expect(r.error?.message).toContain('DOUBLON_POSSIBLE');
  });
  it('le consentement signé conserve texte, décision et empreintes',async()=>{
    const r=await owner.rpc('sante_signer_consentement',{_patient_id:first,_type:'traitement_donnees',_version:'TEST-v1',_texte:'Texte fictif de recette technique uniquement, sans valeur juridique ni usage clinique.',_accorde:false,_signataire_nom:'Patient fictif',_signataire_qualite:'patient',_signature_png:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1sAAAAASUVORK5CYII='});expect(r.error).toBeNull();
    const saved=await owner.from('sante_consentements').select('accorde,texte_sha256,signature_sha256').eq('id',r.data).single();expect(saved.data?.accorde).toBe(false);expect(saved.data?.texte_sha256).toMatch(/^[a-f0-9]{64}$/);expect(saved.data?.signature_sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it('fusion en deux personnes transfère les documents sans déplacer le fichier',async()=>{
    const proposal=await owner.rpc('sante_proposer_fusion',{_conserve:first,_fusionne:duplicate,_motif:'Doublon de recette'});expect(proposal.error).toBeNull();fusion=proposal.data;
    expect((await owner.rpc('sante_confirmer_fusion',{_fusion_id:fusion})).error).toBeTruthy();
    expect((await second.rpc('sante_confirmer_fusion',{_fusion_id:fusion})).error).toBeNull();
    const row=await admin.from('sante_documents_patient').select('patient_id,storage_path').eq('id',doc).single();expect(row.data).toEqual({patient_id:first,storage_path:path});
    expect((await owner.rpc('sante_document_patient_effectif',{_path:path})).data).toBe(first);
  });
  it('annulation restaure exactement le dossier d’origine des documents',async()=>{
    expect((await owner.rpc('sante_annuler_fusion',{_fusion_id:fusion,_motif:'Annulation de recette technique'})).error).toBeNull();
    const row=await admin.from('sante_documents_patient').select('patient_id,storage_path').eq('id',doc).single();expect(row.data).toEqual({patient_id:duplicate,storage_path:path});
    expect((await owner.rpc('sante_document_patient_effectif',{_path:path})).data).toBe(duplicate);
  });
});