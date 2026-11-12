import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { rpcPlateforme } from '@/lib/rpc-plateforme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const nb = (n: number) => Number(n).toLocaleString('fr-FR');
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');
const selectCls = 'h-9 rounded-md border border-border bg-background px-2 text-sm';

// ------------------------------------------------------------------ CIM-10 (0129)

type CodeCim = { code: string; libelle: string; chapitre: string | null; version: string; actif: boolean; updated_at: string };
type Apercu = { version: string; codes_version: number; a_desactiver: number; exemples: string[]; applique: boolean };

/** Correction des codes officiels : recherche (codes désactivés compris), libellé, activation, ajout ; désactivation des codes absents d'une version. */
export function GestionCim10({ versions, proprietaire, onChange }: { versions: string[]; proprietaire: boolean; onChange: () => void }) {
  const [q, setQ] = useState('');
  const [codes, setCodes] = useState<CodeCim[]>([]);
  const [edition, setEdition] = useState<Record<string, string>>({});
  const [nouveau, setNouveau] = useState({ code: '', libelle: '' });
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState('');
  const [apercu, setApercu] = useState<Apercu | null>(null);

  const chercher = useCallback(async (texte: string) => {
    if (texte.trim().length < 2) return setCodes([]);
    const { data, error } = await rpcPlateforme<CodeCim[]>('plateforme_cim10_chercher', { _q: texte, _inactifs: true, _limite: 50 });
    if (error) return toast.error(error.message);
    setCodes(data ?? []);
  }, []);
  useEffect(() => { const t = setTimeout(() => void chercher(q), 300); return () => clearTimeout(t); }, [q, chercher]);

  async function definir(code: string, libelle: string, actif: boolean) {
    setBusy(true);
    const { data, error } = await rpcPlateforme<{ code: string; cree: boolean; codes_structures_couverts: number }>('plateforme_cim10_code_definir', { _code: code, _libelle: libelle, _actif: actif });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${data?.code} ${data?.cree ? 'ajouté' : 'enregistré'}${data?.codes_structures_couverts ? ` · remplace le code identique de ${data.codes_structures_couverts} structure(s)` : ''}`);
    setEdition(e => { const { [code]: _, ...reste } = e; return reste; });
    void chercher(q || code); onChange();
  }

  async function absents(appliquer: boolean) {
    if (!version) return;
    if (appliquer && !window.confirm(`Désactiver ${nb(apercu?.a_desactiver ?? 0)} codes absents de « ${version} » ? Les diagnostics déjà codés gardent leur libellé ; un code peut être réactivé ici.`)) return;
    setBusy(true);
    const { data, error } = await rpcPlateforme<Apercu>('plateforme_cim10_desactiver_absents', { _version: version, _appliquer: appliquer });
    setBusy(false);
    if (error) return toast.error(error.message);
    setApercu(data);
    if (appliquer) { toast.success(`${nb(data?.a_desactiver ?? 0)} codes désactivés`); onChange(); }
  }

  return (
    <div className="border border-border rounded-md p-4 space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-semibold">Mettre à jour un code</p>
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Code ou mots du libellé (ex. N80, endométriose)" className="max-w-md" />
        {codes.length > 0 && <table className="w-full text-sm"><tbody>
          {codes.map(c => {
            const lib = edition[c.code];
            return <tr key={c.code} className={`border-t border-border align-top ${c.actif ? '' : 'opacity-60'}`}>
              <td className="py-1.5 pr-3 font-mono text-xs whitespace-nowrap">{c.code}</td>
              <td className="pr-2">{lib === undefined
                ? <>{c.libelle}<span className="block text-xs text-muted-foreground">{c.version}{c.actif ? '' : ' · désactivé'}</span></>
                : <Input value={lib} onChange={e => setEdition(x => ({ ...x, [c.code]: e.target.value }))} className="h-8" />}</td>
              <td className="text-right whitespace-nowrap">
                {lib === undefined
                  ? <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEdition(x => ({ ...x, [c.code]: c.libelle }))}>Modifier</Button>
                  : <><Button size="sm" className="h-7 text-xs" disabled={busy || lib.trim().length < 2} onClick={() => definir(c.code, lib, c.actif)}>Enregistrer</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEdition(x => { const { [c.code]: _, ...r } = x; return r; })}>Annuler</Button></>}
                <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={() => definir(c.code, c.libelle, !c.actif)}>{c.actif ? 'Désactiver' : 'Réactiver'}</Button>
              </td>
            </tr>;
          })}
        </tbody></table>}
        {q.trim().length >= 2 && codes.length === 0 && <p className="text-xs text-muted-foreground">Aucun code trouvé.</p>}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">Ajouter un code officiel</p>
        <p className="text-xs text-muted-foreground">Pour un code publié par l'ATIH ou l'OMS après le dernier chargement. La catégorie (3 caractères) doit exister ; un code identique ajouté par une structure est alors remplacé par le code officiel.</p>
        <div className="grid sm:grid-cols-[8rem_1fr_auto] gap-2 items-end">
          <div><Label className="text-xs">Code</Label><Input value={nouveau.code} onChange={e => setNouveau(n => ({ ...n, code: e.target.value }))} placeholder="U07.3" /></div>
          <div><Label className="text-xs">Libellé</Label><Input value={nouveau.libelle} onChange={e => setNouveau(n => ({ ...n, libelle: e.target.value }))} /></div>
          <Button disabled={busy || nouveau.code.trim().length < 3 || nouveau.libelle.trim().length < 2} onClick={async () => { await definir(nouveau.code, nouveau.libelle, true); setNouveau({ code: '', libelle: '' }); }}>Ajouter</Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">Après le chargement d'une nouvelle version</p>
        <p className="text-xs text-muted-foreground">Le chargement ajoute et met à jour les codes, sans retirer ceux qui ont disparu de la nouvelle version. Choisissez la version chargée pour voir les codes absents, puis désactivez-les. Les codes ajoutés à la main ne sont pas concernés.</p>
        <div className="flex flex-wrap gap-2 items-center">
          <select className={selectCls} value={version} onChange={e => { setVersion(e.target.value); setApercu(null); }}>
            <option value="">Version chargée…</option>
            {versions.filter(v => v !== 'Ajouts plateforme').map(v => <option key={v}>{v}</option>)}
          </select>
          <Button variant="outline" size="sm" disabled={busy || !version} onClick={() => absents(false)}>Voir les codes absents</Button>
          {apercu && !apercu.applique && apercu.a_desactiver > 0 && (proprietaire
            ? <Button size="sm" variant="destructive" disabled={busy} onClick={() => absents(true)}>Désactiver ces {nb(apercu.a_desactiver)} codes</Button>
            : <span className="text-xs text-muted-foreground">Désactivation réservée au propriétaire de la plateforme.</span>)}
        </div>
        {apercu && <div className="text-xs space-y-1" role="status">
          <p>{nb(apercu.codes_version)} codes dans « {apercu.version} » · {nb(apercu.a_desactiver)} code(s) actif(s) absent(s){apercu.applique ? ' : désactivés.' : '.'}</p>
          {apercu.exemples.length > 0 && <p className="text-muted-foreground">{apercu.exemples.join(' · ')}{apercu.a_desactiver > apercu.exemples.length ? '…' : ''}</p>}
        </div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Plan comptable (0129)

type Version = { version: string; source: string; note: string | null; base_version: string | null; valide: boolean; visa_le: string | null;
  visa_expert: string | null; cree_le: string; comptes: number; statut: 'en_vigueur' | 'ancienne' | 'brouillon';
  ecarts: { ajouts: number; modifications: number; retraits: number } | null };
type Versions = { en_vigueur: string; proprietaire: boolean; versions: Version[] };
type Compte = { compte: string; intitule: string; classe: string; sens_normal_indicatif?: string };
type Ecart = { numero: string; nature: 'ajout' | 'modification' | 'retrait'; intitule_avant: string | null; intitule_apres: string | null; sens_avant: string | null; sens_apres: string | null };
const STATUT = { en_vigueur: 'En vigueur', ancienne: 'Ancienne version visée', brouillon: 'Brouillon' } as const;

/** Versions du plan SYSCOHADA : brouillon modifiable, écarts avec la version en vigueur, publication avec le visa de l'expert-comptable. */
export function VersionsPlan({ onChange }: { onChange: () => void }) {
  const [etat, setEtat] = useState<Versions | null>(null);
  const [nom, setNom] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const charger = useCallback(async () => {
    const { data, error } = await rpcPlateforme<Versions>('plateforme_plan_versions');
    if (error) toast.error(error.message); else setEtat(data);
  }, []);
  useEffect(() => { void charger(); }, [charger]);

  async function creer() {
    setBusy(true);
    const { data, error } = await rpcPlateforme<string>('plateforme_plan_version_creer', { _version: nom, _note: note || null });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Brouillon ${data} créé (copie de la version en vigueur)`); setNom(''); setNote(''); void charger();
  }
  if (!etat) return null;
  const brouillons = etat.versions.filter(v => v.statut === 'brouillon');
  return (
    <div className="border border-border rounded-md p-4 space-y-4">
      <div>
        <p className="text-sm font-semibold">Mettre à jour le plan comptable</p>
        <p className="text-xs text-muted-foreground">Une version visée n'est jamais modifiée. On crée un brouillon (copie de la version en vigueur), on y ajoute, renomme ou retire des comptes, puis le propriétaire de la plateforme le publie avec le nom de l'expert-comptable qui l'a visé. À la publication, chaque dossier reçoit les comptes ajoutés ; un compte renommé n'est renommé que dans les dossiers qui avaient gardé l'intitulé d'origine ; rien n'est supprimé dans un dossier.</p>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="text-xs text-muted-foreground text-left"><th className="py-1">Version</th><th>Statut</th><th>Comptes</th><th>Écart avec la version en vigueur</th></tr></thead>
        <tbody>{etat.versions.map(v => <tr key={v.version} className="border-t border-border align-top">
          <td className="py-1.5 pr-3 font-mono text-xs">{v.version}{v.note && <span className="block font-sans text-muted-foreground">{v.note}</span>}</td>
          <td className="text-xs">{STATUT[v.statut]}{v.valide && <span className="block text-muted-foreground">visée le {date(v.visa_le)}{v.visa_expert ? ` · ${v.visa_expert}` : ''}</span>}</td>
          <td className="text-xs">{nb(v.comptes)}</td>
          <td className="text-xs">{v.ecarts ? `${nb(v.ecarts.ajouts)} ajout(s) · ${nb(v.ecarts.modifications)} modification(s) · ${nb(v.ecarts.retraits)} retrait(s)` : '—'}</td>
        </tr>)}</tbody>
      </table>
      {brouillons.map(b => <Brouillon key={b.version} version={b} proprietaire={etat.proprietaire} onChange={() => { void charger(); onChange(); }} />)}
      <div className="grid sm:grid-cols-[16rem_1fr_auto] gap-2 items-end">
        <div><Label className="text-xs">Nouvelle version</Label><Input value={nom} onChange={e => setNom(e.target.value)} placeholder="SYSCOHADA_REVISE_2019_V2" /></div>
        <div><Label className="text-xs">Objet</Label><Input value={note} onChange={e => setNote(e.target.value)} placeholder="Ex. sous-comptes santé, intitulés 2026" /></div>
        <Button disabled={busy || nom.trim().length < 3} onClick={creer}>Créer le brouillon</Button>
      </div>
    </div>
  );
}

