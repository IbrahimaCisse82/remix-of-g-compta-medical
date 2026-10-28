import Papa from 'papaparse';

export type FactureRapprochable = { id: string; numero: string; organisme: string; reste: number };
export type LigneReglement = { date: string; reference: string; organisme: string; facture: string; montant: number; mode: string };
const modes = ['virement', 'cheque', 'especes', 'wave', 'orange_money', 'free_money', 'wizall', 'carte'];
const norm = (s: string) => s.trim().normalize('NFKC').toLocaleLowerCase('fr-FR');

export function lireReleveReglements(text: string, today = new Date().toISOString().slice(0, 10)): LigneReglement[] {
  const p = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
  if (p.errors.length) throw new Error('CSV invalide : ' + p.errors[0].message);
  const [header, ...rows] = p.data;
  const cols = (header ?? []).map(norm);
  for (const c of ['date', 'reference', 'organisme', 'montant']) if (!cols.includes(c)) throw new Error(`Colonne obligatoire : ${c}`);
  if (!rows.length || rows.length > 500) throw new Error('Le relevé doit contenir entre 1 et 500 lignes.');
  const seen = new Set<string>();
  return rows.map((r, i) => {
    const get = (c: string) => (r[cols.indexOf(c)] ?? '').trim();
    const date = get('date'), reference = get('reference'), organisme = get('organisme'), facture = get('facture'), mode = get('mode') || 'virement';
    const montant = Number(get('montant').replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'));
    const parsedDate = new Date(`${date}T00:00:00Z`);
    if (r.length !== cols.length || !reference || !organisme || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date || date > today || !get('montant') || !Number.isSafeInteger(montant) || montant <= 0 || !modes.includes(mode)) throw new Error(`Ligne ${i + 2} : date, référence, organisme, mode ou montant FCFA invalide.`);
    const key = JSON.stringify([norm(organisme), reference, date, norm(facture)]);
    if (seen.has(key)) throw new Error(`Ligne ${i + 2} : règlement répété dans le relevé.`);
    seen.add(key); return { date, reference, organisme, facture, montant, mode };
  });
}

export function candidatsReglement(l: LigneReglement, factures: FactureRapprochable[]) {
  const org = factures.filter(f => norm(f.organisme) === norm(l.organisme));
  if (l.facture) return org.filter(f => norm(f.numero) === norm(l.facture) && f.reste >= l.montant);
  return org.filter(f => f.reste === l.montant);
}

export function validerRapprochements(lignes: LigneReglement[], selections: string[], confirmations: boolean[], factures: FactureRapprochable[]) {
  const utilises = new Map<string, number>();
  return lignes.map((l, i) => {
    const f = factures.find(f => f.id === selections[i]);
    if (!confirmations[i] || !f || norm(f.organisme) !== norm(l.organisme)) throw new Error(`Ligne ${i + 1} : correspondance non confirmée ou organisme incompatible.`);
    const cumul = (utilises.get(f.id) ?? 0) + l.montant;
    if (cumul > f.reste) throw new Error(`Le cumul des règlements dépasse le reste dû sur ${f.numero}.`);
    utilises.set(f.id, cumul);
    return { date: l.date, reference: l.reference, organisme: f.organisme, montant: l.montant, mode: l.mode, facture_id: f.id, confirme: true };
  });
}

export type CreanceAgee = { organisme: string; j0_30: number | null; j31_60: number | null; j61_90: number | null; plus_90: number | null; total: number };
export function classerDebiteurs<T extends CreanceAgee>(rows: T[]) {
  return [...rows].sort((a,b) => Number(b.total) - Number(a.total) || a.organisme.localeCompare(b.organisme, 'fr'));
}
export function totauxBalance(rows: CreanceAgee[]) {
  return rows.reduce((a,r) => ({ j0_30:a.j0_30+Number(r.j0_30 ?? 0), j31_60:a.j31_60+Number(r.j31_60 ?? 0), j61_90:a.j61_90+Number(r.j61_90 ?? 0), plus_90:a.plus_90+Number(r.plus_90 ?? 0), total:a.total+Number(r.total) }), {j0_30:0,j31_60:0,j61_90:0,plus_90:0,total:0});
}