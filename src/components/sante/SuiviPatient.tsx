import { useEffect, useState } from 'react';
import { CalendarClock, FileText, Stethoscope, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { aujourdhuiDakar, bornes, chronologie, courbesConstantes, echeance, tendance, type Courbe, type EvenementSuivi, type Mesure } from '@/domain/sante/suivi';
import { lireControles, type Controle } from './controles';

const dateFr = (d: string) => new Date(d.length === 10 ? `${d}T00:00:00Z` : d).toLocaleDateString('fr-FR', { timeZone: 'UTC' });

/** Onglet « Suivi » du dossier patient : courbes des constantes et chronologie (consultations, ordonnances, contrôles). */
export default function SuiviPatient({ patientId }: { patientId: string }) {
  const [etat, setEtat] = useState<'chargement' | 'ok' | 'refuse'>('chargement');
  const [mesures, setMesures] = useState<Mesure[]>([]);
  const [evenements, setEvenements] = useState<EvenementSuivi[]>([]);
  const [controles, setControles] = useState<Controle[]>([]);
  const [filtre, setFiltre] = useState<'tout' | EvenementSuivi['type']>('tout');

  useEffect(() => {
    let actif = true;
    (async () => {
      const [c, k, o, ctl] = await Promise.all([
        supabase.from('sante_consultations').select('id, created_at, motif, diagnostic, conduite, statut, praticien:sante_praticiens(nom)').eq('patient_id', patientId).order('created_at', { ascending: false }).limit(200),
        supabase.from('sante_constantes').select('created_at, ta_sys, ta_dia, pouls, temperature, poids, spo2, glycemie').eq('patient_id', patientId).order('created_at').limit(500),
        supabase.from('sante_ordonnances').select('id, numero, emise_le, lignes:sante_ordonnance_lignes(id)').eq('patient_id', patientId).order('emise_le', { ascending: false }).limit(200),
        lireControles({ patientId }),
      ]);
      if (!actif) return;
      if (c.error) { setEtat('refuse'); return; }
      setMesures((k.data ?? []) as Mesure[]);
      setControles(ctl);
      setEvenements([
        ...(c.data ?? []).map(x => ({ type: 'consultation' as const, date: x.created_at, id: x.id, motif: x.motif, diagnostic: x.diagnostic, conduite: x.conduite, statut: x.statut, praticien: (x.praticien as { nom: string } | null)?.nom ?? null })),
        ...(o.data ?? []).map(x => ({ type: 'ordonnance' as const, date: x.emise_le, id: x.id, numero: x.numero, medicaments: (x.lignes as unknown[] | null)?.length ?? 0 })),
        ...ctl.map(x => ({ type: 'controle' as const, date: x.prevu_le, id: x.id, motif: x.motif, statut: x.statut, prevu_le: x.prevu_le })),
      ]);
      setEtat('ok');
    })();
    return () => { actif = false; };
  }, [patientId]);

  if (etat === 'chargement') return <p className="text-sm text-fg3">Chargement du suivi…</p>;
  if (etat === 'refuse') return <p className="text-sm text-fg3">Le suivi clinique est réservé aux soignants ayant accès à ce dossier.</p>;

  const courbes = courbesConstantes(mesures);
  const jour = aujourdhuiDakar();
  const aVenir = controles.filter(k => k.statut === 'prevu').sort((a, b) => a.prevu_le.localeCompare(b.prevu_le));
  const liste = chronologie(evenements).filter(e => filtre === 'tout' || e.type === filtre);
  const nbConsult = evenements.filter(e => e.type === 'consultation').length;

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        <Indicateur titre="Consultations" valeur={String(nbConsult)} detail={nbConsult ? `Dernière le ${dateFr(evenements.filter(e => e.type === 'consultation').sort((a, b) => b.date.localeCompare(a.date))[0].date)}` : 'Aucune'} />
        <Indicateur titre="Mesures de constantes" valeur={String(mesures.length)} detail={mesures.length ? `Dernière le ${dateFr(mesures[mesures.length - 1].created_at)}` : 'Aucune'} />
        <Indicateur titre="Prochain contrôle" valeur={aVenir[0] ? dateFr(aVenir[0].prevu_le) : '—'} detail={aVenir[0] ? `${echeance(aVenir[0].prevu_le, jour).libelle} · ${aVenir[0].motif}` : 'Aucun contrôle programmé'} alerte={aVenir[0] ? echeance(aVenir[0].prevu_le, jour).etat === 'retard' : false} />
      </div>

      <section className="border border-border bg-bg2 rounded-md p-4">
        <h2 className="font-semibold mb-1">Évolution des constantes</h2>
        {courbes.length === 0
          ? <p className="text-sm text-fg3">Les courbes apparaissent dès qu’une constante a été mesurée au moins deux fois.</p>
          : <div className="grid md:grid-cols-2 gap-4 mt-3">{courbes.map(c => <CourbeConstante key={c.id} courbe={c} />)}</div>}
      </section>

      <section className="border border-border bg-bg2 rounded-md p-4">
        <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
          <h2 className="font-semibold">Chronologie</h2>
          <div className="flex gap-1" role="group" aria-label="Filtrer la chronologie">
            {([['tout', 'Tout'], ['consultation', 'Consultations'], ['ordonnance', 'Ordonnances'], ['controle', 'Contrôles']] as const).map(([v, l]) => (
              <button key={v} type="button" aria-pressed={filtre === v} onClick={() => setFiltre(v)} className={`text-xs px-2 py-1 rounded border ${filtre === v ? 'border-primary text-primary' : 'border-border text-fg2'}`}>{l}</button>
            ))}
          </div>
        </div>
        {liste.length === 0 ? <p className="text-sm text-fg3">Rien à afficher.</p> : (
          <ol className="relative border-l border-border ml-2 space-y-4">
            {liste.map(e => <ElementChronologie key={`${e.type}-${e.id}`} e={e} jour={jour} />)}
          </ol>
        )}
      </section>
    </div>
  );
}