function Brouillon({ version, proprietaire, onChange }: { version: Version; proprietaire: boolean; onChange: () => void }) {
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [ecarts, setEcarts] = useState<Ecart[]>([]);
  const [q, setQ] = useState('');
  const [edition, setEdition] = useState<{ numero: string; intitule: string; sens: string; nouveau: boolean } | null>(null);
  const [expert, setExpert] = useState('');
  const [busy, setBusy] = useState(false);

  const charger = useCallback(async () => {
    const lecture = supabase.from as unknown as (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { single: () => PromiseLike<{ data: { comptes: Compte[] } | null; error: { message: string } | null }> } } };
    const [c, e] = await Promise.all([
      lecture.call(supabase, 'syscohada_references').select('comptes').eq('version', version.version).single(),
      rpcPlateforme<Ecart[]>('plateforme_plan_ecarts', { _version: version.version }),
    ]);
    if (c.error) toast.error(c.error.message); else setComptes(c.data?.comptes ?? []);
    if (e.error) toast.error(e.error.message); else setEcarts(e.data ?? []);
  }, [version.version]);
  useEffect(() => { void charger(); }, [charger]);

  const trouves = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    return comptes.filter(c => c.compte.startsWith(t) || c.intitule.toLowerCase().includes(t)).slice(0, 30);
  }, [q, comptes]);

  async function modifier(args: Record<string, unknown>, message: string) {
    setBusy(true);
    const { error } = await rpcPlateforme('plateforme_plan_compte_modifier', { _version: version.version, ...args });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(message); setEdition(null); void charger(); onChange();
  }
  async function publier() {
    if (!window.confirm(`Publier ${version.version} ? Elle devient la version en vigueur pour tous les dossiers (${ecarts.length} écart(s)). Le visa de ${expert} est inscrit au journal.`)) return;
    setBusy(true);
    const { data, error } = await rpcPlateforme<{ comptes_ajoutes_dossiers: number; comptes_renommes_dossiers: number }>('plateforme_plan_version_publier', { _version: version.version, _expert: expert });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Version publiée : ${nb(data?.comptes_ajoutes_dossiers ?? 0)} compte(s) ajouté(s) et ${nb(data?.comptes_renommes_dossiers ?? 0)} renommé(s) dans les dossiers`);
    onChange();
  }
  async function supprimer() {
    if (!window.confirm(`Supprimer le brouillon ${version.version} ?`)) return;
    const { error } = await rpcPlateforme('plateforme_plan_version_supprimer', { _version: version.version });
    if (error) return toast.error(error.message);
    toast.success('Brouillon supprimé'); onChange();
  }

  return (
    <div className="rounded-md bg-muted/40 p-3 space-y-3">
      <p className="text-sm font-semibold">Brouillon <span className="font-mono">{version.version}</span> <span className="text-xs font-normal text-muted-foreground">· copie de {version.base_version ?? '—'} · {nb(comptes.length)} comptes</span></p>
      <div className="flex flex-wrap gap-2 items-center">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher un compte (numéro ou intitulé)" className="max-w-sm h-9" />
        <Button size="sm" variant="outline" onClick={() => setEdition({ numero: '', intitule: '', sens: 'D/C', nouveau: true })}>Ajouter un compte</Button>
      </div>
      {trouves.length > 0 && <table className="w-full text-sm"><tbody>{trouves.map(c => <tr key={c.compte} className="border-t border-border">
        <td className="py-1 pr-3 font-mono text-xs">{c.compte}</td><td>{c.intitule}</td><td className="text-xs text-muted-foreground">{c.sens_normal_indicatif ?? ''}</td>
        <td className="text-right whitespace-nowrap">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEdition({ numero: c.compte, intitule: c.intitule, sens: c.sens_normal_indicatif || 'D/C', nouveau: false })}>Modifier</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={() => window.confirm(`Retirer le compte ${c.compte} du brouillon ? Il reste dans les dossiers qui l'ont.`) && modifier({ _numero: c.compte, _retirer: true }, `Compte ${c.compte} retiré du brouillon`)}>Retirer</Button>
        </td></tr>)}</tbody></table>}
      {edition && <div className="grid sm:grid-cols-[8rem_1fr_6rem_auto_auto] gap-2 items-end">
        <div><Label className="text-xs">Numéro</Label><Input value={edition.numero} disabled={!edition.nouveau} onChange={e => setEdition({ ...edition, numero: e.target.value })} placeholder="7061" /></div>
        <div><Label className="text-xs">Intitulé</Label><Input value={edition.intitule} onChange={e => setEdition({ ...edition, intitule: e.target.value })} /></div>
        <div><Label className="text-xs">Sens</Label><select className={`${selectCls} w-full`} value={edition.sens} onChange={e => setEdition({ ...edition, sens: e.target.value })}><option>D</option><option>C</option><option>D/C</option></select></div>
        <Button size="sm" disabled={busy || !edition.numero || edition.intitule.trim().length < 3} onClick={() => modifier({ _numero: edition.numero, _intitule: edition.intitule, _sens: edition.sens }, `Compte ${edition.numero} enregistré dans le brouillon`)}>Enregistrer</Button>
        <Button size="sm" variant="ghost" onClick={() => setEdition(null)}>Annuler</Button>
      </div>}

      <div className="space-y-1">
        <p className="text-xs font-semibold">Écarts avec la version en vigueur ({ecarts.length})</p>
        {ecarts.length === 0 ? <p className="text-xs text-muted-foreground">Aucun écart pour l'instant.</p>
          : <table className="w-full text-xs"><tbody>{ecarts.slice(0, 200).map(e => <tr key={e.numero} className="border-t border-border align-top">
            <td className="py-1 pr-3 font-mono">{e.numero}</td>
            <td className="pr-3">{e.nature === 'ajout' ? 'Ajout' : e.nature === 'retrait' ? 'Retrait' : 'Modification'}</td>
            <td>{e.nature === 'ajout' ? e.intitule_apres : e.nature === 'retrait' ? <s>{e.intitule_avant}</s>
              : <>{e.intitule_avant !== e.intitule_apres && <><s className="text-muted-foreground">{e.intitule_avant}</s> → </>}{e.intitule_apres}{e.sens_avant !== e.sens_apres && <span className="text-muted-foreground"> · sens {e.sens_avant || '—'} → {e.sens_apres || '—'}</span>}</>}</td>
          </tr>)}</tbody></table>}
        <p className="text-xs text-muted-foreground">Les correspondances des états financiers sont reprises telles quelles : un compte ajouté suit son compte parent.</p>
      </div>

      <div className="flex flex-wrap gap-2 items-end border-t border-border pt-3">
        {proprietaire ? <>
          <div><Label className="text-xs">Expert-comptable qui a visé la version</Label><Input value={expert} onChange={e => setExpert(e.target.value)} placeholder="Nom et n° d'inscription à l'ONECCA" className="w-80 h-9" /></div>
          <Button size="sm" disabled={busy || ecarts.length === 0 || expert.trim().length < 3} onClick={publier}>Publier la version</Button>
        </> : <p className="text-xs text-muted-foreground">La publication est réservée au propriétaire de la plateforme.</p>}
        <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={supprimer}>Supprimer le brouillon</Button>
      </div>
    </div>
  );
}
