export interface EmailSource {
  id: string;
  structure_id: string;
  fournisseur_id: string | null;
  statut: string;
  erreur: string | null;
  created_at: string;
  envoye_le: string | null;
}
export interface ManagedEvent {
  timestamp: string;
  recipient: string;
  event_type: string;
  status?: string;
  message_id?: string;
}

// Ownership comes from a trusted source row, never from recipient, tags or dates.
export function scopedEmailEvents(structureId: string, sources: EmailSource[], events: ManagedEvent[]) {
  const owned = sources.filter(source => source.structure_id === structureId);
  const ids = new Set(owned.map(source => source.fournisseur_id).filter(Boolean));
  const linked = events.filter(event => Boolean(event.message_id) && ids.has(event.message_id ?? ''));
  const result = linked.map((event, index) => ({
    id: `${event.message_id}:${event.timestamp}:${event.event_type}:${index}`,
    timestamp: event.timestamp,
    recipient: event.recipient,
    event_type: event.event_type,
    detail: event.status ?? null,
    message_id: event.message_id ?? null,
    source_id: owned.find(source => source.fournisseur_id === event.message_id)?.id ?? null,
    origin: 'managed',
  }));
  for (const source of owned) {
    // Preserve synchronous failures even when the provider emits no event.
    if (linked.some(event => event.message_id === source.fournisseur_id) && source.statut !== 'echec') continue;
    result.push({
      id: `source:${source.id}`, timestamp: source.envoye_le ?? source.created_at,
      recipient: '', event_type: source.statut === 'echec' ? 'failed' : source.statut === 'envoye' ? 'accepted' : 'pending',
      detail: source.erreur, message_id: source.fournisseur_id, source_id: source.id, origin: 'source',
    });
  }
  return result.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function journalAccessAllowed(isAdmin: unknown, mfa: unknown) {
  return isAdmin === true && mfa === true;
}