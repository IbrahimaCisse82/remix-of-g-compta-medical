import Papa from 'papaparse';

export const TYPES_ORGANISMES = ['ipm', 'assurance', 'mutuelle', 'entreprise', 'autre'] as const;
export type OrganismeImport = { nom: string; type: typeof TYPES_ORGANISMES[number] };
export const cleOrganisme = (nom: string) => nom.trim().normalize('NFKC').toLocaleLowerCase('fr-FR').replace(/\s+/g, ' ');

export function lireOrganismesCsv(text: string, existants: string[]) {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
  if (parsed.errors.length) throw new Error('Fichier CSV invalide : ' + parsed.errors[0].message);
  const [header, ...lignes] = parsed.data;
  const colonnes = (header ?? []).map(c => c.trim().toLowerCase());
  const nomIndex = colonnes.indexOf('nom'), typeIndex = colonnes.indexOf('type');
  if (nomIndex < 0 || typeIndex < 0) throw new Error('Les colonnes nom et type sont obligatoires.');
  const vus = new Set(existants.map(cleOrganisme));
  const rows: OrganismeImport[] = [], erreurs: string[] = [];
  let ignores = 0;
  lignes.forEach((ligne, i) => {
    const nom = (ligne[nomIndex] ?? '').trim(), type = (ligne[typeIndex] ?? '').trim().toLowerCase();
    if (ligne.length !== colonnes.length || !nom || !TYPES_ORGANISMES.includes(type as OrganismeImport['type'])) {
      erreurs.push(`Ligne ${i + 2} : nom ou type invalide.`); return;
    }
    const cle = cleOrganisme(nom);
    if (vus.has(cle)) { ignores++; return; }
    vus.add(cle); rows.push({ nom, type: type as OrganismeImport['type'] });
  });
  return { rows, erreurs, ignores };
}

export function statutCouverture(a: { date_debut?: string | null; date_fin?: string | null }, today: string) {
  if (a.date_debut && a.date_debut > today) return 'À venir';
  if (a.date_fin && a.date_fin < today) return 'Expirée';
  return 'Valide';
}