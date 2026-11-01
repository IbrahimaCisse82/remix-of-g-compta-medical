/**
 * Export Excel des états financiers au format du modèle DGID (Sénégal, SYSCOHADA révisé, système normal).
 *
 * Le classeur officiel (public/modeles/etats-financiers-dgid.xlsx) est modifié directement dans son XML :
 * seules les cellules de valeurs (montants en face des références AD, CA, TA, ZA…) et d'identification
 * sont réécrites, tout le reste (mises en forme, formules, notes annexes) est conservé à l'identique.
 * Les données d'exemple du modèle (RCCM, banque, « X »…) sont effacées. Les notes annexes restent à
 * compléter dans le classeur.
 *
 * Pourquoi pas une bibliothèque de tableur : relire puis réécrire les 55 onglets du modèle bloquait
 * le navigateur plusieurs minutes ; la retouche du XML prend moins d'une seconde.
 */
import type JSZip from 'jszip';
import { calc, calculateActif, CR, PASSIF, type BalanceLine, type Entreprise, type Exercice } from './accounting';
import { controlesSyscohada } from './conformite-syscohada';
import { calculerTft } from './tft-syscohada';

export const MODELE_DGID = 'modeles/etats-financiers-dgid.xlsx';

export interface DonneesDgid {
  entreprise: Entreprise;
  exercice: Exercice;
  balance: BalanceLine[];
  balanceN1: BalanceLine[];
}

type Valeur = number | string | Date | null;

