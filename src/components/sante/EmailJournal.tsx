import { useCallback, useEffect, useRef, useState } from 'react';
import { Mail, RefreshCw, ChevronDown } from 'lucide-react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface Event { id: string; timestamp: string; recipient: string; event_type: string; detail: string | null; message_id: string | null; source_id: string | null; origin: string }
const labels: Record<string, string> = { sent: 'Envoyé', rejected: 'Refusé', bounced: 'Rebond', complained: 'Plainte', unsubscribed: 'Désinscrit', suppressed: 'Bloqué', rate_limited: 'Limité', failed: 'Échec', accepted: 'Envoi accepté', pending: 'En attente' };
const failures = ['failed', 'rejected', 'bounced', 'suppressed', 'rate_limited'];

export default function EmailJournal({ structureId }: { structureId: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [floor, setFloor] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [period, setPeriod] = useState('7');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const generation = useRef(0);
  const load = useCallback(async (next?: string) => {
    const request = ++generation.current;
    setBusy(true); setError('');
    if (!next) { setEvents([]); setCursor(null); setWarning(''); setFloor(null); }
    try {
      const since = new Date(Date.now() - Number(period) * 86400000).toISOString();
      const { data, error: failure } = await supabase.functions.invoke('email-journal', { body: { structure_id: structureId, since, ...(next ? { cursor: next } : {}) } });
      if (request !== generation.current) return;
      if (failure) {
        const details = failure instanceof FunctionsHttpError ? await failure.context.json().catch(() => ({})) : {};
        throw new Error([details.error ?? 'Lecture du journal impossible.', details.code].filter(Boolean).join(' · '));
      }
      setEvents(previous => [...new Map([...(next ? previous : []), ...(data.events ?? [])].map((event: Event) => [event.id, event])).values()]);
      setCursor(data.pagination?.has_more ? data.pagination.next_cursor : null);
      setFloor(data.history_starts_at); setWarning(data.warning ?? '');
    } catch (failure) {
      if (request === generation.current) { setEvents([]); setCursor(null); setError(failure instanceof Error ? failure.message : 'Lecture impossible'); }
    } finally { if (request === generation.current) setBusy(false); }
  }, [structureId, period]);
  useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);
  const visible = events.filter(event => (status === 'all' || (status === 'failures' ? failures.includes(event.event_type) : event.event_type === status)) && `${event.recipient} ${event.message_id ?? ''} ${event.detail ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="mt-8 border-t border-border pt-6 space-y-4" aria-label="Journal des e-mails">
    <div className="flex items-center justify-between gap-3"><h2 className="font-semibold flex items-center gap-2"><Mail className="text-primary" />Journal des e-mails</h2><Button size="icon" variant="outline" aria-label="Actualiser le journal" title="Actualiser le journal" disabled={busy} onClick={() => void load()}><RefreshCw className={busy ? 'animate-spin motion-reduce:animate-none' : ''} /></Button></div>
    <div className="grid gap-3 sm:grid-cols-3">
      <Input aria-label="Rechercher dans les e-mails" placeholder="Destinataire, identifiant, diagnostic" value={search} onChange={e => setSearch(e.target.value)} />
      <Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="État d’envoi"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tous les états</SelectItem><SelectItem value="failures">Échecs et blocages</SelectItem>{Object.entries(labels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select>
      <Select value={period} onValueChange={setPeriod}><SelectTrigger aria-label="Période du journal"><SelectValue /></SelectTrigger><SelectContent>{['1', '7', '30', '90'].map(days => <SelectItem key={days} value={days}>{days} dernier{days === '1' ? '' : 's'} jour{days === '1' ? '' : 's'}</SelectItem>)}</SelectContent></Select>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {warning && <p role="status" className="text-sm text-muted-foreground">{warning}</p>}
    {floor && <p className="text-xs text-muted-foreground">Historique disponible depuis le {new Date(floor).toLocaleString('fr-FR')}.</p>}
    <p className="text-xs text-muted-foreground">Les états « livré » et « ouvert » ne sont pas disponibles.</p>
    {busy && <p role="status" className="text-sm text-muted-foreground">Chargement du journal…</p>}
    {!busy && !error && visible.length === 0 && <p className="text-sm text-muted-foreground">{events.length ? 'Aucun événement pour ces filtres.' : 'Aucun e-mail métier enregistré pour cette période.'}</p>}
    <div className="divide-y divide-border">{visible.map(event => <article key={event.id} className="py-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2"><Badge variant={failures.includes(event.event_type) ? 'destructive' : 'secondary'}>{labels[event.event_type] ?? event.event_type}</Badge><time className="text-xs text-muted-foreground">{new Date(event.timestamp).toLocaleString('fr-FR')}</time><span className="text-sm break-all">{event.recipient || 'Destinataire non disponible'}</span></div>
      <details className="text-xs"><summary className="cursor-pointer text-primary">Diagnostic</summary><dl className="mt-2 grid gap-1 break-all"><div><dt className="inline font-medium">Détail : </dt><dd className="inline">{event.detail || 'Aucun détail fourni'}</dd></div><div><dt className="inline font-medium">Message : </dt><dd className="inline">{event.message_id || 'Non attribué'}</dd></div><div><dt className="inline font-medium">Référence : </dt><dd className="inline">{event.source_id}</dd></div></dl></details>
    </article>)}</div>
    {cursor && <Button variant="outline" disabled={busy} onClick={() => void load(cursor)}><ChevronDown />Charger la suite</Button>}
  </section>;
}