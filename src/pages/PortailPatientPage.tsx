import { useCallback, useEffect, useState } from 'react';
import { FileText, Pill, ShieldCheck } from 'lucide-react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const KEY = 'gsante_portail_patient';
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const dt = (s: string) => new Date(s).toLocaleDateString('fr-FR');

async function appel(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('portail-patient', { body });
  if (error) throw new Error(error instanceof FunctionsHttpError ? (await error.context.json().catch(() => ({}))).error ?? 'Erreur' : error.message);
  return data;
}

function imprimer(titre: string, corps: string, d: any) {
  const w = window.open('', '_blank'); if (!w) return;
  const s = d.structure, p = d.patient;
  w.document.write(`<html><head><title>${esc(titre)}</title><style>@page{size:A4;margin:15mm}body{font-family:Arial,sans-serif;font-size:12px;color:#111}h1{font-size:18px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ccc;padding:4px;text-align:left}.f{color:#b00;font-weight:bold}footer{margin-top:24px;font-size:10px;color:#555}</style></head><body>
  <strong>${esc(s.nom)}</strong><br>${esc(s.adresse)} · ${esc(s.telephone)}<hr>
  <h1>${esc(titre)}</h1><p>Patient : <b>${esc(p.nom)} ${esc(p.prenoms)}</b> · Dossier ${esc(p.numero_dossier)}${p.date_naissance ? ` · né(e) le ${dt(p.date_naissance)}` : ''}</p>${corps}
  <footer>NINEA ${esc(s.ninea)} · RCCM ${esc(s.rccm)} — Document consulté via le portail patient.</footer><script>print()</script></body></html>`);
  w.document.close();
}

export default function PortailPatientPage() {
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [lien, setLien] = useState<string | null>(null); const [dn, setDn] = useState('');
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('t');
    if (t) { setLien(t); window.history.replaceState({}, '', '/resultats'); return; }
    setToken(sessionStorage.getItem(KEY));
  }, []);

  const charger = useCallback(async (t: string) => {
    try { setData(await appel({ action: 'donnees', token: t })); setErr(''); }
    catch (e: any) { sessionStorage.removeItem(KEY); setToken(null); setErr(e.message); }
  }, []);
  useEffect(() => { if (token) void charger(token); }, [token, charger]);

  const go = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); try { await fn(); } catch (e: any) { setErr(e.message); } setBusy(false); };

  if (!token || !data) return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="w-full max-w-sm border border-border bg-bg2 rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-2"><ShieldCheck className="text-primary" /><h1 className="font-serif text-xl">Mes résultats</h1></div>
        {token && !data && !err ? <p className="text-sm text-fg2">Chargement…</p> : lien ? (
          <>
            <p className="text-sm text-fg2">Pour votre sécurité, confirmez votre date de naissance. Ce lien ne peut être utilisé qu’une seule fois.</p>
            <Input aria-label="Date de naissance" type="date" value={dn} onChange={e => setDn(e.target.value)} />
            <Button className="w-full" disabled={busy || !dn} onClick={() => go(async () => { const r = await appel({ action: 'ouvrir_lien', token: lien, date_naissance: dn }); sessionStorage.setItem(KEY, r.token); setLien(null); setToken(r.token); })}>Accéder</Button>
          </>
        ) : (
          <p className="text-sm text-fg2">Demandez votre lien personnel à l’accueil de votre structure de santé.</p>
        )}
        {err && <p className="text-sm text-destructive">{err}</p>}
      </div>
    </main>
  );

  const { patient, structure, ordonnances, comptes_rendus } = data;
  return (
    <main className="min-h-screen bg-background text-foreground p-4 max-w-2xl mx-auto space-y-5">
      <header className="flex justify-between items-start gap-2">
        <div><p className="text-xs text-primary font-mono uppercase">{structure.nom}</p><h1 className="font-serif text-2xl">{patient.prenoms} {patient.nom}</h1><p className="text-xs text-fg2">Dossier {patient.numero_dossier} · accès valable jusqu’au {new Date(data.expire_le).toLocaleString('fr-FR')}</p></div>
        <Button size="sm" variant="outline" onClick={() => { sessionStorage.removeItem(KEY); setToken(null); setData(null); }}>Quitter</Button>
      </header>
      <section className="space-y-2">
        <h2 className="font-semibold flex items-center gap-2"><FileText className="text-primary" />Comptes rendus d’analyses</h2>
        {comptes_rendus.length === 0 && <p className="text-sm text-fg2">Aucun compte rendu validé.</p>}
        {data.a_retirer_sur_place > 0 && <p className="text-sm text-fg2 border border-border rounded p-3">Un ou plusieurs résultats sont à retirer en personne auprès de {structure?.nom ?? 'votre structure'}, muni d’une pièce d’identité.</p>}
        {comptes_rendus.map((d: any) => (
          <div key={d.id} className="border border-border bg-bg2 rounded-md p-3 flex justify-between items-center gap-2">
            <div><p className="font-medium text-sm">{d.numero}</p><p className="text-xs text-fg2">Validé le {dt(d.validee_le)}{d.prescripteur ? ` · ${d.prescripteur}` : ''}</p></div>
            <Button size="sm" onClick={() => imprimer(`Compte rendu ${d.numero}`, `<table><tr><th>Analyse</th><th>Résultat</th><th>Références</th></tr>${[...d.resultats].sort((a: any, b: any) => (a.parametre?.ordre ?? 0) - (b.parametre?.ordre ?? 0)).map((r: any) => `<tr><td>${esc(r.parametre?.libelle)}</td><td class="${r.drapeau && r.drapeau !== 'N' ? 'f' : ''}">${esc(r.valeur_num ?? r.valeur_texte)} ${esc(r.parametre?.unite ?? '')} ${r.drapeau && r.drapeau !== 'N' ? esc(r.drapeau) : ''}</td><td>${r.ref_bas != null ? `${r.ref_bas} – ${r.ref_haut}` : ''}</td></tr>`).join('')}</table><p>Validé le ${dt(d.validee_le)}</p>`, data)}>Télécharger</Button>
          </div>
        ))}
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold flex items-center gap-2"><Pill className="text-primary" />Ordonnances</h2>
        {ordonnances.length === 0 && <p className="text-sm text-fg2">Aucune ordonnance.</p>}
        {ordonnances.map((o: any) => (
          <div key={o.id} className="border border-border bg-bg2 rounded-md p-3 flex justify-between items-center gap-2">
            <div><p className="font-medium text-sm">{o.numero}</p><p className="text-xs text-fg2">{dt(o.emise_le)} · {o.praticien?.nom}</p></div>
            <Button size="sm" onClick={() => imprimer(`Ordonnance ${o.numero}`, `<p>${esc(o.praticien?.nom)} — ${esc(o.praticien?.specialite)} · ${dt(o.emise_le)}</p><ol>${[...o.lignes].sort((a: any, b: any) => a.ordre - b.ordre).map((l: any) => `<li><b>${esc(l.medicament)}</b> — ${esc(l.posologie)} ${l.duree ? `· ${esc(l.duree)}` : ''} ${l.quantite ? `· Qté ${esc(l.quantite)}` : ''}</li>`).join('')}</ol>${o.recommandations ? `<p>${esc(o.recommandations)}</p>` : ''}`, data)}>Télécharger</Button>
          </div>
        ))}
      </section>
      <p className="text-[11px] text-fg3">Ne partagez pas ce lien. Pour toute question sur vos résultats, contactez {structure.nom}{structure.telephone ? ` au ${structure.telephone}` : ''}.</p>
    </main>
  );
}