function Indicateur({ titre, valeur, detail, alerte }: { titre: string; valeur: string; detail: string; alerte?: boolean }) {
  return (
    <div className={`border rounded-md p-3 bg-bg2 ${alerte ? 'border-destructive' : 'border-border'}`}>
      <p className="text-xs text-fg3">{titre}</p>
      <p className="text-lg font-semibold">{valeur}</p>
      <p className={`text-xs ${alerte ? 'text-destructive' : 'text-fg2'} truncate`} title={detail}>{detail}</p>
    </div>
  );
}

function ElementChronologie({ e, jour }: { e: EvenementSuivi; jour: string }) {
  const icone = e.type === 'consultation' ? <Stethoscope className="h-3 w-3" /> : e.type === 'ordonnance' ? <FileText className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />;
  return (
    <li className="ml-4">
      <span className="absolute -left-2 mt-1 flex h-4 w-4 items-center justify-center rounded-full bg-bg3 border border-border text-primary">{icone}</span>
      <p className="text-xs text-fg3">{dateFr(e.date)}{e.type === 'consultation' && e.praticien ? ` · ${e.praticien}` : ''}</p>
      {e.type === 'consultation' && (
        <div className="text-sm">
          <p className="font-semibold">{e.motif || 'Consultation'}{e.statut !== 'cloturee' && <span className="ml-2 text-xs font-normal text-fg3">(brouillon)</span>}</p>
          {e.diagnostic && <p><span className="text-fg3">Diagnostic : </span>{e.diagnostic}</p>}
          {e.conduite && <p className="text-fg2 whitespace-pre-wrap"><span className="text-fg3">Conduite : </span>{e.conduite}</p>}
        </div>
      )}
      {e.type === 'ordonnance' && <p className="text-sm">Ordonnance <span className="font-mono text-xs text-primary">{e.numero}</span> · {e.medicaments} médicament(s)</p>}
      {e.type === 'controle' && (
        <p className="text-sm">Contrôle : {e.motif}{' '}
          <span className={`text-xs ${e.statut === 'prevu' && echeance(e.prevu_le, jour).etat === 'retard' ? 'text-destructive' : 'text-fg3'}`}>
            ({e.statut === 'prevu' ? echeance(e.prevu_le, jour).libelle.toLowerCase() : e.statut === 'realise' ? 'réalisé' : 'annulé'})
          </span>
        </p>
      )}
    </li>
  );
}

