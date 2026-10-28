import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import reference from '../../src/data/syscohada-plan-2019.json';
import mapping from '../../src/data/syscohada-mapping-2019.json';
const url=process.env.SUPABASE_URL ?? '', service=process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', key=process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
describe.skipIf(!url || !service || !key)('SYSCOHADA : protections API réelles',()=>{
  let admin:SupabaseClient, owner:SupabaseClient;
  let ent='', ex='';
  const run=randomBytes(6).toString('hex');
  beforeAll(async()=>{
    admin=createClient(url,service,{auth:{persistSession:false}});
    const existing = await admin.from('syscohada_references').select('version').eq('version',reference.version).maybeSingle();
    if(existing.error) throw existing.error;
    if(!existing.data) {
      const seed = await admin.from('syscohada_references').insert({version:reference.version,source:reference.source,comptes:reference.rows,mapping:mapping.rows,valide_officiellement:false});
      if(seed.error) throw seed.error;
    }
    const password=randomBytes(24).toString('base64url'), email=`p0-syscohada-${run}@gsante.test`;
    const user=await admin.auth.admin.createUser({email,password,email_confirm:true});
    if(user.error || !user.data.user) throw user.error ?? new Error('Compte test absent');
    owner=createClient(url,key,{auth:{persistSession:false}});
    const login=await owner.auth.signInWithPassword({email,password}); if(login.error || !login.data.session) throw login.error ?? new Error('Session absente');
    const s=await owner.rpc('sante_creer_structure',{_type:'mixte',_nom:`TEST SYSCOHADA ${run}`,_role_metier:'medecin'}); if(s.error) throw s.error;
    const e=await admin.from('structures').select('entreprise_id').eq('id',s.data).single(); ent=e.data?.entreprise_id ?? '';
    const x=await admin.from('exercices').select('id').eq('entreprise_id',ent).single(); ex=x.data?.id ?? '';
    if(!ent || !ex) throw new Error('Entreprise/exercice absent');
    mkdirSync('/tmp/browser/syscohada',{recursive:true});
    writeFileSync('/tmp/browser/syscohada/session.json',JSON.stringify({storage_key:`sb-${new URL(url).hostname.split('.')[0]}-auth-token`,session:login.data.session}),{mode:0o600});
  },120000);
  const input=(compte='521100',debit=10000,credit=10000)=>({_entreprise_id:ent,_exercice_id:ex,_journal_code:'BQ',_date:'2026-10-28',_libelle:'Test intégrité SYSCOHADA',_piece:`SYS-${run}`,_statut:'validee',_origine:'saisie',_lignes:[{compte,debit,credit:0},{compte:'701100',debit:0,credit}]});
  it('refuse le compte supprimé 6811',async()=>expect((await owner.rpc('fn_creer_ecriture',input('6811'))).error?.message).toContain('supprimé'));
  it('référence Cloud : 1 422 comptes et 119 mappings non certifiés',async()=>{
    const r=await owner.from('syscohada_references').select('comptes,mapping,valide_officiellement').eq('version',reference.version).single();
    expect(r.error).toBeNull();expect(r.data?.comptes).toHaveLength(1422);expect(r.data?.mapping).toHaveLength(119);expect(r.data?.valide_officiellement).toBe(false);
  });
  it('refuse les centimes FCFA',async()=>expect((await owner.rpc('fn_creer_ecriture',input('521100',10000.5,10000.5))).error?.message).toContain('entiers'));
  it('refuse une date hors exercice',async()=>expect((await owner.rpc('fn_creer_ecriture',{...input(),_date:'2025-10-28'})).error).toBeTruthy());
  it('refuse un montant non équilibré',async()=>expect((await owner.rpc('fn_creer_ecriture',input('521100',10000,9999))).error).toBeTruthy());
  it('refuse origine clôture forgée',async()=>expect((await owner.rpc('fn_creer_ecriture',{...input(),_origine:'cloture'})).error?.message).toContain('réservée'));
  it('accepte une vente équilibrée de 10 000 et relit la balance',async()=>{
    const r=await owner.rpc('fn_creer_ecriture',input());expect(r.error).toBeNull();
    const b=await owner.rpc('fn_balance',{_entreprise_id:ent,_exercice_id:ex});expect(b.error).toBeNull();expect(Number(b.data?.find((x:{compte:string})=>x.compte==='521100')?.sfd)).toBe(10000);
  });
  it('bloque une clôture sans visa officiel sans changer le statut',async()=>{
    expect((await owner.rpc('fn_cloturer_exercice',{_exercice_id:ex})).error?.message).toContain('non validés');
    expect((await owner.from('exercices').select('statut').eq('id',ex).single()).data?.statut).toBe('en_cours');
  });
});