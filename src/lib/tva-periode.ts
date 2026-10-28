import { calculerTva, type TvaParam } from './tva';

export function calculTvaPeriode(journal: {compte: string; date_ecriture: string; debit: number; credit: number; journal_code?: string}[], params: TvaParam[], debut: string, fin: string, exercice: {date_debut:string;date_fin:string}, declarations: {date_debut:string;date_fin:string;statut:string;tva_a_payer:number}[]) {
  if (!debut || !fin || debut > fin || debut < exercice.date_debut || fin > exercice.date_fin) throw new Error('Période TVA invalide ou hors exercice');
  if (declarations.some(d=> d.statut === 'validee' && d.date_debut <= fin && d.date_fin >= debut)) throw new Error('Une déclaration validée couvre déjà cette période');
  if (!params.length) throw new Error('Paramétrez les comptes de TVA avant le calcul');
  const accounts = new Map<string,{compte:string;sfd:number;sfc:number}>();
  for (const j of journal) {
    if (j.date_ecriture < debut || j.date_ecriture > fin || j.journal_code === 'AN') continue;
    const b = accounts.get(j.compte) ?? {compte:j.compte,sfd:0,sfc:0};
    b.sfd += Number(j.debit); b.sfc += Number(j.credit); accounts.set(j.compte,b);
  }
  const previous = [...declarations].filter(d=>d.statut==='validee' && d.date_fin < debut).sort((a,b)=>b.date_fin.localeCompare(a.date_fin))[0];
  return calculerTva([...accounts.values()],params,Math.max(0,-(previous?.tva_a_payer ?? 0)));
}