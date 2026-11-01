/**
 * Impression / PDF de la liasse SYSCOHADA révisé (système normal) sur la contexture du modèle DGID et
 * des plaquettes « États comptables et fiscaux » : pages de garde (page de garde, fiches R1 à R4),
 * bilan, compte de résultat, tableau des flux de trésorerie et notes annexes 1 à 36.
 *
 * La mise en page de chaque onglet du modèle est extraite une fois pour toutes
 * (scripts/generer-pages-dgid.py → public/modeles/etats-financiers-dgid-pages.json) ; les montants
 * viennent de la liasse calculée depuis la balance (liasse-dgid.ts), la même que pour l'export Excel.
 * Noir et blanc ; mention « ÉTATS PROVISOIRES » tant qu'un contrôle bloquant échoue.
 */
import { calculerLiasse, evaluerFormule, type CellulesLiasse, type DonneesDgid, type ValeurLiasse } from './liasse-dgid';
import { escapeHtml as h } from './impression';

export type EtatPlaquette = 'garde' | 'bilan' | 'cr' | 'tft' | 'notes';
export const PAGES_DGID = 'modeles/etats-financiers-dgid-pages.json';

export interface PageModele { id: number; nom: string; paysage: boolean; largeur: number; hauteur: number; html: string; css: string; formules: Record<string, string> }
export interface PagesModele { pages: PageModele[]; statiques: Record<string, Record<string, string>> }

const GARDE = ['Page de garde', 'Fiche de renseignement R1', "Activités de l'entreprise R2", 'Dirigeants R3', 'Tableau des Notes R4'];
const ONGLETS: Record<Exclude<EtatPlaquette, 'notes'>, string[]> = { garde: GARDE, bilan: ['BILAN PAYSAGE'], cr: ['COMPTE DE RESULTAT'], tft: ['FLUX DE TRESORERIE'] };

const nombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
/** Montant au format de la plaquette : séparateur de milliers espace, négatif avec « - », zéro vide. */
export const montant = (x: number | undefined) => {
  const v = Math.round(x ?? 0);
  return v === 0 ? '' : (v < 0 ? '-' : '') + nombre.format(Math.abs(v)).replace(/\s/g, ' ');
};
export const dateFr = (d: Date | string) => {
  if (typeof d === 'string') { const [a, m, j] = d.slice(0, 10).split('-'); return `${j}/${m}/${a}`; }
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
};

function selectionner(pages: PageModele[], etats: EtatPlaquette[]): PageModele[] {
  const noms = new Set<string>();
  for (const e of etats) {
    if (e === 'notes') pages.filter(p => p.nom.startsWith('Note ')).forEach(p => noms.add(p.nom));
    else ONGLETS[e].forEach(n => noms.add(n));
  }
  return pages.filter(p => noms.has(p.nom));
}

/** Valeur affichée d'une cellule : calculée, sinon formule du modèle, sinon texte du modèle. */
function lecteur(modele: PagesModele, cellules: CellulesLiasse) {
  const formules = new Map(modele.pages.map(p => [p.nom, p.formules]));
  const cache = new Map<string, number | string | null>();
  const lire = (feuille: string, addr: string, profondeur = 0): number | string | null => {
    const cle = `${feuille}!${addr}`;
    if (cache.has(cle)) return cache.get(cle)!;
    let v: number | string | null;
    const calcule: ValeurLiasse | undefined = cellules[feuille]?.[addr];
    if (calcule !== undefined) v = calcule instanceof Date ? dateFr(calcule) : calcule;
    else {
      const f = formules.get(feuille)?.[addr];
      const r = f && profondeur < 8 ? evaluerFormule(f, feuille, (o, a) => lire(o, a, profondeur + 1)) : undefined;
      v = r === undefined ? (modele.statiques[feuille]?.[addr] ?? null) : r;
    }
    cache.set(cle, v);
    return v;
  };
  return lire;
}

const afficher = (v: number | string | null) => typeof v === 'number' ? montant(v) : h(String(v ?? '')).replace(/\n/g, '<br>');