const date = (iso: string) => { const [a, m, j] = iso.slice(0, 10).split('-').map(Number); return new Date(Date.UTC(a, m - 1, j)); };
export function dureeMois(debut: string, fin: string): number {
  const d = date(debut), f = date(fin);
  f.setUTCDate(f.getUTCDate() + 1);
  return (f.getUTCFullYear() - d.getUTCFullYear()) * 12 + f.getUTCMonth() - d.getUTCMonth();
}
const arrondi = (x: number | undefined) => Math.round(x ?? 0);
const serieExcel = (d: Date) => Math.round((d.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000);
const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const desechapper = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const numeroColonne = (lettres: string) => [...lettres].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
const decouper = (addr: string) => { const m = /^([A-Z]+)(\d+)$/.exec(addr)!; return { col: m[1], ligne: Number(m[2]) }; };
const motifCellule = (addr: string) => new RegExp(`<c r="${addr}"(?=[ />])([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`);

/** Accès minimal en lecture/écriture aux cellules d'un classeur .xlsx. */
export class Classeur {
  private xml = new Map<string, string>();
  private constructor(private zip: JSZip, private chemins: Map<string, string>, private partages: string[]) {}

  static async ouvrir(donnees: ArrayBuffer | Uint8Array): Promise<Classeur> {
    const { default: Zip } = await import('jszip');
    const zip = await Zip.loadAsync(donnees);
    const wb = await zip.file('xl/workbook.xml')!.async('string');
    const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
    const cibles = new Map([...rels.matchAll(/<Relationship [^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g)].map(m => [m[1], m[2]]));
    const chemins = new Map([...wb.matchAll(/<sheet name="([^"]+)"[^>]*?r:id="([^"]+)"/g)]
      .map(m => [desechapper(m[1]), `xl/${cibles.get(m[2])!.replace(/^\/?xl\//, '')}`]));
    const ss = (await zip.file('xl/sharedStrings.xml')?.async('string')) ?? '';
    const partages = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => desechapper([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')));
    const c = new Classeur(zip, chemins, partages);
    for (const [nom, chemin] of chemins) c.xml.set(nom, await zip.file(chemin)!.async('string'));
    return c;
  }

  onglets() { return [...this.chemins.keys()]; }

  /** Valeur affichée d'une cellule (pour une formule : sa valeur en cache). */
  lire(onglet: string, addr: string): string | number | null {
    const m = motifCellule(addr).exec(this.xml.get(onglet) ?? '');
    if (!m || !m[2]) return null;
    const t = /\bt="([^"]+)"/.exec(m[1])?.[1];
    if (t === 'inlineStr') return desechapper([...m[2].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''));
    const v = /<v>([\s\S]*?)<\/v>/.exec(m[2])?.[1];
    if (v === undefined) return null;
    if (t === 's') return this.partages[Number(v)] ?? null;
    if (t === 'str' || t === 'e') return desechapper(v);
    if (t === 'b') return Number(v);
    return Number(v);
  }

  ecrire(onglet: string, addr: string, valeur: Valeur) {
    let xml = this.xml.get(onglet);
    if (xml === undefined) return;
    const v = valeur instanceof Date ? serieExcel(valeur) : valeur;
    const motif = motifCellule(addr);
    const m = motif.exec(xml);
    const style = m ? (/\bs="\d+"/.exec(m[1])?.[0] ?? '') : '';
    const attrs = `${style ? ` ${style}` : ''}${typeof v === 'string' ? ' t="inlineStr"' : ''}`;
    const contenu = v === null || v === '' ? '' : typeof v === 'string' ? `<is><t xml:space="preserve">${echapper(v)}</t></is>` : `<v>${v}</v>`;
    const cellule = contenu ? `<c r="${addr}"${attrs}>${contenu}</c>` : `<c r="${addr}"${attrs}/>`;
    if (m) { this.xml.set(onglet, xml.replace(motif, cellule)); return; }
    if (!contenu) return;
    // Cellule absente : insertion à sa place dans la ligne (créée au besoin).
    const { col, ligne } = decouper(addr);
    const motifLigne = new RegExp(`<row r="${ligne}"(?=[ >/])([^>]*?)(?:/>|>([\\s\\S]*?)</row>)`);
    const l = motifLigne.exec(xml);
    if (l) {
      const cellules = l[2] ?? '';
      const avant = [...cellules.matchAll(/<c r="([A-Z]+)\d+"/g)].find(x => numeroColonne(x[1]) > numeroColonne(col));
      const nouvelles = avant ? cellules.slice(0, avant.index) + cellule + cellules.slice(avant.index) : cellules + cellule;
      xml = xml.replace(motifLigne, `<row r="${ligne}"${l[1].replace(/\/$/, '')}>${nouvelles}</row>`);
    } else {
      const suivante = [...xml.matchAll(/<row r="(\d+)"/g)].find(x => Number(x[1]) > ligne);
      const rangee = `<row r="${ligne}">${cellule}</row>`;
      xml = suivante ? xml.slice(0, suivante.index) + rangee + xml.slice(suivante.index) : xml.replace('</sheetData>', `${rangee}</sheetData>`).replace('<sheetData/>', `<sheetData>${rangee}</sheetData>`);
    }
    this.xml.set(onglet, xml);
  }

  /**
   * Les renvois simples du modèle (ex. ='Page de garde'!L35) reçoivent leur valeur en cache : un
   * lecteur qui ne recalcule pas à l'ouverture (LibreOffice, aperçus) affiche ainsi l'identification.
   */
  resoudreRenvois() {
    const renvoi = /^\+?(?:'?([^'!]+)'?!)?\$?([A-Z]{1,3})\$?(\d+)$/;
    for (let passe = 0; passe < 3; passe++) {
      for (const onglet of this.onglets()) {
        const xml = this.xml.get(onglet)!;
        const nouveau = xml.replace(/<c r="([A-Z]+\d+)"([^>]*?)><f>([^<]*)<\/f>(?:<v>[\s\S]*?<\/v>)?<\/c>/g, (tout, addr: string, attrs: string, f: string) => {
          const m = renvoi.exec(desechapper(f));
          if (!m) return tout;
          const cible = this.lire(m[1] ? desechapper(m[1]) : onglet, `${m[2]}${m[3]}`);
          const sansType = attrs.replace(/\s*\bt="[^"]*"/, '');
          if (cible === null || cible === '') return `<c r="${addr}"${sansType}><f>${f}</f></c>`;
          return typeof cible === 'number'
            ? `<c r="${addr}"${sansType}><f>${f}</f><v>${cible}</v></c>`
            : `<c r="${addr}"${sansType} t="str"><f>${f}</f><v>${echapper(cible)}</v></c>`;
        });
        this.xml.set(onglet, nouveau);
      }
    }
  }

  async enregistrer(): Promise<Uint8Array> {
    for (const [nom, chemin] of this.chemins) this.zip.file(chemin, this.xml.get(nom)!);
    const wb = await this.zip.file('xl/workbook.xml')!.async('string');
    this.zip.file('xl/workbook.xml', /<calcPr\b/.test(wb)
      ? wb.replace(/<calcPr\b([^>]*?)\s*\/>/, (_t, a: string) => `<calcPr${a.replace(/\s*fullCalcOnLoad="[^"]*"/, '')} fullCalcOnLoad="1"/>`)
      : wb.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>'));
    return this.zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }
}

/** Écrit les montants d'un état : colonne des références → colonnes de valeurs. */
function remplirParReference(c: Classeur, onglet: string, colRef: string, valeurs: Record<string, number | undefined>[], colonnes: string[], lignes: [number, number]) {
  for (let r = lignes[0]; r <= lignes[1]; r++) {
    const ref = String(c.lire(onglet, `${colRef}${r}`) ?? '').trim();
    if (!/^[A-Z]{2}$/.test(ref)) continue;
    colonnes.forEach((col, i) => c.ecrire(onglet, `${col}${r}`, arrondi(valeurs[i][ref])));
  }
}

const R1_EXEMPLES = ['W24', 'G28', 'Q36', 'Y36', 'AA36', 'AE36', 'D48', 'D52', 'D56', 'S64', 'AK64', 'D69', 'T71', 'AD71', 'D72', 'D75'];
const R2_EXEMPLES = ['F14', 'G14', 'F16', 'G16', 'F18', 'G18', 'F20', 'G20', 'F22', 'G22', 'E25', 'F25', 'G25', 'H25', 'Q16', 'B33', 'D33', 'E33', 'F33', 'G33', 'H33', 'I33', 'M33'];

/** Remplit le modèle ; renvoie le fichier et les contrôles bloquants non satisfaits (états alors marqués provisoires). */
export async function genererClasseurDgid(modele: ArrayBuffer | Uint8Array, d: DonneesDgid): Promise<{ fichier: Uint8Array; provisoire: string[] }> {
  const { entreprise: e, exercice: x, balance, balanceN1 } = d;
  const n1 = balanceN1.length > 0;
  const aN = calculateActif(balance), aN1 = calculateActif(balanceN1);
  const pN = calc(balance, PASSIF), pN1 = calc(balanceN1, PASSIF);
  const crN = calc(balance, CR), crN1 = calc(balanceN1, CR);
  const provisoire = controlesSyscohada(balance, balanceN1).filter(c => c.bloquant && !c.ok).map(c => c.code);
  const tN = calculerTft(balance).valeurs, tN1 = n1 ? calculerTft(balanceN1).valeurs : {};
  const c = await Classeur.ouvrir(modele);

  const PG = 'Page de garde';
  c.ecrire(PG, 'B17', 'CENTRE DE DEPOT : ');
  if (provisoire.length) c.ecrire(PG, 'B19', `ÉTATS PROVISOIRES — contrôles non satisfaits : ${provisoire.join(', ')}`);
  c.ecrire(PG, 'M27', date(x.date_fin));
  c.ecrire(PG, 'L35', e.nom || '');
  c.ecrire(PG, 'H41', e.sigle || '');
  c.ecrire(PG, 'J46', e.adresse || '');
  c.ecrire(PG, 'N51', e.ninea || '');

  const R1 = 'Fiche de renseignement R1';
  const veille = date(x.date_debut); veille.setUTCDate(veille.getUTCDate() - 1);
  c.ecrire(R1, 'AH10', dureeMois(x.date_debut, x.date_fin));
  c.ecrire(R1, 'Y13', date(x.date_debut));
  c.ecrire(R1, 'AH13', date(x.date_fin));
  c.ecrire(R1, 'Q20', n1 ? veille : null);
  c.ecrire(R1, 'AL20', n1 ? 12 : null);
  c.ecrire(R1, 'I24', e.rccm || null);
  c.ecrire(R1, 'G36', e.tel || null);
  c.ecrire(R1, 'D40', e.adresse || null);
  c.ecrire(R1, 'D44', e.secteur || null);
  for (const a of R1_EXEMPLES) c.ecrire(R1, a, null);
  for (const a of R2_EXEMPLES) c.ecrire("Activités de l'entreprise R2", a, null);

  for (const o of ['BILAN PAYSAGE', 'COMPTE DE RESULTAT', 'FLUX DE TRESORERIE']) c.ecrire(o, 'A4', e.nom || '');
  remplirParReference(c, 'BILAN PAYSAGE', 'A', [aN.brut, aN.amort, aN.net, n1 ? aN1.net : {}], ['D', 'E', 'F', 'G'], [9, 37]);
  remplirParReference(c, 'BILAN PAYSAGE', 'H', [pN, n1 ? pN1 : {}], ['K', 'L'], [9, 37]);
  remplirParReference(c, 'COMPTE DE RESULTAT', 'A', [crN, n1 ? crN1 : {}], ['E', 'F'], [8, 49]);
  remplirParReference(c, 'FLUX DE TRESORERIE', 'A', [tN, tN1], ['E', 'F'], [8, 37]);
  for (let r = 8; r <= 37; r++) {
    if (String(c.lire('FLUX DE TRESORERIE', `B${r}`) ?? '').startsWith('Variation du BF')) {
      c.ecrire('FLUX DE TRESORERIE', `E${r}`, arrondi(tN.VO));
      c.ecrire('FLUX DE TRESORERIE', `F${r}`, n1 ? arrondi(tN1.VO) : 0);
    }
  }
  c.resoudreRenvois();
  return { fichier: await c.enregistrer(), provisoire };
}

/** Télécharge le modèle, le remplit et propose le fichier à l'utilisateur. */
export async function exporterEtatsDgid(d: DonneesDgid): Promise<string[]> {
  const reponse = await fetch(`${import.meta.env.BASE_URL}${MODELE_DGID}`);
  if (!reponse.ok) throw new Error('Modèle DGID introuvable');
  const { fichier, provisoire } = await genererClasseurDgid(await reponse.arrayBuffer(), d);
  const url = URL.createObjectURL(new Blob([fichier], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `etats_financiers_DGID_${(d.entreprise.sigle || d.entreprise.nom || 'entite').replace(/[^\w-]+/g, '_')}_${d.exercice.annee}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return provisoire;
}
