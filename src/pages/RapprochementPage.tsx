import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Link2, Undo2, CheckCheck, RefreshCw, Download, Landmark } from 'lucide-react';
import { useApp } from '@/stores/app-store';
import { fmt } from '@/lib/accounting';
import { bankAmount, bankCandidates, mapBankRows, readBankCsv, type BankMapping } from '@/lib/banque';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

type Operation = Tables<'operations_bancaires'>;
type Statement = Tables<'releves_bancaires'>;
const amount = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR');

export default function RapprochementPage() {
  const { journal, balance, plan, entreprise, exercice, demo } = useApp();
  const accounts = useMemo(() => plan.filter(p => p.actif && p.numero.startsWith('52')), [plan]);
  const [account, setAccount] = useState('');
  const [statements, setStatements] = useState<Statement[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [statementId, setStatementId] = useState('');
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [file, setFile] = useState<{ name: string; text: string; headers: string[]; rows: string[][] } | null>(null);
  const [mapping, setMapping] = useState<BankMapping>({ date: -1, libelle: -1, reference: -1, debit: -1, credit: -1, montant: -1 });
  const [mode, setMode] = useState<'debit_credit' | 'montant'>('debit_credit');
  const [opening, setOpening] = useState('0');
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  useEffect(() => { if (!accounts.some(a => a.numero === account)) setAccount(accounts[0]?.numero ?? ''); }, [accounts, account]);
  const load = useCallback(async () => {
    const seq = ++generation.current;
    setSelected(''); setError(''); setLoading(true); setCanWrite(false); setStatements([]); setOperations([]);
    if (!entreprise || !exercice || !account || demo) { setLoading(false); return; }
    try {
      const [r, o, p] = await Promise.all([
        supabase.from('releves_bancaires').select('*').eq('entreprise_id', entreprise.id).eq('exercice_id', exercice.id).eq('compte', account).order('created_at', { ascending: false }),
        supabase.from('operations_bancaires').select('*').eq('entreprise_id', entreprise.id).eq('exercice_id', exercice.id).eq('compte', account).order('date_operation'),
        supabase.rpc('banque_peut_ecrire', { _entreprise_id: entreprise.id }),
      ]);
      if (r.error || o.error || p.error) throw r.error || o.error || p.error;
      if (seq !== generation.current) return;
      setStatements(r.data ?? []); setOperations(o.data ?? []); setCanWrite(Boolean(p.data));
      setStatementId(current => r.data?.some(s => s.id === current) ? current : r.data?.[0]?.id ?? '');
    } catch (e) { if (seq === generation.current) setError(e instanceof Error ? e.message : 'Chargement impossible'); }
    finally { if (seq === generation.current) setLoading(false); }
  }, [entreprise?.id, exercice?.id, account, demo]);
  useEffect(() => { setStatementId(''); setFile(null); setImportOpen(false); void load(); return () => { generation.current++; }; }, [load]);
  const bankLines = useMemo(() => journal.filter(j => j.compte === account && j.entreprise_id === entreprise?.id && j.exercice_id === exercice?.id).sort((a, b) => a.date_ecriture.localeCompare(b.date_ecriture)), [journal, account, entreprise?.id, exercice?.id]);
  const used = useMemo(() => new Set(operations.flatMap(o => o.journal_id ? [o.journal_id] : [])), [operations]);
  const current = operations.filter(o => o.releve_id === statementId);
  const statement = statements.find(s => s.id === statementId);
  const picked = operations.find(o => o.id === selected);
  const candidates = picked ? bankCandidates({ date: picked.date_operation, montant: Number(picked.montant) }, bankLines, used) : [];
  const visible = current.filter(o => (filter === 'all' || (filter === 'matched' ? Boolean(o.journal_id) : !o.journal_id)) && `${o.libelle} ${o.reference}`.toLowerCase().includes(search.toLowerCase()));
  const closing = statement ? Number(statement.solde_initial) + current.reduce((s, o) => s + Number(o.montant), 0) : null;
  const b = balance.find(b => b.compte === account);
  const ledgerBalance = b ? b.sfd - b.sfc : 0;
  const preview = file && exercice ? mapBankRows(file.rows, mapping, mode, exercice.date_debut, exercice.date_fin) : { operations: [], errors: [] };
  const writable = canWrite && exercice?.statut !== 'cloture' && !demo;
  const readFile = async (f?: File) => {
    if (!f) return;
    setFile(null);
    try {
      if (f.size > 5 * 1024 * 1024) throw new Error('Le fichier dépasse 5 Mo.');
      const text = await f.text(); const parsed = readBankCsv(text);
      if (parsed.rows.length > 10000) throw new Error('Maximum 10 000 opérations par relevé.');
      setFile({ name: f.name, text, headers: parsed.headers, rows: parsed.rows }); setMapping(parsed.mapping);
      setMode(parsed.mapping.debit >= 0 && parsed.mapping.credit >= 0 ? 'debit_credit' : 'montant');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Fichier invalide'); }
  };
  const saveImport = async () => {
    if (!file || !entreprise || !exercice || !writable || preview.errors.length || !preview.operations.length) return;
    setBusy(true);
    try {
      const initial = bankAmount(opening);
      const canonical = JSON.stringify(preview.operations);
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
      const fingerprint = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      const r = await supabase.rpc('banque_importer', { _entreprise_id: entreprise.id, _exercice_id: exercice.id, _compte: account, _nom_fichier: file.name, _empreinte: fingerprint, _solde_initial: initial, _operations: preview.operations.map(o => ({ ...o })) });
      if (r.error) { if (r.error.code === '23505') throw new Error('Ce relevé a déjà été importé sur ce compte.'); throw new Error(r.error.message); }
      await load(); setStatementId(r.data); setImportOpen(false); setFile(null); toast.success(`${preview.operations.length} opérations enregistrées`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Import impossible'); } finally { setBusy(false); }
  };
  const match = async (op: string, line: string | null) => {
    setBusy(true);
    try { const r = await supabase.rpc('banque_rapprocher', { _operation_id: op, _journal_id: line as unknown as string }); if (r.error) throw new Error(r.error.message); await load(); toast.success(line ? 'Rapprochement enregistré' : 'Rapprochement annulé'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Rapprochement impossible'); } finally { setBusy(false); }
  };
  const autoMatch = async () => {
    setBusy(true); let count = 0; const reserved = new Set(used);
    try {
      for (const o of current.filter(o => !o.journal_id)) {
        const choices = bankCandidates({ date: o.date_operation, montant: Number(o.montant) }, bankLines, reserved);
        // Ne pas décider quand plusieurs opérations ou écritures partagent la même proposition.
        if (choices.length !== 1) continue;
        const choice = choices[0];
        const competing = current.filter(x => !x.journal_id && bankCandidates({ date: x.date_operation, montant: Number(x.montant) }, [choice], reserved).length);
        if (competing.length !== 1) continue;
        const r = await supabase.rpc('banque_rapprocher', { _operation_id: o.id, _journal_id: choice.id });
        if (r.error) throw new Error(r.error.message); reserved.add(choice.id); count++;
      }
      toast.success(`${count} rapprochement(s) enregistré(s)`);
    } catch (e) { toast.error(`${count} enregistré(s). ${e instanceof Error ? e.message : 'Erreur'}`); }
    finally { await load(); setBusy(false); }
  };
  const template = () => {
    const date = exercice?.date_debut ?? '2026-01-01';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([`\uFEFFDate;Libellé;Référence;Débit;Crédit\n${day(date)};Virement reçu;VIR-001;;10000\n${day(date)};Frais bancaires;FRAIS-001;500;\n`], { type: 'text/csv;charset=utf-8' })); a.download = 'modele-releve-bancaire.csv'; a.click(); URL.revokeObjectURL(a.href);
  };
  const column = (key: keyof BankMapping, label: string) => <label key={key} className="space-y-1 text-xs text-muted-foreground">{label}<Select value={String(mapping[key])} onValueChange={v => setMapping(m => ({ ...m, [key]: Number(v) }))}><SelectTrigger aria-label={`Colonne ${label}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="-1">Non sélectionnée</SelectItem>{file?.headers.map((h, i) => <SelectItem key={i} value={String(i)}>{h || `Colonne ${i + 1}`}</SelectItem>)}</SelectContent></Select></label>;
  return <div className="p-4 sm:p-6 space-y-5">
    <header className="flex flex-wrap justify-between gap-4 items-start"><div><h1 className="font-serif text-2xl flex items-center gap-2"><Landmark className="h-5 w-5 text-primary" />Rapprochement bancaire</h1><p className="text-xs text-muted-foreground mt-1">{entreprise?.nom ?? 'Aucune entreprise'} · Exercice {exercice?.annee ?? '—'}</p></div><div className="flex gap-2"><Button variant="outline" size="icon" title="Actualiser" aria-label="Actualiser" disabled={busy} onClick={() => void load()}><RefreshCw /></Button><Button disabled={!writable || !account || busy || loading} onClick={() => { setOpening('0'); setImportOpen(true); }}><Upload />Importer un relevé</Button></div></header>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {demo && <p className="text-muted-foreground text-sm">L’import nécessite une entreprise connectée.</p>}
    {!accounts.length && <p className="text-muted-foreground text-sm">Aucun compte bancaire actif dans le plan comptable.</p>}
    {!loading && !writable && !demo && accounts.length > 0 && <p className="text-muted-foreground text-sm">{exercice?.statut === 'cloture' ? 'Exercice clôturé — consultation uniquement.' : 'Consultation uniquement — import et rapprochement réservés aux administrateurs et comptables.'}</p>}
    <div className="flex flex-wrap gap-3"><div className="w-full sm:w-64"><Select value={account} disabled={busy} onValueChange={setAccount}><SelectTrigger aria-label="Compte bancaire"><SelectValue placeholder="Compte bancaire" /></SelectTrigger><SelectContent>{accounts.map(a => <SelectItem key={a.numero} value={a.numero}>{a.numero} · {a.intitule}</SelectItem>)}</SelectContent></Select></div><div className="w-full sm:w-80"><Select value={statementId} disabled={busy} onValueChange={v => { setStatementId(v); setSelected(''); }}><SelectTrigger aria-label="Relevé importé"><SelectValue placeholder="Aucun relevé importé" /></SelectTrigger><SelectContent>{statements.map(s => <SelectItem key={s.id} value={s.id}>{s.nom_fichier} · {new Date(s.created_at).toLocaleDateString('fr-FR')}</SelectItem>)}</SelectContent></Select></div></div>
    <div className="grid grid-cols-2 lg:grid-cols-4 border-y border-border py-4 gap-4">{[['Solde comptable · fin exercice', amount(ledgerBalance)], ['Solde final du relevé', closing === null ? '—' : amount(closing)], ['Mouvements non rapprochés', amount(current.filter(o => !o.journal_id).reduce((s, o) => s + Number(o.montant), 0))], ['Opérations rapprochées', `${current.filter(o => o.journal_id).length} / ${current.length}`]].map(([label, value]) => <div key={label}><div className="text-xs text-muted-foreground">{label}</div><div className="font-mono text-xl mt-1">{value}</div></div>)}</div>
    <div className="flex flex-wrap gap-3 justify-between"><div className="flex gap-2 flex-wrap"><Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-44" aria-label="Statut des opérations"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">À rapprocher</SelectItem><SelectItem value="matched">Rapprochées</SelectItem><SelectItem value="all">Toutes</SelectItem></SelectContent></Select><Input aria-label="Rechercher une opération" placeholder="Rechercher une opération" value={search} onChange={e => setSearch(e.target.value)} className="w-60 max-w-full" /></div><Button variant="outline" disabled={!writable || busy || loading || !current.some(o => !o.journal_id)} onClick={autoMatch}><CheckCheck />Rapprocher les correspondances uniques</Button></div>
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6"><section className="min-w-0"><h2 className="font-semibold mb-3">Opérations du relevé <span className="text-muted-foreground">({visible.length})</span></h2><div className="overflow-auto max-h-[520px] border-y border-border"><table className="w-full text-xs"><thead className="bg-muted sticky top-0"><tr>{['Date', 'Libellé / référence', 'Montant', 'État', ''].map((h, i) => <th key={i} className="p-3 text-left font-medium">{h}</th>)}</tr></thead><tbody>{visible.map(o => <tr key={o.id} className={`border-t border-border ${selected === o.id ? 'bg-primary/10' : ''}`}><td className="p-3 whitespace-nowrap">{day(o.date_operation)}</td><td className="p-3 min-w-32"><span className="break-words">{o.libelle}</span><div className="text-muted-foreground">{o.reference}</div></td><td className={`p-3 text-right font-mono whitespace-nowrap ${Number(o.montant) > 0 ? 'text-success' : 'text-destructive'}`}>{amount(Number(o.montant))}</td><td className="p-3">{o.journal_id ? 'Rapprochée' : 'En attente'}</td><td className="p-2">{o.journal_id ? <Button variant="ghost" size="icon" title="Annuler le rapprochement" aria-label={`Annuler ${o.libelle}`} disabled={!writable || busy} onClick={() => void match(o.id, null)}><Undo2 /></Button> : <Button size="sm" variant={selected === o.id ? 'default' : 'outline'} disabled={!writable || busy} onClick={() => setSelected(o.id)}>Choisir</Button>}</td></tr>)}{!visible.length && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">{loading ? 'Chargement…' : statement ? 'Aucune opération dans cette sélection.' : 'Aucun relevé importé.'}</td></tr>}</tbody></table></div></section>
    <section className="min-w-0"><h2 className="font-semibold mb-3">Écritures comptables disponibles <span className="text-muted-foreground">({bankLines.filter(j => !used.has(j.id)).length})</span></h2>{picked && <div className="text-sm mb-3 text-primary">{picked.libelle} · {amount(Number(picked.montant))} · {candidates.length} correspondance(s)</div>}<div className="overflow-auto max-h-[520px] border-y border-border"><table className="w-full text-xs"><thead className="bg-muted sticky top-0"><tr>{['Date', 'Pièce / libellé', 'Montant', ''].map((h, i) => <th key={i} className="p-3 text-left font-medium">{h}</th>)}</tr></thead><tbody>{bankLines.filter(j => !used.has(j.id)).map(j => { const compatible = picked && Math.round(Number(picked.montant) * 100) === Math.round((j.debit - j.credit) * 100); return <tr key={j.id} className={`border-t border-border ${candidates.some(c => c.id === j.id) ? 'bg-success/10' : ''}`}><td className="p-3 whitespace-nowrap">{day(j.date_ecriture)}</td><td className="p-3"><div className="font-mono text-primary">{j.piece}</div><span className="break-words">{j.libelle}</span></td><td className="p-3 font-mono text-right whitespace-nowrap">{amount(j.debit - j.credit)}</td><td className="p-2"><Button variant="outline" size="icon" title="Rapprocher avec l’opération sélectionnée" aria-label={`Rapprocher ${j.piece}`} disabled={!compatible || !writable || busy} onClick={() => picked && void match(picked.id, j.id)}><Link2 /></Button></td></tr>; })}{!bankLines.filter(j => !used.has(j.id)).length && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Aucune écriture bancaire disponible sur ce compte.</td></tr>}</tbody></table></div></section></div>
    <Dialog open={importOpen} onOpenChange={v => { if (!busy) setImportOpen(v); }}><DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-auto"><DialogHeader><DialogTitle>Importer un relevé bancaire</DialogTitle></DialogHeader><div className="flex flex-wrap justify-between gap-2"><Button variant="outline" onClick={() => input.current?.click()} disabled={busy}><Upload />Choisir un fichier CSV / TSV</Button><Button variant="ghost" onClick={template}><Download />Modèle CSV</Button><input ref={input} type="file" accept=".csv,.tsv,.txt" className="hidden" aria-label="Fichier de relevé bancaire" onChange={e => { void readFile(e.target.files?.[0]); e.target.value = ''; }} /></div>{file && <><p className="text-sm break-all">{file.name} · {file.rows.length} opérations</p><label className="space-y-1 text-xs">Format des montants<Select value={mode} onValueChange={v => setMode(v as typeof mode)}><SelectTrigger aria-label="Format des montants"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="debit_credit">Débit bancaire = sortie · Crédit bancaire = entrée</SelectItem><SelectItem value="montant">Montant signé : entrée positive · sortie négative</SelectItem></SelectContent></Select></label><div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{column('date', 'Date')}{column('libelle', 'Libellé')}{column('reference', 'Référence')}{mode === 'montant' ? column('montant', 'Montant') : <>{column('debit', 'Débit')}{column('credit', 'Crédit')}</>}</div><label className="space-y-1 text-xs">Solde initial du relevé ({entreprise?.monnaie})<Input aria-label="Solde initial" value={opening} onChange={e => setOpening(e.target.value)} /></label>{preview.errors.length > 0 && <div role="alert" className="text-destructive text-xs space-y-1">{preview.errors.slice(0, 8).map(e => <p key={e}>{e}</p>)}{preview.errors.length > 8 && <p>Et {preview.errors.length - 8} autre(s) erreur(s).</p>}</div>}<div className="overflow-auto"><table className="w-full text-xs"><thead><tr><th className="text-left p-2">Date</th><th className="text-left p-2">Libellé</th><th className="text-right p-2">Montant signé</th></tr></thead><tbody>{preview.operations.slice(0, 5).map((o, i) => <tr key={i} className="border-t border-border"><td className="p-2">{day(o.date)}</td><td className="p-2">{o.libelle}</td><td className="p-2 text-right font-mono">{amount(o.montant)}</td></tr>)}</tbody></table></div><Button disabled={busy || !writable || preview.errors.length > 0 || !preview.operations.length} onClick={saveImport}>{busy ? 'Enregistrement…' : `Enregistrer ${preview.operations.length} opérations`}</Button></>}</DialogContent></Dialog>
  </div>;
}
