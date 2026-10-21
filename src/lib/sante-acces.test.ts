import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { classerRefus, completerMessageModule, estMessageExplicite, messageRefusGenerique } from './sante-acces';

describe('classerRefus', () => {
  it('reconnaît les messages serveur explicites', () => {
    expect(classerRefus({ message: 'MFA requise : validez la vérification en deux étapes.' })).toBe('mfa');
    expect(classerRefus({ message: 'Module Dossier patient inactif : contactez votre administrateur pour son activation.' })).toBe('module');
    expect(classerRefus({ message: 'Accès refusé : un rôle Médecin … est requis' })).toBe('role');
    expect(classerRefus({ message: 'Authentification requise : reconnectez-vous.' })).toBe('auth');
  });

  it('requalifie les refus RLS bruts', () => {
    expect(classerRefus({ message: 'new row violates row-level security policy for table "sante_rdv"', code: '42501' })).toBe('rls');
    expect(classerRefus({ message: 'permission denied for function sante_x' })).toBe('rls');
    expect(classerRefus({ message: 'JWT expired', code: 'PGRST301' })).toBe('auth');
  });

  it('ignore les erreurs métier ordinaires', () => {
    expect(classerRefus({ message: 'Nom et prénoms obligatoires' })).toBeNull();
    expect(classerRefus(null)).toBeNull();
  });

  it('distingue explicite et ambigu', () => {
    expect(estMessageExplicite('mfa')).toBe(true);
    expect(estMessageExplicite('rls')).toBe(false);
    expect(estMessageExplicite(null)).toBe(false);
  });
});

describe('messages réels observés en recette (21/10/2026)', () => {
  it('« Accès refusé » nu est complété avec les rôles', () => {
    expect(classerRefus({ message: 'Accès refusé', code: 'P0001' })).toBe('rls');
  });
  it('« Module laboratoire inactif » reçoit la marche à suivre', () => {
    expect(classerRefus({ message: 'Module laboratoire inactif', code: 'P0001' })).toBe('module');
    expect(completerMessageModule('Module laboratoire inactif')).toBe(
      'Module laboratoire inactif : demandez à l’administrateur de la structure de l’activer (Structure & paramètres).',
    );
  });
  it('un message module déjà complet est conservé', () => {
    const m = 'Module Dossier patient inactif : contactez votre administrateur pour son activation.';
    expect(completerMessageModule(m)).toBe(m);
  });
  it('les refus métier de l’onboarding restent affichés tels quels', () => {
    expect(classerRefus({ message: 'Rôle incompatible avec le type de structure', code: 'P0001' })).toBeNull();
    expect(classerRefus({ message: 'Rôle métier invalide', code: 'P0001' })).toBeNull();
  });
});

describe('messageRefusGenerique', () => {
  it('liste les rôles de l’utilisateur', () => {
    const m = messageRefusGenerique(['secretaire', 'caissier']);
    expect(m).toContain('Secrétaire, Caissier');
    expect(m).toContain('module');
  });
  it('signale l’absence de rôle', () => {
    expect(messageRefusGenerique([])).toContain('aucun rôle actif');
  });
  it('reste explicite sans information de rôle', () => {
    expect(messageRefusGenerique(null)).toContain('rôle insuffisant');
  });
});
