import { useEffect, useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { chercherCim10, type Cim10 } from './cim10-client';

type Rechercher = (q: string) => Promise<{ data: Cim10[] | null; error: { message: string } | null }>;

/** Champ de recherche CIM-10 (code ou mots, sans tenir compte des accents) avec liste de propositions. */
export default function RechercheCim10({ onChoisir, placeholder = 'Code ou mots (ex. I10, paludisme)', disabled, rechercher = chercherCim10 }: { onChoisir: (c: Cim10) => void; placeholder?: string; disabled?: boolean; rechercher?: Rechercher }) {
  const id = useId();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Cim10[]>([]);
  const [etat, setEtat] = useState<'repos' | 'recherche' | 'vide' | 'indisponible'>('repos');
  const [actif, setActif] = useState(0);

  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); setEtat('repos'); return; }
    let vivant = true;
    setEtat('recherche');
    const t = setTimeout(async () => {
      const { data, error } = await rechercher(q.trim());
      if (!vivant) return;
      if (error) { setRes([]); setEtat('indisponible'); return; }
      setRes(data ?? []); setActif(0); setEtat((data ?? []).length ? 'repos' : 'vide');
    }, 250);
    return () => { vivant = false; clearTimeout(t); };
  }, [q, rechercher]);

  const choisir = (c: Cim10) => { onChoisir(c); setQ(''); setRes([]); };
  return (
    <div className="relative">
      <Input id={id} role="combobox" aria-expanded={res.length > 0} aria-controls={`${id}-liste`} aria-autocomplete="list" disabled={disabled}
        placeholder={placeholder} value={q} onChange={e => setQ(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActif(a => Math.min(a + 1, res.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActif(a => Math.max(a - 1, 0)); }
          if (e.key === 'Enter' && res[actif]) { e.preventDefault(); choisir(res[actif]); }
          if (e.key === 'Escape') setRes([]);
        }} />
      {res.length > 0 && (
        <ul id={`${id}-liste`} role="listbox" className="absolute z-20 w-full bg-bg2 border border-border rounded-md mt-1 max-h-64 overflow-auto shadow-lg">
          {res.map((c, i) => (
            <li key={c.code} role="option" aria-selected={i === actif}>
              <button type="button" className={`w-full text-left px-2 py-1.5 text-sm hover:bg-bg3 ${i === actif ? 'bg-bg3' : ''}`} onMouseEnter={() => setActif(i)} onClick={() => choisir(c)}>
                <span className="font-mono text-xs text-primary mr-2">{c.code}</span>{c.libelle}{c.dans_specialite === false && <span className="ml-2 text-xs text-warning">hors spécialité</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {etat === 'vide' && <p className="text-xs text-fg3 mt-1">Aucun code trouvé.</p>}
      {etat === 'indisponible' && <p className="text-xs text-fg3 mt-1">Référentiel CIM-10 indisponible pour le moment : le diagnostic en texte libre suffit.</p>}
    </div>
  );
}
