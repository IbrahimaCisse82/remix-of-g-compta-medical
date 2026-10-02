/**
 * Export FEC officiel (Fichier des Écritures Comptables)
 * Conforme aux exigences OHADA / Administration fiscale
 * Format: TXT pipe-separated (|), encodage UTF-8, 18 colonnes normalisées.
 *
 * Correctifs d'intégrité (Lot 1 de la feuille de route) :
 *  - EcritureNum repris de la numérotation serveur persistante (ecriture_numero)
 *    quand elle existe ; le recomptage par pièce ne sert que de repli.
 *  - CompAuxNum / CompAuxLib alimentés par le compte auxiliaire de la ligne.
 *  - Rapport de contrôle produit avant téléchargement.
 *
 * Colonnes :
 *  1  JournalCode   2  JournalLib    3  EcritureNum    4  EcritureDate (AAAAMMJJ)
 *  5  CompteNum     6  CompteLib     7  CompAuxNum     8  CompAuxLib
 *  9  PieceRef     10  PieceDate    11  EcritureLib   12  Debit
 * 13  Credit       14  EcritureLet  15  DateLet       16  ValidDate (AAAAMMJJ)
 * 17  Montantdevise 18  Idevise
 */

export interface FecLine {
  date_ecriture: string;
  piece: string;
  journal_code: string;
  compte: string;
  intitule: string;
  libelle: string;
  debit: number;
  credit: number;
  created_at?: string;
  id?: string;
  /** Numéro séquentiel serveur de l'écriture (persistant, non recalculé). */
  ecriture_numero?: string | null;
  /** Compte auxiliaire (ex: 411CLIENT01) — facultatif. */
  compte_auxiliaire?: string | null;
  /** Libellé du tiers auxiliaire — facultatif. */
  auxiliaire_libelle?: string | null;
}

const JOURNAL_LIBELLES: Record<string, string> = {
  AC: 'Achats',
  VT: 'Ventes',
  BQ: 'Banque',
  CA: 'Caisse',
  OD: 'Opérations diverses',
  AN: 'À nouveau',
  PA: 'Paie',
};

function toFecDate(d: string | null | undefined): string {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function num(v: number): string {
  return (Number(v) || 0).toFixed(2).replace('.', ',');
}

function clean(s: string | null | undefined): string {
  if (!s) return '';
  return String(s).replace(/[\|\r\n\t]/g, ' ').trim();
}

/** Découpe un compte collectif : 411001 → collectif 411, auxiliaire 001. */
export function decouperAuxiliaire(compte: string): { collectif: string; auxiliaire: string } | null {
  const c = clean(compte);
  const m = c.match(/^([1-4]0[0-9]|[1-4]1[0-9])([0-9]{3})/);
  if (!m) return null;
  return { collectif: m[1], auxiliaire: m[2] };
}

/** Numéro d'écriture FEC : serveur en priorité, repli séquentiel par pièce. */
export function attribuerNumerosEcritures(lines: FecLine[]): Map<FecLine, string> {
  const pieceNum = new Map<string, number>();
  let seq = 0;
  const result = new Map<FecLine, string>();
  for (const l of lines) {
    if (l.ecriture_numero && String(l.ecriture_numero).trim()) {
      result.set(l, String(l.ecriture_numero).trim());
      continue;
    }
    const key = `${l.journal_code}|${l.piece}`;
    if (!pieceNum.has(key)) { seq++; pieceNum.set(key, seq); }
    result.set(l, `${l.journal_code}${String(pieceNum.get(key)).padStart(6, '0')}`);
  }
  return result;
}

export interface RapportFec {
  totalLignes: number;
  totalDebit: number;
  totalCredit: number;
  equilibre: boolean;
  lignesRecomptees: number;
  lignesAuxiliaires: number;
  comptesSansLibelle: string[];
}

export function controlerFec(lines: FecLine[]): RapportFec {
  const totalDebit = Math.round((lines.reduce((s, l) => s + (Number(l.debit) || 0), 0) + Number.EPSILON) * 100) / 100;
  const totalCredit = Math.round((lines.reduce((s, l) => s + (Number(l.credit) || 0), 0) + Number.EPSILON) * 100) / 100;
  return {
    totalLignes: lines.length,
    totalDebit,
    totalCredit,
    equilibre: totalDebit === totalCredit,
    lignesRecomptees: lines.filter(l => !l.ecriture_numero || !String(l.ecriture_numero).trim()).length,
    lignesAuxiliaires: lines.filter(l => l.compte_auxiliaire || decouperAuxiliaire(l.compte)).length,
    comptesSansLibelle: [...new Set(lines.filter(l => !clean(l.intitule)).map(l => l.compte))],
  };
}

export function buildFec(
  lines: FecLine[],
  opts: { entrepriseNom: string; ninea?: string; exerciceAnnee: number; lettrage?: Record<string, { code: string; date: string }> } = {} as any,
): string {
  const headers = [
    'JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate',
    'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib',
    'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit',
    'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise',
  ];

  const numeros = attribuerNumerosEcritures(lines);

  const rows = lines.map(l => {
    const aux = decouperAuxiliaire(l.compte);
    const auxNum = clean(l.compte_auxiliaire) || (aux ? `${aux.collectif}${aux.auxiliaire}` : '');
    const dateEc = toFecDate(l.date_ecriture);
    const lett = opts.lettrage?.[l.id || ''];
    return [
      clean(l.journal_code),
      clean(JOURNAL_LIBELLES[l.journal_code] || l.journal_code),
      numeros.get(l) || '',
      dateEc,
      clean(l.compte),
      clean(l.intitule),
      auxNum,
      clean(l.auxiliaire_libelle),
      clean(l.piece),
      dateEc,
      clean(l.libelle),
      num(l.debit),
      num(l.credit),
      clean(lett?.code || ''),
      toFecDate(lett?.date),
      toFecDate(l.created_at),
      num(0),
      'XOF',
    ].join('|');
  });

  return [headers.join('|'), ...rows].join('\r\n');
}

export function downloadFec(content: string, entrepriseNinea: string, exerciceAnnee: number, dateCloture: string) {
  const filename = `${entrepriseNinea || 'FEC'}FEC${toFecDate(dateCloture)}.txt`;
  const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
