// Moteur de calcul de paie SYSCOHADA / Sénégal
// Conforme au barème IRPP, IPRES, CSS, CFCE, TRIMF en vigueur

export type Employee = {
  id?: string;
  matricule: string;
  prenom: string;
  nom: string;
  sexe: 'M' | 'F';
  date_naissance?: string | null;
  situation_famille: string; // 'Marié(e)' | 'Célibataire' | ...
  femmes: number;
  enfants: number;
  fonction?: string;
  convention?: string;
  categorie?: string;
  statut: string; // 'employés' | 'agents de maîtrise' | 'cadres'
  contrat: string;
  date_entree?: string | null;
  salaire_base: number;
  sursalaire: number;
  /** Primes de garde et d'astreinte effectuées (module Santé › Personnel), soumises à cotisations. */
  prime_gardes?: number;
};

export type PaieParametres = {
  CFCE:     { taux: number; tauxSalarial: number; tauxPatronal: number; plafond: number | null };
  IPRES_RG: { taux: number; tauxSalarial: number; tauxPatronal: number; plafond: number | null };
  IPRES_RCC:{ taux: number; tauxSalarial: number; tauxPatronal: number; plafond: number | null };
  CSS_AF:   { taux: number; tauxSalarial: number; tauxPatronal: number; plafond: number | null };
  CSS_AT:   { taux: number; tauxSalarial: number; tauxPatronal: number; plafond: number | null };
  IPM:      { taux: number; tauxSalarial: number; tauxPatronal: number; plafond: number | null };
  transport:{ valeur: number };
};

export const DEFAULT_PAIE_PARAMS: PaieParametres = {
  CFCE:      { taux: 0.03,  tauxSalarial: 0,   tauxPatronal: 1,   plafond: null },
  IPRES_RG:  { taux: 0.14,  tauxSalarial: 0.4, tauxPatronal: 0.6, plafond: 432000 },
  IPRES_RCC: { taux: 0.06,  tauxSalarial: 0.4, tauxPatronal: 0.6, plafond: 1296000 },
  CSS_AF:    { taux: 0.07,  tauxSalarial: 0,   tauxPatronal: 1,   plafond: 63000 },
  CSS_AT:    { taux: 0.01,  tauxSalarial: 0,   tauxPatronal: 1,   plafond: 63000 },
  IPM:       { taux: 0,     tauxSalarial: 0.5, tauxPatronal: 0.5, plafond: null },
  transport: { valeur: 26000 },
};

export function getAnciennete(dateEntree?: string | null, refDate?: Date): number {
  if (!dateEntree) return 0;
  const ref = refDate || new Date();
  return Math.max(0, Math.floor((ref.getTime() - new Date(dateEntree).getTime()) / (365.25 * 86400000)));
}

export function getTauxAnciennete(anc: number): number {
  if (anc < 2) return 0;
  return anc / 100; // 2 ans → 2%, 17 ans → 17%
}

// TRIMF (Taxe Représentative de l'Impôt du Minimum Fiscal)
export function calculerTRIMF(brutMensuel: number, parts: number): number {
  const ba = brutMensuel * 12;
  let t = 900;
  if (ba >= 12000000)     t = parts * 36000;
  else if (ba >= 7000000) t = parts * 18000;
  else if (ba >= 2000000) t = parts * 12000;
  else if (ba >= 1000000) t = parts * 4800;
  else if (ba >= 600000)  t = parts * 3600;
  return t / 12;
}

// Barème IRPP Sénégal (annuel par part)
export function calculerIRAnnuelParPart(baseArr: number): number {
  if (baseArr > 13500000) return 4359000 + (baseArr - 13500000) * 0.40;
  if (baseArr >  8000000) return 2324000 + (baseArr -  8000000) * 0.37;
  if (baseArr >  4000000) return  924000 + (baseArr -  4000000) * 0.35;
  if (baseArr >  1500000) return  174000 + (baseArr -  1500000) * 0.30;
  if (baseArr >   630000) return            (baseArr -   630000) * 0.20;
  return 0;
}

