import Papa from 'papaparse';
import { protegerFormuleCsv } from '@/lib/impression';

// Import / export tableur des paramètres mesurés et valeurs de référence du catalogue d'analyses.
// Une ligne = une analyse (+ un paramètre, + une valeur de référence facultatifs).
// Le serveur refait tous les contrôles ; ceux-ci servent à montrer les erreurs avant l'envoi.

export const COLONNES = [
  'code_analyse', 'libelle_analyse', 'section', 'tube', 'echantillon', 'delai_heures', 'a_jeun', 'sensible',
  'code_parametre', 'libelle_parametre', 'unite', 'type', 'decimales',
  'sexe', 'age_min_ans', 'age_max_ans', 'bas', 'haut', 'critique_bas', 'critique_haut',
] as const;
export type Colonne = typeof COLONNES[number];
export type LigneImport = Record<Colonne, string>;

export const SECTIONS = ['biochimie', 'hematologie', 'serologie', 'bacteriologie', 'parasitologie', 'hormonologie', 'urines'];
const TYPES = ['numerique', 'qualitatif', 'texte'];

export interface AnalyseExport { id: string; code: string; libelle: string; section: string; tube: string | null; echantillon: string | null; delai_heures: number; jeune: boolean; sensible: boolean }
export interface ParametreExport { id: string; analyse_id: string; code: string; libelle: string; unite: string | null; type: string; decimales: number; ordre: number }
export interface ReferenceExport { parametre_id: string; sexe: string | null; age_min_jours: number; age_max_jours: number; bas: number | null; haut: number | null; critique_bas: number | null; critique_haut: number | null }

const nb = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','));
const ans = (jours: number) => String(Math.round(jours / 365.25));
const ouiNon = (b: boolean) => (b ? 'oui' : 'non');

/** Fichier pré-rempli : une ligne par valeur de référence existante, sinon par paramètre, sinon par analyse. */
export function construireModele(analyses: AnalyseExport[], parametres: ParametreExport[], references: ReferenceExport[]): string {
  const lignes: string[][] = [];
  for (const a of [...analyses].sort((x, y) => x.section.localeCompare(y.section) || x.code.localeCompare(y.code))) {
    const base = [a.code, a.libelle, a.section, a.tube ?? '', a.echantillon ?? '', String(a.delai_heures), ouiNon(a.jeune), ouiNon(a.sensible)];
    const ps = parametres.filter(p => p.analyse_id === a.id).sort((x, y) => x.ordre - y.ordre);
    if (!ps.length) { lignes.push([...base, '', '', '', '', '', '', '', '', '', '', '', '']); continue; }
    for (const p of ps) {
      const param = [p.code, p.libelle, p.unite ?? '', p.type, String(p.decimales)];
      const rs = references.filter(r => r.parametre_id === p.id);
      if (!rs.length) { lignes.push([...base, ...param, '', '', '', '', '', '', '']); continue; }
      for (const r of rs) lignes.push([...base, ...param, r.sexe ?? '', ans(r.age_min_jours), ans(r.age_max_jours), nb(r.bas), nb(r.haut), nb(r.critique_bas), nb(r.critique_haut)]);
    }
  }
  const securise = lignes.map(l => l.map(c => String(protegerFormuleCsv(c) ?? '')));
  return '﻿' + Papa.unparse({ fields: [...COLONNES], data: securise }, { delimiter: ';', newline: '\r\n' });
}

