// Calcul du plan d'amortissement SYSCOHADA
export interface Immo {
  id?: string;
  code: string;
  libelle: string;
  date_acquisition: string;
  date_mise_service?: string | null;
  valeur_origine: number;
  valeur_residuelle: number;
  duree_annees: number;
  mode_amortissement: 'lineaire' | 'degressif';
  taux?: number | null;
  date_cession?: string | null;
  prix_cession?: number | null;
  statut: 'actif' | 'cede' | 'rebute';
}

export interface PlanRow {
  annee: number;
  dotation: number;
  cumul: number;
  vnc: number;
}

/** Coefficients dégressifs SYSCOHADA — paramétrables par entreprise */
export interface CoefDegressif { court: number; moyen: number; long: number }
export const COEF_DEGRESSIF_DEFAUT: CoefDegressif = { court: 1.5, moyen: 2, long: 2.5 };

export function coefDegressif(duree: number, coefs: CoefDegressif = COEF_DEGRESSIF_DEFAUT): number {
  return duree <= 4 ? coefs.court : duree <= 6 ? coefs.moyen : coefs.long;
}

export function calcPlan(immo: Immo, coefs: CoefDegressif = COEF_DEGRESSIF_DEFAUT): PlanRow[] {
  const base = (immo.valeur_origine || 0) - (immo.valeur_residuelle || 0);
  const duree = Math.max(1, Number(immo.duree_annees || 1));
  const start = new Date(immo.date_mise_service || immo.date_acquisition);
  const startYear = start.getFullYear();
  const tauxLin = 1 / duree;

  const rows: PlanRow[] = [];

  if (immo.mode_amortissement === 'degressif') {
    const coef = coefDegressif(duree, coefs);
    const tauxDeg = immo.taux ? Number(immo.taux) / 100 : tauxLin * coef;
    let vnc = base;
    for (let i = 0; i < duree; i++) {
      const annee = startYear + i;
      const tauxLinResiduel = 1 / (duree - i);
      const tauxApplique = Math.max(tauxDeg, tauxLinResiduel);
      let dot = vnc * tauxApplique;
      // Prorata 1ère année (mois)
      if (i === 0) {
        const moisRestants = 12 - start.getMonth();
        dot = (dot * moisRestants) / 12;
      }
      if (i === duree - 1) dot = vnc;
      vnc -= dot;
      const cumul = base - vnc;
      rows.push({ annee, dotation: Math.round(dot), cumul: Math.round(cumul), vnc: Math.round(vnc + (immo.valeur_residuelle || 0)) });
    }
  } else {
    // Linéaire avec prorata temporis
    const dotAnnuelle = base * tauxLin;
    let cumul = 0;
    for (let i = 0; i <= duree; i++) {
      let dot = dotAnnuelle;
      if (i === 0) {
        const moisRestants = 12 - start.getMonth();
        dot = (dotAnnuelle * moisRestants) / 12;
      } else if (i === duree) {
        const moisRest = start.getMonth();
        if (moisRest === 0) break;
        dot = (dotAnnuelle * moisRest) / 12;
      }
      cumul += dot;
      if (cumul > base) { dot -= (cumul - base); cumul = base; }
      rows.push({
        annee: startYear + i,
        dotation: Math.round(dot),
        cumul: Math.round(cumul),
        vnc: Math.round(base - cumul + (immo.valeur_residuelle || 0)),
      });
      if (cumul >= base) break;
    }
  }
  return rows;
}

export function getDotationExercice(immo: Immo, annee: number): number {
  return calcPlan(immo).find(p => p.annee === annee)?.dotation || 0;
}

/** Nature SYSCOHADA d'une immobilisation d'après son compte */
export type NatureImmo = 'incorporelle' | 'corporelle' | 'financiere';

export function natureImmo(compteImmo: string): NatureImmo {
  const c = String(compteImmo || '').trim();
  if (/^2[01]/.test(c)) return 'incorporelle';
  if (/^2[67]/.test(c)) return 'financiere';
  return 'corporelle';
}

// Compte d'amortissement à partir du compte d'immo (2XX → 28XX)
export function compteAmortFrom(compteImmo: string): string {
  const c = String(compteImmo || '').trim();
  return '28' + c.slice(1);
}

// Compte de dépréciation (2XX → 29XX) — seule écriture de valeur pour les immos financières
export function compteDeprecFrom(compteImmo: string): string {
  const c = String(compteImmo || '').trim();
  return '29' + c.slice(1);
}

// Compte de dotation aux amortissements selon la nature
export function compteDotationFrom(compteImmo: string): string {
  const n = natureImmo(compteImmo);
  if (n === 'incorporelle') return '6812';
  if (n === 'financiere') return '6972'; // dotations aux dépréciations financières
  return '6813';
}

/** Comptes de cession HAO selon la nature (SYSCOHADA révisé) */
export function comptesCession(compteImmo: string): { vnc: string; vncLibelle: string; produit: string; produitLibelle: string } {
  switch (natureImmo(compteImmo)) {
    case 'incorporelle':
      return { vnc: '811', vncLibelle: "Valeurs comptables des cessions d'immobilisations incorporelles",
               produit: '821', produitLibelle: "Produits des cessions d'immobilisations incorporelles" };
    case 'financiere':
      return { vnc: '816', vncLibelle: "Valeurs comptables des cessions d'immobilisations financières",
               produit: '826', produitLibelle: "Produits des cessions d'immobilisations financières" };
    default:
      return { vnc: '812', vncLibelle: "Valeurs comptables des cessions d'immobilisations corporelles",
               produit: '822', produitLibelle: "Produits des cessions d'immobilisations corporelles" };
  }
}
