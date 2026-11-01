/**
 * Tableau des flux de trésorerie — SYSCOHADA révisé, méthode indirecte (Guide d'application, titre IX).
 *
 * Principe : chaque compte de bilan (classes 1 à 4, et 59) est affecté à UN flux, pour sa variation
 * de l'exercice (solde de clôture − solde d'ouverture) ; chaque compte de gestion non monétaire
 * (dotations, reprises, valeurs comptables et produits de cession…) est sorti de la CAFG et affecté au
 * même flux que le compte de bilan qu'il mouvemente. Ainsi les écritures sans trésorerie s'annulent à
 * l'intérieur d'un flux et la somme des flux est, par construction, égale à la variation de la
 * trésorerie (comptes 50 à 58) : ZH = trésorerie de clôture (contrôle C05).
 *
 * Conventions : montants signés, encaissement (+), décaissement (−). Les mouvements de la balance
 * incluent les à-nouveaux ; les mouvements propres à l'exercice sont donc md − sd et mc − sc.
 * Références croisées : formules de la plaquette Sage 100 SYSCOHADA révisé V14 (TFTSN.*), sauf la
 * variation des créances où la plaquette déduit deux fois les créances sur cessions (414).
 */
import type { BalanceLine } from './accounting';

export type FluxTft = 'FA' | 'FB' | 'FC' | 'FD' | 'FE' | 'FF' | 'FG' | 'FH' | 'FI' | 'FJ' | 'FK' | 'FL' | 'FM' | 'FN' | 'FO' | 'FP' | 'FQ';
type Seau = FluxTft | 'CAPITAL' | 'NC0' | 'TRESO' | 'AUCUN';

const commence = (c: string, prefixes: string[]) => prefixes.some(p => c.startsWith(p));

/** Comptes de gestion sortis de la CAFG (non monétaires ou liés aux investissements) et leur flux. */
export function fluxCompteGestion(c: string): Seau | null {
  if (commence(c, ['6541'])) return 'FF';
  if (commence(c, ['654'])) return 'FG';
  if (commence(c, ['754'])) return 'FI';
  if (commence(c, ['6812'])) return 'FF';
  if (commence(c, ['681'])) return 'FG';
  if (commence(c, ['6911'])) return 'NC0';
  if (commence(c, ['6913'])) return 'FF';
  if (commence(c, ['691'])) return 'FG';
  if (commence(c, ['6971'])) return 'NC0';
  if (commence(c, ['697'])) return 'FH';
  if (commence(c, ['7911'])) return 'NC0';
  if (commence(c, ['7913'])) return 'FF';
  if (commence(c, ['791'])) return 'FG';
  if (commence(c, ['7971'])) return 'NC0';
  if (commence(c, ['797'])) return 'FH';
  if (commence(c, ['798'])) return 'FG';
  if (commence(c, ['799'])) return 'FL';
  if (commence(c, ['811'])) return 'FF';
  if (commence(c, ['816'])) return 'FH';
  if (commence(c, ['81'])) return 'FG';
  if (commence(c, ['826'])) return 'FJ';
  if (commence(c, ['82'])) return 'FI';
  if (commence(c, ['852', '853', '862', '863'])) return 'FG';
  if (commence(c, ['85', '86'])) return 'NC0';
  return null;
}

/** Affectation d'un compte de bilan (classes 1 à 5). */
export function fluxCompteBilan(c: string): Seau | 'TIERS' | 'DETTE_FIN' {
  // Classe 5 : trésorerie, sauf dépréciations et provisions à court terme (59) contreparties de 679/779.
  if (c.startsWith('59')) return 'NC0';
  if (c.startsWith('5')) return 'TRESO';
  // Classe 1
  if (commence(c, ['106', '154'])) return 'FG';                 // réévaluations : contrepartie d'immobilisations
  if (commence(c, ['10'])) return 'CAPITAL';                    // capital, primes, apporteurs non appelé (FK ou FM)
  if (commence(c, ['11', '12', '13'])) return 'FN';             // affectation du résultat N-1 (dividendes via 465)
  if (commence(c, ['14'])) return 'FL';
  if (commence(c, ['15', '19'])) return 'NC0';                  // provisions réglementées et pour risques
  if (commence(c, ['16', '17', '181', '182', '183', '184'])) return 'DETTE_FIN';
  if (commence(c, ['18'])) return 'TIERS';                      // comptes de liaison 185 à 188
  // Classe 2 (brut, amortissements, dépréciations)
  if (commence(c, ['21', '251', '281', '291'])) return 'FF';
  if (commence(c, ['26', '27', '296', '297'])) return 'FH';
  if (c.startsWith('2')) return 'FG';
  // Classe 3
  if (c.startsWith('3')) return 'FC';
  // Classe 4 : comptes rattachés aux investissements, au financement ou à l'actif circulant HAO
  if (commence(c, ['4041', '4046', '4811', '4821'])) return 'FF';
  if (commence(c, ['4813'])) return 'FH';
  if (commence(c, ['404', '481', '482'])) return 'FG';
  if (commence(c, ['4856'])) return 'FJ';
  if (commence(c, ['414', '485'])) return 'FI';
  if (commence(c, ['488', '498'])) return 'FB';
  if (commence(c, ['465'])) return 'FN';
  if (commence(c, ['467', '4581'])) return 'CAPITAL';
  if (commence(c, ['4582', '4494'])) return 'FL';
  if (c.startsWith('4')) return 'TIERS';
  return 'AUCUN';
}