const L = 320, H = 140, M = { g: 34, d: 8, h: 8, b: 20 };

function CourbeConstante({ courbe }: { courbe: Courbe }) {
  const [min, max] = bornes(courbe);
  const dates = courbe.series.flatMap(s => s.points.map(p => Date.parse(p.date)));
  const t0 = Math.min(...dates), t1 = Math.max(...dates);
  const x = (d: string) => M.g + (t1 === t0 ? 0.5 : (Date.parse(d) - t0) / (t1 - t0)) * (L - M.g - M.d);
  const y = (v: number) => M.h + (1 - (v - min) / (max - min)) * (H - M.h - M.b);
  const pas = max - min > 20 ? 1 : 10;
  const graduations = [min, (min + max) / 2, max].map(v => Math.round(v * pas) / pas);
  const principale = courbe.series[0];
  const derniere = principale.points[principale.points.length - 1] ?? courbe.series[1]?.points.at(-1);
  const sens = tendance(principale.points);
  const Icone = sens === 'hausse' ? TrendingUp : sens === 'baisse' ? TrendingDown : Minus;
  const resume = courbe.series.map(s => `${s.libelle} : ${s.points.map(p => `${p.valeur} le ${dateFr(p.date)}`).join(', ')}`).join(' ; ');

  return (
    <figure className="border border-border rounded-md p-3">
      <figcaption className="flex justify-between items-baseline text-sm mb-1">
        <span className="font-semibold">{courbe.titre}</span>
        {derniere && <span className="flex items-center gap-1 text-fg2">
          {courbe.id === 'ta' && courbe.series[1]?.points.length ? `${principale.points.at(-1)?.valeur ?? '—'}/${courbe.series[1].points.at(-1)?.valeur}` : derniere.valeur.toLocaleString('fr-FR')} {courbe.unite}
          {sens && <Icone className="h-4 w-4" aria-label={sens} />}
        </span>}
      </figcaption>
      <svg viewBox={`0 0 ${L} ${H}`} className="w-full h-auto" role="img" aria-label={`${courbe.titre} — ${resume}`}>
        {courbe.normale && (
          <rect x={M.g} width={L - M.g - M.d} y={y(courbe.normale[1])} height={Math.max(0, y(courbe.normale[0]) - y(courbe.normale[1]))} className="fill-primary" opacity={0.08} />
        )}
        {graduations.map(v => (
          <g key={v} className="text-fg3">
            <line x1={M.g} x2={L - M.d} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity={0.2} />
            <text x={M.g - 4} y={y(v) + 3} textAnchor="end" fontSize={9} fill="currentColor">{v.toLocaleString('fr-FR')}</text>
          </g>
        ))}
        <g className="text-fg3" fontSize={9} fill="currentColor">
          <text x={M.g} y={H - 4}>{dateFr(new Date(t0).toISOString())}</text>
          {t1 !== t0 && <text x={L - M.d} y={H - 4} textAnchor="end">{dateFr(new Date(t1).toISOString())}</text>}
        </g>
        {courbe.series.map((s, i) => (
          <g key={s.cle} className={i === 0 ? 'text-primary' : 'text-fg2'}>
            <polyline fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray={i === 0 ? undefined : '4 3'} points={s.points.map(p => `${x(p.date)},${y(p.valeur)}`).join(' ')} />
            {s.points.map(p => <circle key={p.date} cx={x(p.date)} cy={y(p.valeur)} r={3} fill="currentColor"><title>{`${s.libelle} ${p.valeur.toLocaleString('fr-FR')} ${courbe.unite} — ${dateFr(p.date)}`}</title></circle>)}
          </g>
        ))}
      </svg>
      {courbe.series.length > 1 && <p className="text-xs text-fg3 mt-1">Trait plein : {courbe.series[0].libelle.toLowerCase()} · pointillé : {courbe.series[1].libelle.toLowerCase()}{courbe.normale ? ' · zone teintée : valeurs habituelles' : ''}</p>}
      {courbe.series.length === 1 && courbe.normale && <p className="text-xs text-fg3 mt-1">Zone teintée : valeurs habituelles</p>}
    </figure>
  );
}
