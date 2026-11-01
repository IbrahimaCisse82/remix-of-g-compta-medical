import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/stores/app-store';
import { toast } from 'sonner';
import { enregistrerLignesJournal } from '@/lib/ecritures';
import {
  calculerPaie, DEFAULT_PAIE_PARAMS, fmtMoney, MOIS,
  genererEcrituresPaie, type Employee, type PaieParametres, type BulletinResult,
} from '@/lib/paie';

type EmployeeRow = Employee & { id: string };

const EMPTY_EMP: Omit<EmployeeRow, 'id'> = {
  matricule: '', prenom: '', nom: '', sexe: 'M', date_naissance: null,
  situation_famille: 'Célibataire', femmes: 0, enfants: 0,
  fonction: '', convention: 'Commerce', categorie: '', statut: 'employés',
  contrat: 'CDI', date_entree: null, salaire_base: 0, sursalaire: 0,
};

export default function PaiePage() {
  const { entreprise, exercice } = useApp();
  const [tab, setTab] = useState<'employes' | 'bulletins' | 'parametres' | 'ecritures'>('employes');
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [params, setParams] = useState<PaieParametres>(DEFAULT_PAIE_PARAMS);
  const [loading, setLoading] = useState(false);
  const [showEmpForm, setShowEmpForm] = useState(false);
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [form, setForm] = useState<Omit<EmployeeRow, 'id'>>(EMPTY_EMP);
  const today = new Date();
  const [annee, setAnnee] = useState(today.getFullYear());
  const [mois, setMois] = useState(today.getMonth() + 1);

  useEffect(() => {
    if (!entreprise) return;
    (async () => {
      setLoading(true);
      const [{ data: emps }, { data: par }] = await Promise.all([
        supabase.from('employees').select('*').eq('entreprise_id', entreprise.id).order('matricule'),
        supabase.from('paie_parametres').select('*').eq('entreprise_id', entreprise.id).maybeSingle(),
      ]);
      setEmployees((emps as any) || []);
      if (par?.parametres) setParams({ ...DEFAULT_PAIE_PARAMS, ...(par.parametres as any) });
      setLoading(false);
    })();
  }, [entreprise?.id]);

  const periode = `${annee}-${String(mois).padStart(2, '0')}`;
  const refDate = useMemo(() => new Date(annee, mois - 1, 28), [annee, mois]);

  const bulletins = useMemo(
    () => employees.map(e => ({ emp: e, paie: calculerPaie(e, params, refDate) })),
    [employees, params, refDate],
  );

  const totaux = useMemo(() => bulletins.reduce((a, b) => ({
    brut: a.brut + b.paie.brut,
    net: a.net + b.paie.net_payer,
    ret: a.ret + b.paie.total_retenues,
    ch:  a.ch  + b.paie.charges_patronales,
    masse: a.masse + b.paie.masse_salariale,
  }), { brut: 0, net: 0, ret: 0, ch: 0, masse: 0 }), [bulletins]);

  function openNew() { setForm(EMPTY_EMP); setEditing(null); setShowEmpForm(true); }
  function openEdit(e: EmployeeRow) { setForm(e); setEditing(e); setShowEmpForm(true); }

  async function saveEmp() {
    if (!entreprise) return;
    if (!form.matricule || !form.prenom || !form.nom) { toast.error('Matricule, prénom, nom obligatoires'); return; }
    const payload = { ...form, entreprise_id: entreprise.id, salaire_base: Number(form.salaire_base), sursalaire: Number(form.sursalaire), femmes: Number(form.femmes), enfants: Number(form.enfants) };
    if (editing) {
      const { error } = await supabase.from('employees').update(payload).eq('id', editing.id);
      if (error) return toast.error(error.message);
      setEmployees(s => s.map(x => x.id === editing.id ? { ...x, ...payload } as any : x));
      toast.success('Employé mis à jour');
    } else {
      const { data, error } = await supabase.from('employees').insert(payload).select().single();
      if (error) return toast.error(error.message);
      setEmployees(s => [...s, data as any]);
      toast.success('Employé ajouté');
    }
    setShowEmpForm(false);
  }

  async function deleteEmp(id: string) {
    if (!confirm('Supprimer cet employé ?')) return;
    const { error } = await supabase.from('employees').delete().eq('id', id);
    if (error) return toast.error(error.message);
    setEmployees(s => s.filter(x => x.id !== id));
  }

  async function saveParams() {
    if (!entreprise) return;
    const { error } = await supabase.from('paie_parametres').upsert({
      entreprise_id: entreprise.id, parametres: params as any,
    }, { onConflict: 'entreprise_id' });
    if (error) return toast.error(error.message);
    toast.success('Paramètres sauvegardés');
  }

  async function genererBulletins() {
    if (!entreprise || !exercice) return toast.error('Entreprise/exercice requis');
    if (employees.length === 0) return toast.error('Aucun employé');
    const rows = bulletins.map(({ emp, paie }) => ({
      entreprise_id: entreprise.id,
      exercice_id: exercice.id,
      employee_id: emp.id,
      periode, annee, mois,
      salaire_base: paie.salaire_base, sursalaire: paie.sursalaire,
      prime_anciennete: paie.prime_anciennete, brut: paie.brut,
      ir: paie.ir, trimf: paie.trimf,
      ipres_rg_s: paie.ipres_rg_s, ipres_rc_s: paie.ipres_rc_s, ipm_s: paie.ipm_s,
      total_retenues: paie.total_retenues,
      cfce: paie.cfce, ipres_rg_p: paie.ipres_rg_p, ipres_rc_p: paie.ipres_rc_p,
      css_af: paie.css_af, css_at: paie.css_at, ipm_p: paie.ipm_p,
      charges_patronales: paie.charges_patronales,
      transport: paie.transport, net_payer: paie.net_payer,
    }));
    const { error } = await supabase.from('bulletins_paie').upsert(rows as any, { onConflict: 'employee_id,periode' });
    if (error) return toast.error(error.message);
    toast.success(`${rows.length} bulletins générés pour ${MOIS[mois - 1]} ${annee}`);
  }

  async function comptabiliserPaie() {
    if (!entreprise || !exercice) return;
    const lignes = genererEcrituresPaie(bulletins.map(b => b.paie), periode, exercice.id, entreprise.id);
    const totDebit = lignes.reduce((s, l) => s + l.debit, 0);
    const totCredit = lignes.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totDebit - totCredit) > 1) return toast.error(`Écriture déséquilibrée: D=${fmtMoney(totDebit)} C=${fmtMoney(totCredit)}`);
    try {
      await enregistrerLignesJournal(lignes as any, { origine: 'paie' });
    } catch (e) { return toast.error((e as Error).message); }
    await supabase.from('bulletins_paie').update({ comptabilise: true }).eq('entreprise_id', entreprise.id).eq('periode', periode);
    toast.success(`Écritures journal PA générées (${fmtMoney(totDebit)} FCFA)`);
  }

  if (!entreprise) return <div className="p-8 text-center text-fg3">Sélectionnez une entreprise</div>;

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div className="font-serif text-[17px]">💼 Paie SYSCOHADA Sénégal</div>
        <div className="flex gap-2 text-[11px]">
          <select value={mois} onChange={e => setMois(+e.target.value)} className="bg-bg3 border border-border rounded px-2 py-1">
            {MOIS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <input type="number" value={annee} onChange={e => setAnnee(+e.target.value)} className="bg-bg3 border border-border rounded px-2 py-1 w-20" />
        </div>
      </div>

      <div className="flex border-b border-border bg-bg2 px-5 text-xs">
        {[
          { id: 'employes', label: '👥 Employés' },
          { id: 'bulletins', label: '📄 Bulletins' },
          { id: 'parametres', label: '⚙️ Paramètres' },
          { id: 'ecritures', label: '📋 Écritures' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={`px-4 py-2.5 border-b-2 ${tab === t.id ? 'border-primary text-primary font-semibold' : 'border-transparent text-fg2 hover:text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {/* STATS */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          {[
            ['Employés', employees.length, 'text-primary'],
            ['Brut total', fmtMoney(totaux.brut), 'text-accent'],
            ['Retenues', fmtMoney(totaux.ret), 'text-destructive'],
            ['Charges patronales', fmtMoney(totaux.ch), 'text-purple'],
            ['Net à payer', fmtMoney(totaux.net), 'text-green-500'],
          ].map(([l, v, c]) => (
            <div key={l as string} className="bg-bg2 border border-border rounded-lg p-3">
              <div className="text-[10px] text-fg3 uppercase tracking-wider">{l}</div>
              <div className={`text-lg font-bold ${c} mt-1`}>{v}</div>
            </div>
          ))}
        </div>

        {/* EMPLOYES */}
        {tab === 'employes' && (
          <div>
            <div className="flex justify-between mb-3">
              <h2 className="font-serif text-base">Registre du personnel</h2>
              <button onClick={openNew} className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-semibold">+ Nouvel employé</button>
            </div>
            <div className="bg-bg2 border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-bg3 border-b border-border">
                  <tr>{['Matricule', 'Nom', 'Fonction', 'Statut', 'Sit.Fam', 'Enf.', 'Anc.', 'Sal. base', 'Sursalaire', 'Action'].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-mono uppercase text-[10px] text-fg3">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {employees.map(e => {
                    const p = calculerPaie(e, params, refDate);
                    return (
                      <tr key={e.id} className="border-b border-border/30 hover:bg-bg3/50">
                        <td className="px-3 py-2 font-mono text-primary">{e.matricule}</td>
                        <td className="px-3 py-2 font-semibold">{e.prenom} {e.nom}</td>
                        <td className="px-3 py-2 text-fg2">{e.fonction}</td>
                        <td className="px-3 py-2 text-fg2">{e.statut}</td>
                        <td className="px-3 py-2 text-fg2">{e.situation_famille}</td>
                        <td className="px-3 py-2 text-center">{e.enfants}</td>
                        <td className="px-3 py-2 text-center">{p.anciennete} ans</td>
                        <td className="px-3 py-2 text-right font-mono">{fmtMoney(e.salaire_base)}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmtMoney(e.sursalaire)}</td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => openEdit(e)} className="text-primary hover:underline mr-2">✎</button>
                          <button onClick={() => deleteEmp(e.id)} className="text-destructive hover:underline">🗑</button>
                        </td>
                      </tr>
                    );
                  })}
                  {employees.length === 0 && (
                    <tr><td colSpan={10} className="text-center py-8 text-fg3">Aucun employé — Cliquez sur "Nouvel employé"</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* BULLETINS */}
        {tab === 'bulletins' && (
          <div>
            <div className="flex justify-between mb-3">
              <h2 className="font-serif text-base">Bulletins de paie — {MOIS[mois - 1]} {annee}</h2>
              <div className="flex gap-2">
                <button onClick={genererBulletins} className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-semibold">💾 Générer & sauvegarder</button>
                <button onClick={() => window.print()} className="border border-border px-3 py-1.5 rounded text-xs">🖨 Imprimer</button>
              </div>
            </div>
            <div className="space-y-3">
              {bulletins.map(({ emp, paie }) => (
                <div key={emp.id} className="bg-bg2 border border-border rounded-lg p-4 print:break-after-page">
                  <div className="flex justify-between items-start border-b border-border pb-2 mb-3">
                    <div>
                      <div className="font-bold text-sm">{emp.prenom} {emp.nom}</div>
                      <div className="text-[10px] text-fg3 font-mono">{emp.matricule} · {emp.fonction} · {emp.statut}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-fg3">Période</div>
                      <div className="text-sm font-bold text-primary">{MOIS[mois - 1]} {annee}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                    <Row l="Salaire de base" v={paie.salaire_base} />
                    <Row l="Sursalaire" v={paie.sursalaire} />
                    <Row l={`Prime ancienneté (${paie.anciennete} ans · ${(paie.taux_anciennete*100).toFixed(0)}%)`} v={paie.prime_anciennete} />
                    <Row l="SALAIRE BRUT" v={paie.brut} bold />
                    <Row l="IR (parts: " v={paie.ir} neg suffix={`${paie.parts_ir})`} />
                    <Row l={`TRIMF (parts: ${paie.parts_trimf})`} v={paie.trimf} neg />
                    <Row l="IPRES RG salarié (5,6%)" v={paie.ipres_rg_s} neg />
                    {paie.ipres_rc_s > 0 && <Row l="IPRES RCC salarié (2,4%)" v={paie.ipres_rc_s} neg />}
                    {paie.ipm_s > 0 && <Row l="IPM salarié" v={paie.ipm_s} neg />}
                    <Row l="Total retenues" v={paie.total_retenues} neg bold />
                    <Row l="Indemnité transport" v={paie.transport} pos />
                    <Row l="NET À PAYER" v={paie.net_payer} bold accent />
                  </div>
                  <div className="mt-3 pt-2 border-t border-border/30 grid grid-cols-3 md:grid-cols-6 gap-2 text-[10px]">
                    {[['CFCE 3%', paie.cfce], ['IPRES RG pat.', paie.ipres_rg_p], ['IPRES RCC pat.', paie.ipres_rc_p], ['CSS AF 7%', paie.css_af], ['CSS AT 1%', paie.css_at], ['Charges Pat.', paie.charges_patronales]].map(([l, v]) => (
                      <div key={l as string} className="bg-bg3 rounded px-2 py-1">
                        <div className="text-fg3">{l}</div>
                        <div className="font-mono font-bold text-purple">{fmtMoney(v as number)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PARAMETRES */}
        {tab === 'parametres' && (
          <div>
            <div className="flex justify-between mb-3">
              <h2 className="font-serif text-base">Paramètres de cotisation</h2>
              <button onClick={saveParams} className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-semibold">💾 Sauvegarder</button>
            </div>
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-bg3 border-b border-border">
                  <tr>{['Cotisation', 'Taux global', 'Part salariale', 'Part patronale', 'Plafond mensuel'].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-mono uppercase text-[10px] text-fg3">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {(['IPRES_RG', 'IPRES_RCC', 'CSS_AF', 'CSS_AT', 'CFCE', 'IPM'] as const).map(k => (
                    <tr key={k} className="border-b border-border/30">
                      <td className="px-3 py-2 font-semibold">{k}</td>
                      <td className="px-3 py-2"><input type="number" step="0.001" value={params[k].taux} onChange={e => setParams(p => ({ ...p, [k]: { ...p[k], taux: +e.target.value } }))} className="bg-bg3 border border-border rounded px-2 py-1 w-24" /></td>
                      <td className="px-3 py-2"><input type="number" step="0.1" value={params[k].tauxSalarial} onChange={e => setParams(p => ({ ...p, [k]: { ...p[k], tauxSalarial: +e.target.value } }))} className="bg-bg3 border border-border rounded px-2 py-1 w-20" /></td>
                      <td className="px-3 py-2"><input type="number" step="0.1" value={params[k].tauxPatronal} onChange={e => setParams(p => ({ ...p, [k]: { ...p[k], tauxPatronal: +e.target.value } }))} className="bg-bg3 border border-border rounded px-2 py-1 w-20" /></td>
                      <td className="px-3 py-2"><input type="number" value={params[k].plafond ?? ''} onChange={e => setParams(p => ({ ...p, [k]: { ...p[k], plafond: e.target.value ? +e.target.value : null } }))} className="bg-bg3 border border-border rounded px-2 py-1 w-28" /></td>
                    </tr>
                  ))}
                  <tr className="border-b border-border/30">
                    <td className="px-3 py-2 font-semibold">Indemnité transport</td>
                    <td colSpan={4} className="px-3 py-2"><input type="number" value={params.transport.valeur} onChange={e => setParams(p => ({ ...p, transport: { valeur: +e.target.value } }))} className="bg-bg3 border border-border rounded px-2 py-1 w-32" /> FCFA / mois</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 text-[11px] text-fg3 bg-bg2 border border-border rounded-lg p-3">
              <div className="font-bold text-foreground mb-1">📚 Barème IRPP Sénégal (annuel par part)</div>
              <ul className="space-y-0.5 font-mono">
                <li>Jusqu'à 630 000 FCFA : 0%</li>
                <li>630 001 – 1 500 000 : 20%</li>
                <li>1 500 001 – 4 000 000 : 30%</li>
                <li>4 000 001 – 8 000 000 : 35%</li>
                <li>8 000 001 – 13 500 000 : 37%</li>
                <li>Au-delà de 13 500 000 : 40%</li>
              </ul>
            </div>
          </div>
        )}

        {/* ECRITURES */}
        {tab === 'ecritures' && (
          <div>
            <div className="flex justify-between mb-3">
              <h2 className="font-serif text-base">Écritures comptables — Journal PA</h2>
              <button onClick={comptabiliserPaie} className="bg-accent text-accent-foreground px-3 py-1.5 rounded text-xs font-semibold">📋 Comptabiliser dans le journal</button>
            </div>
            <div className="bg-bg2 border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-bg3 border-b border-border">
                  <tr>{['Compte', 'Intitulé', 'Débit', 'Crédit'].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-mono uppercase text-[10px] text-fg3">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {genererEcrituresPaie(bulletins.map(b => b.paie), periode, exercice?.id || '', entreprise.id).map((l, i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td className="px-3 py-1.5 font-mono text-primary">{l.compte}</td>
                      <td className="px-3 py-1.5">{l.intitule}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{l.debit > 0 ? fmtMoney(l.debit) : '—'}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{l.credit > 0 ? fmtMoney(l.credit) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* MODAL EMPLOYE */}
      {showEmpForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowEmpForm(false)}>
          <div className="bg-bg2 border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-4">
              <h3 className="font-serif text-base">{editing ? 'Modifier' : 'Nouvel'} employé</h3>
              <button onClick={() => setShowEmpForm(false)} className="text-fg3">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Field label="Matricule *" v={form.matricule} on={v => setForm(f => ({ ...f, matricule: v }))} />
              <Field label="Sexe" v={form.sexe} on={v => setForm(f => ({ ...f, sexe: v as 'M' | 'F' }))} sel={[['M', 'M'], ['F', 'F']]} />
              <Field label="Prénom *" v={form.prenom} on={v => setForm(f => ({ ...f, prenom: v }))} />
              <Field label="Nom *" v={form.nom} on={v => setForm(f => ({ ...f, nom: v }))} />
              <Field label="Fonction" v={form.fonction || ''} on={v => setForm(f => ({ ...f, fonction: v }))} />
              <Field label="Statut" v={form.statut} on={v => setForm(f => ({ ...f, statut: v }))} sel={[['employés', 'employés'], ['agents de maîtrise', 'agents de maîtrise'], ['cadres', 'cadres']]} />
              <Field label="Situation familiale" v={form.situation_famille} on={v => setForm(f => ({ ...f, situation_famille: v }))} sel={[['Célibataire', 'Célibataire'], ['Marié(e)', 'Marié(e)'], ['Divorcé(e)', 'Divorcé(e)'], ['Veuf(ve)', 'Veuf(ve)']]} />
              <Field label="Contrat" v={form.contrat} on={v => setForm(f => ({ ...f, contrat: v }))} sel={[['CDI', 'CDI'], ['CDD', 'CDD'], ['Stage', 'Stage']]} />
              <Field label="Nombre d'épouses" v={String(form.femmes)} on={v => setForm(f => ({ ...f, femmes: +v }))} type="number" />
              <Field label="Nombre d'enfants" v={String(form.enfants)} on={v => setForm(f => ({ ...f, enfants: +v }))} type="number" />
              <Field label="Date d'entrée" v={form.date_entree || ''} on={v => setForm(f => ({ ...f, date_entree: v }))} type="date" />
              <Field label="Date de naissance" v={form.date_naissance || ''} on={v => setForm(f => ({ ...f, date_naissance: v }))} type="date" />
              <Field label="Salaire de base" v={String(form.salaire_base)} on={v => setForm(f => ({ ...f, salaire_base: +v }))} type="number" />
              <Field label="Sursalaire" v={String(form.sursalaire)} on={v => setForm(f => ({ ...f, sursalaire: +v }))} type="number" />
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setShowEmpForm(false)} className="border border-border px-3 py-1.5 rounded text-xs">Annuler</button>
              <button onClick={saveEmp} className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-semibold">Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ l, v, neg, pos, bold, accent, suffix }: { l: string; v: number; neg?: boolean; pos?: boolean; bold?: boolean; accent?: boolean; suffix?: string }) {
  return (
    <div className={`flex justify-between py-1 ${bold ? 'border-y border-border/30 font-bold' : ''}`}>
      <span className={accent ? 'text-primary' : 'text-fg2'}>{l}{suffix}</span>
      <span className={`font-mono ${neg ? 'text-destructive' : pos ? 'text-green-500' : accent ? 'text-primary' : 'text-foreground'}`}>{neg ? '−' : ''}{fmtMoney(v)}</span>
    </div>
  );
}

function Field({ label, v, on, type = 'text', sel }: { label: string; v: string; on: (v: string) => void; type?: string; sel?: [string, string][] }) {
  return (
    <div>
      <label className="block text-[10px] text-fg3 mb-1 uppercase tracking-wider">{label}</label>
      {sel ? (
        <select value={v} onChange={e => on(e.target.value)} className="w-full bg-bg3 border border-border rounded px-2 py-1.5">
          {sel.map(([val, lab]) => <option key={val} value={val}>{lab}</option>)}
        </select>
      ) : (
        <input type={type} value={v} onChange={e => on(e.target.value)} className="w-full bg-bg3 border border-border rounded px-2 py-1.5" />
      )}
    </div>
  );
}