export interface ResultatTft {
  valeurs: Record<string, number>;
  /** Trésorerie nette de clôture lue au bilan (comptes 50 à 58) : doit égaler ZH. */
  tresorerieCloture: number;
  /** Éléments non monétaires sans contrepartie identifiée (provisions…), repris dans la CAFG. */
  ajustementNonMonetaire: number;
  /** Comptes qui n'ont pu être affectés (hors plan) : à examiner. */
  comptesNonAffectes: string[];
}

export function calculerTft(balance: BalanceLine[]): ResultatTft {
  const v: Record<string, number> = {};
  const ajoute = (k: string, x: number) => { v[k] = (v[k] ?? 0) + x; };
  let za = 0, tresoCloture = 0, nc0 = 0, capital = 0;
  const nonAffectes: string[] = [];

  for (const l of balance) {
    const c = String(l.compte ?? '').trim();
    if (!/^[1-8]/.test(c)) continue;
    const ouv = (l.sd || 0) - (l.sc || 0);
    const clo = (l.sfd || 0) - (l.sfc || 0);
    const delta = clo - ouv;
    if (/^[6-8]/.test(c)) {
      const s = (l.mc || 0) - (l.md || 0);                     // produit (+), charge (−)
      ajoute('_XI', s);
      const seau = fluxCompteGestion(c);
      if (seau === null) { ajoute('FA', s); continue; }
      if (seau === 'NC0') nc0 += s; else ajoute(seau, s);
      continue;
    }
    const seau = fluxCompteBilan(c);
    switch (seau) {
      case 'TRESO': za += ouv; tresoCloture += clo; break;
      case 'NC0': nc0 -= delta; break;
      case 'CAPITAL': capital -= delta; break;
      case 'TIERS': {
        if (/^49[0-7]/.test(c)) { ajoute('FD', -delta); break; }   // dépréciations des créances
        if (c.startsWith('499')) { ajoute('FE', -delta); break; }  // provisions pour risques à court terme
        const sdO = Math.max(ouv, 0), scO = Math.max(-ouv, 0), sdC = Math.max(clo, 0), scC = Math.max(-clo, 0);
        ajoute('FD', -(sdC - sdO));
        ajoute('FE', scC - scO);
        break;
      }
      case 'DETTE_FIN': {
        const nouveauxDebits = (l.md || 0) - (l.sd || 0);
        const nouveauxCredits = (l.mc || 0) - (l.sc || 0);
        if (c.startsWith('16')) ajoute('FO', nouveauxCredits);
        else if (c.startsWith('17')) ajoute('FG', nouveauxCredits);    // location-acquisition : sans encaissement
        else ajoute('FP', nouveauxCredits);
        ajoute('FQ', -nouveauxDebits);
        break;
      }
      case 'AUCUN': nonAffectes.push(c); nc0 -= delta; break;
      default: ajoute(seau, -delta);
    }
  }
  // Capital : apports (+) en FK, prélèvements (−) en FM.
  if (capital >= 0) ajoute('FK', capital); else ajoute('FM', capital);
  // Les éléments non monétaires sans contrepartie identifiée restent dans les flux opérationnels.
  ajoute('FA', nc0);

  const g = (k: string) => v[k] ?? 0;
  v.ZA = za;
  v.VO = g('FB') + g('FC') + g('FD') + g('FE');
  v.ZB = g('FA') + v.VO;
  v.ZC = g('FF') + g('FG') + g('FH') + g('FI') + g('FJ');
  v.ZD = g('FK') + g('FL') + g('FM') + g('FN');
  v.ZE = g('FO') + g('FP') + g('FQ');
  v.ZF = v.ZD + v.ZE;
  v.ZG = v.ZB + v.ZC + v.ZF;
  v.ZH = v.ZA + v.ZG;
  for (const k of ['FA', 'FB', 'FC', 'FD', 'FE', 'FF', 'FG', 'FH', 'FI', 'FJ', 'FK', 'FL', 'FM', 'FN', 'FO', 'FP', 'FQ']) v[k] = Math.round(g(k));
  delete v._XI;
  return { valeurs: v, tresorerieCloture: tresoCloture, ajustementNonMonetaire: nc0, comptesNonAffectes: nonAffectes };
}