export type BulletinResult = {
  salaire_base: number; sursalaire: number; prime_anciennete: number; prime_gardes: number; brut: number;
  anciennete: number; taux_anciennete: number;
  parts_ir: number; parts_trimf: number;
  ir: number; trimf: number;
  ipres_rg_s: number; ipres_rc_s: number; ipm_s: number;
  total_retenues: number;
  cfce: number; ipres_rg_p: number; ipres_rc_p: number;
  css_af: number; css_at: number; ipm_p: number;
  charges_patronales: number;
  transport: number; net_payer: number;
  masse_salariale: number;
};

export function calculerPaie(emp: Employee, p: PaieParametres, refDate?: Date): BulletinResult {
  const anc = getAnciennete(emp.date_entree, refDate);
  const ancRate = getTauxAnciennete(anc);
  const primeAnc = (emp.salaire_base || 0) * ancRate;
  const primeGardes = Math.max(0, emp.prime_gardes || 0);
  const brut = (emp.salaire_base || 0) + (emp.sursalaire || 0) + primeAnc + primeGardes;

  const partsIR = emp.situation_famille === 'Marié(e)'
    ? 1.5 + (emp.enfants || 0) * 0.5
    : 1   + (emp.enfants || 0) * 0.5;

  const brutAnnuel = brut * 12;
  const abatt = Math.min(brutAnnuel * 0.3, 900000);
  const baseImp = brutAnnuel - abatt;
  const baseArr = Math.floor((baseImp / partsIR) / 1000) * 1000;
  const irPart = calculerIRAnnuelParPart(baseArr);
  const ir = Math.max(0, (irPart * partsIR) / 12);

  const partsTRIMF = Math.min(1 + (emp.femmes || 0), 5);
  const trimf = calculerTRIMF(brut, partsTRIMF);

  const baseRG = p.IPRES_RG.plafond ? Math.min(brut, p.IPRES_RG.plafond) : brut;
  const ipres_rg_s = baseRG * p.IPRES_RG.taux * p.IPRES_RG.tauxSalarial;
  const ipres_rg_p = baseRG * p.IPRES_RG.taux * p.IPRES_RG.tauxPatronal;

  const baseRC = emp.statut === 'cadres'
    ? (p.IPRES_RCC.plafond ? Math.min(brut, p.IPRES_RCC.plafond) : brut)
    : 0;
  const ipres_rc_s = baseRC * p.IPRES_RCC.taux * p.IPRES_RCC.tauxSalarial;
  const ipres_rc_p = baseRC * p.IPRES_RCC.taux * p.IPRES_RCC.tauxPatronal;

  const baseCSS = p.CSS_AF.plafond ? Math.min(brut, p.CSS_AF.plafond) : brut;
  const css_af = baseCSS * p.CSS_AF.taux;
  const css_at = baseCSS * p.CSS_AT.taux;

  const cfce = brut * p.CFCE.taux;

  const ipm_s = brut * p.IPM.taux * p.IPM.tauxSalarial;
  const ipm_p = brut * p.IPM.taux * p.IPM.tauxPatronal;

  const total_retenues = ir + trimf + ipres_rg_s + ipres_rc_s + ipm_s;
  const charges_patronales = cfce + ipres_rg_p + ipres_rc_p + css_af + css_at + ipm_p;
  const transport = p.transport.valeur || 0;
  const net = brut - total_retenues + transport;

  return {
    salaire_base: emp.salaire_base, sursalaire: emp.sursalaire, prime_anciennete: primeAnc, prime_gardes: primeGardes,
    brut, anciennete: anc, taux_anciennete: ancRate,
    parts_ir: partsIR, parts_trimf: partsTRIMF,
    ir, trimf, ipres_rg_s, ipres_rc_s, ipm_s, total_retenues,
    cfce, ipres_rg_p, ipres_rc_p, css_af, css_at, ipm_p, charges_patronales,
    transport, net_payer: net, masse_salariale: brut + charges_patronales,
  };
}