const nettoyer = (v: string | undefined) => (v ?? '').trim().replace(/^'(?=[\t\r ]*[=+\-@])/, '');
const estNombre = (v: string) => !v || Number.isFinite(Number(v.replace(',', '.')));
const nombre = (v: string) => (v ? Number(v.replace(',', '.')) : null);

export interface Analyse { lignes: LigneImport[]; erreurs: string[]; analyses: number; parametres: number; references: number }

/** Lit le fichier rempli (séparateur ; ou , détecté), contrôle chaque ligne et renvoie ce qui sera envoyé. */
export function lireFichier(texte: string, codesConnus: string[]): Analyse {
  const parsed = Papa.parse<string[]>(texte.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy', delimiter: '' });
  if (parsed.errors.length && !parsed.data.length) throw new Error('Fichier illisible : ' + parsed.errors[0].message);
  const [entete, ...corps] = parsed.data;
  const cols = (entete ?? []).map(c => c.trim().toLowerCase());
  const manquantes = ['code_analyse', 'code_parametre'].filter(c => !cols.includes(c));
  if (manquantes.length) throw new Error(`Colonnes obligatoires absentes : ${manquantes.join(', ')}. Partez du modèle téléchargé.`);
  const connus = new Set(codesConnus.map(c => c.trim().toUpperCase()));
  const erreurs: string[] = [], lignes: LigneImport[] = [];
  const an = new Set<string>(), pa = new Set<string>(); let refs = 0;
  corps.forEach((brut, i) => {
    const n = i + 2;
    const l = Object.fromEntries(COLONNES.map(c => [c, nettoyer(cols.includes(c) ? brut[cols.indexOf(c)] : '')])) as LigneImport;
    if (!Object.values(l).some(Boolean)) return;
    const err = (m: string) => erreurs.push(`Ligne ${n} : ${m}`);
    const code = l.code_analyse.toUpperCase();
    if (!code) return err('code_analyse vide.');
    if (!connus.has(code)) return err(`analyse « ${l.code_analyse} » absente du catalogue (les nouvelles analyses se créent dans l'écran).`);
    if (l.section && !SECTIONS.includes(l.section.toLowerCase())) err(`section « ${l.section} » inconnue (${SECTIONS.join(', ')}).`);
    if (l.delai_heures && !(Number.isInteger(Number(l.delai_heures)) && Number(l.delai_heures) > 0)) err('délai en heures entier positif attendu.');
    for (const c of ['a_jeun', 'sensible'] as const) if (l[c] && !['oui', 'non'].includes(l[c].toLowerCase())) err(`${c} : « oui » ou « non » attendu.`);
    an.add(code);
    const aRef = !!(l.bas || l.haut || l.critique_bas || l.critique_haut);
    if (!l.code_parametre) { if (aRef || l.unite || l.libelle_parametre) err('valeurs de paramètre sans code_parametre.'); else lignes.push({ ...l, code_analyse: code }); return; }
    const type = (l.type || 'numerique').toLowerCase();
    if (!TYPES.includes(type)) err(`type « ${l.type} » inconnu (numerique, qualitatif, texte).`);
    if (l.decimales && !(Number.isInteger(Number(l.decimales)) && Number(l.decimales) >= 0 && Number(l.decimales) <= 4)) err('décimales entre 0 et 4.');
    pa.add(`${code}/${l.code_parametre.toUpperCase()}`);
    if (aRef) {
      if (type !== 'numerique') err('valeurs de référence réservées aux paramètres numériques.');
      for (const c of ['age_min_ans', 'age_max_ans', 'bas', 'haut', 'critique_bas', 'critique_haut'] as const) if (!estNombre(l[c])) err(`${c} : nombre attendu (« ${l[c]} »).`);
      if (l.sexe && !['M', 'F'].includes(l.sexe.toUpperCase())) err('sexe : M, F ou vide.');
      const [bas, haut, cb, ch] = [l.bas, l.haut, l.critique_bas, l.critique_haut].map(nombre);
      const [amin, amax] = [nombre(l.age_min_ans) ?? 0, nombre(l.age_max_ans) ?? 150];
      if (bas == null && haut == null) err('au moins une borne normale (bas ou haut) est attendue.');
      if (bas != null && haut != null && bas > haut) err('bas supérieur à haut.');
      if (cb != null && ch != null && cb > ch) err('critique_bas supérieur à critique_haut.');
      if (cb != null && bas != null && cb > bas) err('critique_bas doit être inférieur ou égal à bas.');
      if (ch != null && haut != null && ch < haut) err('critique_haut doit être supérieur ou égal à haut.');
      if (amin < 0 || amax > 150 || amin > amax) err('tranche d’âge invalide (0 à 150 ans).');
      refs++;
    }
    lignes.push({ ...l, code_analyse: code, code_parametre: l.code_parametre.toUpperCase(), type, sexe: l.sexe.toUpperCase(), section: l.section.toLowerCase(), a_jeun: l.a_jeun.toLowerCase(), sensible: l.sensible.toLowerCase() });
  });
  return { lignes, erreurs, analyses: an.size, parametres: pa.size, references: refs };
}