/** Présentation officielle (imprimé SYSCOHADA révisé / modèle DGID) : code, libellé, renvoi de lettre. */
export const LIGNES_TFT: { code: string; libelle: string; lettre?: string; titre?: boolean; total?: boolean }[] = [
  { code: 'ZA', libelle: 'Trésorerie nette au 1er janvier (Trésorerie actif N-1 − Trésorerie passif N-1)', lettre: 'A', total: true },
  { code: '', libelle: 'Flux de trésorerie provenant des activités opérationnelles', titre: true },
  { code: 'FA', libelle: "Capacité d'Autofinancement Globale (CAFG)" },
  { code: 'FB', libelle: "− Variation de l'actif circulant HAO" },
  { code: 'FC', libelle: '− Variation des stocks' },
  { code: 'FD', libelle: '− Variation des créances' },
  { code: 'FE', libelle: '+ Variation du passif circulant' },
  { code: 'VO', libelle: 'Variation du BF lié aux activités opérationnelles (FB + FC + FD + FE)' },
  { code: 'ZB', libelle: 'Flux de trésorerie provenant des activités opérationnelles (somme FA à FE)', lettre: 'B', total: true },
  { code: '', libelle: "Flux de trésorerie provenant des activités d'investissement", titre: true },
  { code: 'FF', libelle: "− Décaissements liés aux acquisitions d'immobilisations incorporelles" },
  { code: 'FG', libelle: "− Décaissements liés aux acquisitions d'immobilisations corporelles" },
  { code: 'FH', libelle: "− Décaissements liés aux acquisitions d'immobilisations financières" },
  { code: 'FI', libelle: "+ Encaissements liés aux cessions d'immobilisations incorporelles et corporelles" },
  { code: 'FJ', libelle: "+ Encaissements liés aux cessions d'immobilisations financières" },
  { code: 'ZC', libelle: "Flux de trésorerie provenant des activités d'investissement (somme FF à FJ)", lettre: 'C', total: true },
  { code: '', libelle: 'Flux de trésorerie provenant du financement par les capitaux propres', titre: true },
  { code: 'FK', libelle: '+ Augmentations de capital par apports nouveaux' },
  { code: 'FL', libelle: "+ Subventions d'investissement reçues" },
  { code: 'FM', libelle: '− Prélèvements sur le capital' },
  { code: 'FN', libelle: '− Dividendes versés' },
  { code: 'ZD', libelle: 'Flux de trésorerie provenant des capitaux propres (somme FK à FN)', lettre: 'D', total: true },
  { code: '', libelle: 'Flux de trésorerie provenant du financement par les capitaux étrangers', titre: true },
  { code: 'FO', libelle: '+ Emprunts' },
  { code: 'FP', libelle: '+ Autres dettes financières' },
  { code: 'FQ', libelle: '− Remboursements des emprunts et autres dettes financières' },
  { code: 'ZE', libelle: 'Flux de trésorerie provenant des capitaux étrangers (somme FO à FQ)', lettre: 'E', total: true },
  { code: 'ZF', libelle: 'Flux de trésorerie provenant des activités de financement (D + E)', lettre: 'F', total: true },
  { code: 'ZG', libelle: 'VARIATION DE LA TRÉSORERIE NETTE DE LA PÉRIODE (B + C + F)', lettre: 'G', total: true },
  { code: 'ZH', libelle: 'Trésorerie nette au 31 décembre (G + A)', lettre: 'H', total: true },
];