export const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
export const fmtMoney = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));

// Écriture du journal PA (Paie) pour un lot de bulletins, sur le plan SYSCOHADA révisé :
// 6611 salaires bruts, 6634 indemnités de transport, 6641 charges sociales patronales, 6413 CFCE (taxe sur salaires) ;
// 4471 IR et TRIMF retenus, 4313 IPRES (retraite), 4311 prestations familiales et 4312 accidents du travail (CSS),
// 4472 CFCE à payer, 4333 IPM, 422 rémunérations dues.
// Montants en FCFA entiers ; le net dû est la ligne d'équilibre (écart d'arrondi de quelques francs au plus).
// L'écriture est datée du dernier jour du mois de paie.
export function genererEcrituresPaie(bulletins: BulletinResult[], periode: string, exercice_id: string, entreprise_id: string) {
  const r = (n: number) => Math.round(n || 0);
  const somme = (f: (b: BulletinResult) => number) => r(bulletins.reduce((s, b) => s + (f(b) || 0), 0));
  const tot = {
    brut: somme(b => b.brut), transport: somme(b => b.transport),
    ir: somme(b => b.ir + b.trimf),
    ipres_s: somme(b => b.ipres_rg_s + b.ipres_rc_s), ipres_p: somme(b => b.ipres_rg_p + b.ipres_rc_p),
    css_af: somme(b => b.css_af), css_at: somme(b => b.css_at), cfce: somme(b => b.cfce),
    ipm_s: somme(b => b.ipm_s), ipm_p: somme(b => b.ipm_p),
  };
  const [an, mo] = periode.split('-').map(Number);
  const date = `${periode}-${String(new Date(an, mo, 0).getDate()).padStart(2, '0')}`;
  const base = { date_ecriture: date, piece: `PAIE-${periode}`, journal_code: 'PA', libelle: `Salaires ${periode}`, exercice_id, entreprise_id };
  const lignes: { date_ecriture: string; piece: string; journal_code: string; libelle: string; exercice_id: string; entreprise_id: string; compte: string; intitule: string; debit: number; credit: number }[] = [];
  const d = (compte: string, intitule: string, m: number) => { if (m > 0) lignes.push({ ...base, compte, intitule, debit: m, credit: 0 }); };
  const c = (compte: string, intitule: string, m: number) => { if (m > 0) lignes.push({ ...base, compte, intitule, debit: 0, credit: m }); };
  // Charges
  d('6611', 'Appointements, salaires et commissions', tot.brut);
  d('6634', 'Indemnités de transport', tot.transport);
  d('6641', 'Charges sociales patronales — IPRES', tot.ipres_p);
  d('6641', 'Charges sociales patronales — CSS', tot.css_af + tot.css_at);
  d('6641', 'Charges sociales patronales — IPM', tot.ipm_p);
  d('6413', 'CFCE (contribution forfaitaire employeur)', tot.cfce);
  // Retenues et dettes sociales et fiscales
  c('4471', 'IR et TRIMF retenus à la source', tot.ir);
  c('4313', 'IPRES — retraite (parts salariale et patronale)', tot.ipres_s + tot.ipres_p);
  c('4311', 'CSS — prestations familiales', tot.css_af);
  c('4312', 'CSS — accidents du travail', tot.css_at);
  c('4472', 'CFCE à payer', tot.cfce);
  c('4333', 'IPM (parts salariale et patronale)', tot.ipm_s + tot.ipm_p);
  const debit = lignes.reduce((s, l) => s + l.debit, 0), credit = lignes.reduce((s, l) => s + l.credit, 0);
  c('422', 'Personnel, rémunérations dues', debit - credit);
  return lignes;
}