/** Document HTML complet de la liasse (testable sans navigateur). */
export function htmlLiasse(modele: PagesModele, d: DonneesDgid, etats: EtatPlaquette[]): string {
  const { cellules, provisoire } = calculerLiasse(d);
  const lire = lecteur(modele, cellules);
  const pages = selectionner(modele.pages, etats);
  const corps = pages.map(p => {
    const html = p.html.replace(/(<td data-a="([A-Z]+\d+)"[^>]*>)([\s\S]*?)(<\/td>)/g, (tout, ouverture: string, addr: string, _contenu: string, fermeture: string) => {
      const calcule = cellules[p.nom]?.[addr] !== undefined || p.formules[addr] !== undefined;
      if (!calcule) return tout;
      const v = lire(p.nom, addr);
      const num = typeof v === 'number';
      const o = num && !/text-align/.test(ouverture) ? ouverture.replace(/>$/, ' style="text-align:right">') : ouverture;
      return `${o}${afficher(v)}${fermeture}`;
    });
    // Zone imprimable A4 (marges 8 mm) à 96 ppp, comme l'ajustement « une page » du modèle.
    const paysage = p.paysage || p.largeur > p.hauteur * 1.15;
    const [l, hMax] = paysage ? [1050, 715] : [715, 1050];
    const zoom = Math.min(1, l / p.largeur, hMax / (p.hauteur + 40));
    return `<section class="page p${p.id}${paysage ? ' paysage' : ''}"><div class="echelle" style="zoom:${zoom.toFixed(3)}">${html}</div>`
      + `${provisoire.length ? '<div class="provisoire">ÉTATS PROVISOIRES</div>' : ''}</section>`;
  }).join('');
  const css = pages.map(p => p.css).join('');
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>États financiers ${h(d.entreprise.nom)} ${d.exercice.annee}</title><style>
  @page { size: A4 portrait; margin: 8mm; }
  @page paysage { size: A4 landscape; margin: 8mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Calibri, Carlito, Arial, sans-serif; color: #000; background: #fff; }
  .page { position: relative; break-after: page; overflow: hidden; }
  .page:last-child { break-after: auto; }
  .paysage { page: paysage; }
  table.feuille { border-collapse: collapse; table-layout: fixed; }
  table.feuille td { padding: 1px 3px; font-size: 8pt; white-space: nowrap; overflow: visible; vertical-align: bottom; line-height: 1.15; }
  .provisoire { position: absolute; top: 40%; left: 0; right: 0; text-align: center; font-size: 48pt; font-weight: bold; color: rgba(0,0,0,.07); transform: rotate(-25deg); pointer-events: none; }
  .barre { text-align: center; padding: 8px; font-family: Arial, sans-serif; }
  @media screen { body { background: #eee; } .page { background: #fff; width: 210mm; min-height: 280mm; margin: 8px auto; padding: 8mm; box-shadow: 0 0 3px #999; } .paysage { width: 297mm; min-height: 200mm; } }
  @media print { .barre { display: none; } }
  ${css}
</style></head><body><div class="barre"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button>${provisoire.length ? ` — États provisoires (contrôles non satisfaits : ${h(provisoire.join(', '))})` : ''}</div>${corps}</body></html>`;
}

let modeleCharge: Promise<PagesModele> | null = null;
export function chargerPagesModele(): Promise<PagesModele> {
  modeleCharge ??= fetch(`${import.meta.env.BASE_URL}${PAGES_DGID}`).then(r => {
    if (!r.ok) throw new Error('Mise en page DGID introuvable');
    return r.json() as Promise<PagesModele>;
  }).catch(e => { modeleCharge = null; throw e; });
  return modeleCharge;
}

/** Ouvre la fenêtre d'impression ; la fenêtre est ouverte tout de suite (bloqueur de fenêtres), puis remplie. */
export async function imprimerEtatsFinanciers(d: DonneesDgid, etats: EtatPlaquette[]) {
  const w = window.open('', '_blank', 'width=1100,height=800');
  if (!w) { alert('Veuillez autoriser les fenêtres surgissantes pour imprimer les états.'); return; }
  w.document.write('<p style="font-family:Arial;padding:16px">Préparation de la liasse…</p>');
  try {
    const html = htmlLiasse(await chargerPagesModele(), d, etats);
    w.document.open(); w.document.write(html); w.document.close();
  } catch (e) {
    w.document.body.textContent = e instanceof Error ? e.message : 'Impression impossible';
  }
}
