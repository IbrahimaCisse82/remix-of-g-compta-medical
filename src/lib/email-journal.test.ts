import { describe, expect, it } from 'vitest';
import { journalAccessAllowed, scopedEmailEvents, type EmailSource } from '../../supabase/functions/_shared/email-journal';

const source: EmailSource = { id: 'reminder-a', structure_id: 'a', fournisseur_id: 'message-a', statut: 'envoye', erreur: null, created_at: '2026-10-28T12:00:00Z', envoye_le: '2026-10-28T12:01:00Z' };
describe('Journal e-mails : permissions et attribution', () => {
  it('réserve le journal aux administrateurs avec MFA conforme', () => {
    expect(journalAccessAllowed(true, true)).toBe(true);
    expect(journalAccessAllowed(false, true)).toBe(false);
    expect(journalAccessAllowed(true, false)).toBe(false);
    expect(journalAccessAllowed(null, true)).toBe(false);
  });
  it('exclut les autres structures même avec le même destinataire', () => {
    const events = ['message-a', 'message-b'].map(message_id => ({ message_id, recipient: 'patient@example.test', timestamp: source.created_at, event_type: 'sent' }));
    const rows = scopedEmailEvents('a', [source, { ...source, id: 'b', structure_id: 'b', fournisseur_id: 'message-b' }], events);
    expect(rows).toHaveLength(1);
    expect(rows[0].message_id).toBe('message-a');
  });
  it('ne révèle aucun événement sans corrélation fiable', () => {
    expect(scopedEmailEvents('a', [], [{ message_id: 'unknown', recipient: 'secret@example.test', timestamp: source.created_at, event_type: 'sent' }])).toEqual([]);
  });
  it('affiche les échecs synchrones sans événement fournisseur', () => {
    const rows = scopedEmailEvents('a', [{ ...source, statut: 'echec', erreur: 'domain_not_verified', fournisseur_id: null }], []);
    expect(rows[0]).toMatchObject({ event_type: 'failed', detail: 'domain_not_verified', recipient: '' });
  });
  it('conserve envoi et rebond séparément, sans inventer une livraison', () => {
    const rows = scopedEmailEvents('a', [source], [
      { message_id: 'message-a', recipient: 'patient@example.test', timestamp: '2026-10-28T12:02:00Z', event_type: 'sent' },
      { message_id: 'message-a', recipient: 'patient@example.test', timestamp: '2026-10-28T12:03:00Z', event_type: 'bounced', status: 'mailbox_unavailable' },
    ]);
    expect(rows.map(row => row.event_type)).toEqual(['bounced', 'sent']);
    expect(rows[0].detail).toBe('mailbox_unavailable');
  });
});