/**
 * Mobile Money (Wave, Orange Money, Free Money…) : écritures de banque et lecture des relevés CSV.
 *
 * Convention : `montant` est le montant de l'opération (payé par le client ou versé au fournisseur), `frais` la
 * commission de l'opérateur. À l'encaissement, l'opérateur prélève ses frais sur ce qu'il reverse : le compte
 * Mobile Money reçoit montant − frais et la créance client est soldée du montant payé. Au décaissement, les frais
 * s'ajoutent à la sortie.
 */
export interface OperationMM {
  date_operation: string;
  sens: 'entree' | 'sortie';
  montant: number;
  frais: number;
  reference: string | null;
  contrepartie: string | null;
  telephone: string | null;
  libelle: string | null;
}

export interface LigneMM { compte: string; intitule: string; libelle: string; debit: number; credit: number }

export const COMPTE_FRAIS_MM = '6318';

/** Variation du solde Mobile Money produite par une opération. */
export const effetSolde = (t: Pick<OperationMM, 'sens' | 'montant' | 'frais'>) =>
  t.sens === 'entree' ? Number(t.montant) - Number(t.frais) : -(Number(t.montant) + Number(t.frais));

export function lignesMobileMoney(
  t: OperationMM,
  moyen: { compte_associe: string; libelle: string },
  contrepartie: { compte: string; intitule: string },
  libelle: string,
  libelleFrais: string,
): LigneMM[] {
  const m = Number(t.montant), f = Number(t.frais) || 0;
  if (!(m > 0) || f < 0 || (t.sens === 'entree' && f >= m)) throw new Error('Montant ou frais incohérents');
  const mm = (debit: number, credit: number, lib = libelle): LigneMM => ({ compte: moyen.compte_associe, intitule: moyen.libelle, libelle: lib, debit, credit });
  const frais: LigneMM = { compte: COMPTE_FRAIS_MM, intitule: 'Autres frais bancaires', libelle: libelleFrais, debit: f, credit: 0 };
  const tiers = (debit: number, credit: number): LigneMM => ({ compte: contrepartie.compte, intitule: contrepartie.intitule, libelle, debit, credit });
  if (t.sens === 'entree') return [mm(m - f, 0), ...(f ? [frais] : []), tiers(0, m)];
  return [tiers(m, 0), ...(f ? [frais] : []), mm(0, m + f)];
}

const montantTexte = (v: string) => {
  const n = Number((v || '').replace(/[\s  ]/g, '').replace(/[^\d,.-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

/** Découpe une ligne CSV (séparateur unique, guillemets doubles). */
function decouper(ligne: string, sep: string): string[] {
  const res: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"') { if (q && ligne[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === sep && !q) { res.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  res.push(cur.trim());
  return res;
}

/** Relevé CSV d'opérateur → opérations ; colonnes reconnues par leur en-tête. */
export function lireCsvMobileMoney(texte: string): { operations: OperationMM[]; erreurs: string[] } {
  const lignes = texte.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (lignes.length < 2) return { operations: [], erreurs: ['Fichier vide'] };
  const entete = lignes[0];
  const sep = [';', '\t', ','].map(s => [s, entete.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const h = decouper(entete, sep).map(x => x.toLowerCase());
  const col = (re: RegExp) => h.findIndex(x => re.test(x));
  const idx = {
    date: col(/date|jour/), montant: col(/montant|amount/), sens: col(/sens|type|direction/),
    ref: col(/r[ée]f|transaction|txn|^id$/), contrep: col(/contrep|counterpart|nom|client/), tel: col(/t[ée]l|phone|num[ée]ro/),
    lib: col(/libel|desc|motif/), frais: col(/frais|fee|commission/),
  };
  if (idx.date < 0 || idx.montant < 0) return { operations: [], erreurs: ['Colonnes « date » et « montant » requises'] };
  const operations: OperationMM[] = []; const erreurs: string[] = [];
  lignes.slice(1).forEach((l, i) => {
    const c = decouper(l, sep);
    const brut = montantTexte(c[idx.montant]);
    const fr = idx.frais >= 0 ? montantTexte(c[idx.frais] || '0') : 0;
    const d = (c[idx.date] || '').match(/^(\d{2})[/.-](\d{2})[/.-](\d{4})/) ?? (c[idx.date] || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    const date = !d ? '' : d[1].length === 4 ? `${d[1]}-${d[2]}-${d[3]}` : `${d[3]}-${d[2]}-${d[1]}`;
    if (!date || Number.isNaN(Date.parse(date))) { erreurs.push(`Ligne ${i + 2} : date illisible`); return; }
    if (!Number.isFinite(brut) || brut === 0 || !Number.isFinite(fr) || fr < 0) { erreurs.push(`Ligne ${i + 2} : montant illisible`); return; }
    let sens: 'entree' | 'sortie' = brut < 0 ? 'sortie' : 'entree';
    if (idx.sens >= 0 && c[idx.sens]) sens = /sortie|d[ée]bit|out|envoi|paiement|retrait/i.test(c[idx.sens]) ? 'sortie' : 'entree';
    operations.push({
      date_operation: date, sens, montant: Math.abs(brut), frais: Math.abs(fr),
      reference: idx.ref >= 0 ? c[idx.ref] || null : null, contrepartie: idx.contrep >= 0 ? c[idx.contrep] || null : null,
      telephone: idx.tel >= 0 ? c[idx.tel] || null : null, libelle: idx.lib >= 0 ? c[idx.lib] || null : null,
    });
  });
  return { operations, erreurs };
}

/** Clé de doublon : même moyen, date, sens, montant et référence. */
export const cleOperation = (moyenId: string, t: Pick<OperationMM, 'date_operation' | 'sens' | 'montant' | 'reference'>) =>
  [moyenId, t.date_operation, t.sens, Math.round(Number(t.montant) * 100), (t.reference || '').trim().toLowerCase()].join('|');
