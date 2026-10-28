import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const url = process.env.SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const enabled = Boolean(url && service && key);
const run = randomBytes(8).toString('hex');
let owner: SupabaseClient, invitee: SupabaseClient, stranger: SupabaseClient;
let structureId = '', inviteeId = '', email = '';

describe.skipIf(!enabled)('Livraison : invitations et absence de SMS — API réelle', () => {
  beforeAll(async () => {
    if (!url || !service || !key) throw new Error('Configuration absente');
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const account = async (name: string) => {
      const mail = `p0-delivery-${name}-${run}@gsante.test`;
      const password = randomBytes(24).toString('base64url');
      const created = await admin.auth.admin.createUser({ email: mail, password, email_confirm: true });
      if (created.error || !created.data.user) throw new Error('Création du compte de test impossible');
      const c = createClient(url, key, { auth: { persistSession: false } });
      const login = await c.auth.signInWithPassword({ email: mail, password });
      if (login.error) throw login.error;
      return { c, id: created.data.user.id, mail };
    };
    owner = (await account('owner')).c;
    const target = await account('invitee');
    invitee = target.c; inviteeId = target.id; email = target.mail;
    stranger = (await account('stranger')).c;
    const structure = await owner.rpc('sante_creer_structure', { _type: 'cabinet', _nom: `TEST livraison ${run}`, _role_metier: 'admin_structure' });
    if (structure.error || !structure.data) throw new Error('Structure de test absente');
    structureId = structure.data;
  });

  it('seul le destinataire accepte une invitation, une seule fois et avec le rôle prévu', async () => {
    const invitation = await owner.rpc('create_medical_invitation', { _structure_id: structureId, _email: email, _role: 'secretaire' });
    expect(invitation.error).toBeNull();
    const denied = await stranger.rpc('accept_medical_invitation', { _invitation_id: invitation.data });
    expect(denied.error).toBeTruthy();
    const accepted = await invitee.rpc('accept_medical_invitation', { _invitation_id: invitation.data });
    expect(accepted.error).toBeNull(); expect(accepted.data).toBe(structureId);
    const member = await invitee.from('structure_memberships').select('id,statut').eq('structure_id', structureId).eq('user_id', inviteeId).single();
    expect(member.data?.statut).toBe('actif');
    const roles = await invitee.from('medical_user_roles').select('role').eq('membership_id', member.data?.id);
    expect(roles.data?.map(r => r.role)).toEqual(['secretaire']);
    expect((await invitee.rpc('accept_medical_invitation', { _invitation_id: invitation.data })).error).toBeTruthy();
  });

  it('une secrétaire ne peut ni ajouter un site ni inviter un administrateur', async () => {
    expect((await invitee.rpc('create_medical_site', { _structure_id: structureId, _nom: 'Site interdit' })).error).toBeTruthy();
    expect((await invitee.rpc('create_medical_invitation', { _structure_id: structureId, _email: email, _role: 'admin_structure' })).error).toBeTruthy();
  });

  it('révocation d’une invitation empêche son acceptation', async () => {
    const inv = await owner.rpc('create_medical_invitation', { _structure_id: structureId, _email: email, _role: 'lecteur' });
    expect(inv.error).toBeNull();
    expect((await owner.rpc('sante_invitation_revoquer', { _structure_id: structureId, _invitation_id: inv.data })).error).toBeNull();
    expect((await invitee.rpc('accept_medical_invitation', { _invitation_id: inv.data })).error).toBeTruthy();
  });

  it('le dernier administrateur actif ne peut être suspendu ni privé de son rôle', async () => {
    const team = await owner.rpc('sante_equipe_lister', { _structure_id: structureId });
    expect(team.error).toBeNull();
    const admin = team.data?.find(m => m.roles.includes('admin_structure'));
    expect(admin).toBeTruthy();
    for (const [roles, statut] of [[['admin_structure'],'suspendu'], [['lecteur'],'actif']] as const) {
      expect((await owner.rpc('sante_equipe_modifier', { _structure_id: structureId, _membership_id: admin?.id, _roles: [...roles], _statut: statut })).error).toBeTruthy();
    }
  });

  it('suspension coupe immédiatement les permissions et la réactivation les restaure', async () => {
    const team = await owner.rpc('sante_equipe_lister', { _structure_id: structureId });
    const target = team.data?.find(m => m.user_id === inviteeId);
    expect(target).toBeTruthy();
    expect((await invitee.rpc('sante_equipe_lister', { _structure_id: structureId })).error).toBeTruthy();
    expect((await invitee.rpc('sante_equipe_modifier', { _structure_id: structureId, _membership_id: target?.id, _roles: ['admin_structure'], _statut: 'actif' })).error).toBeTruthy();
    for (const statut of ['suspendu','actif']) {
      expect((await owner.rpc('sante_equipe_modifier', { _structure_id: structureId, _membership_id: target?.id, _roles: ['secretaire'], _statut: statut })).error).toBeNull();
      expect((await invitee.rpc('has_medical_role', { _structure_id: structureId, _role: 'secretaire' })).data).toBe(statut === 'actif');
    }
  });

  it('les rappels SMS sont refusés même par appel direct', async () => {
    const r = await owner.functions.invoke('sante-rappels', { body: { structure_id: structureId } });
    expect(r.error).toBeTruthy();
    expect('context' in (r.error ?? {}) && r.error?.context.status).toBe(410);
  });

  for (const action of ['demander_code', 'verifier_code']) {
    it(`le portail refuse ${action} sans envoyer de SMS`, async () => {
      const r = await stranger.functions.invoke('portail-patient', { body: { action } });
      expect(r.error).toBeTruthy();
      expect('context' in (r.error ?? {}) && r.error?.context.status).toBe(410);
    });
  }
});