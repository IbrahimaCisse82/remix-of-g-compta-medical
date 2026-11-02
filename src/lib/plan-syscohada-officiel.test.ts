/**
 * Référentiel officiel « Plan comptable SYSCOHADA révisé » (OHADA, 12/07/2019) : tous ses comptes existent dans le
 * plan installé par l'application, et les sous-comptes créés « pour faciliter l'élaboration du tableau de flux de
 * trésorerie » (en gris dans le référentiel) sont ventilés dans le bon flux.
 */
import { describe, expect, it } from 'vitest';
import officiel from './__fixtures__/plan-syscohada-revise-2019-officiel.json';
import { REFERENCE_ACCOUNTS } from './syscohada-reference';
import { fluxCompteBilan } from './tft-syscohada';

const sansRenvoi = (s: string) => s.replace(/\s*\(\d+\)\s*$/, '').normalize('NFKD').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

describe('Plan comptable SYSCOHADA révisé — référentiel officiel du 12/07/2019', () => {
  const plan = new Map(REFERENCE_ACCOUNTS.map(r => [r.compte, r.intitule]));
  it('aucun compte officiel absent du plan de l’application', () => {
    expect(Object.keys(officiel.comptes).filter(c => !plan.has(c))).toEqual([]);
    expect(Object.keys(officiel.comptes).length).toBe(1422);
  });
  it('intitulés identiques (renvois de bas de page et intitulés coupés sur deux lignes exceptés)', () => {
    const differents = Object.entries(officiel.comptes)
      .filter(([c, l]) => { const a = sansRenvoi(plan.get(c) ?? ''), b = sansRenvoi(l); return !(a === b || a.startsWith(b)); })
      .map(([c]) => c);
    expect(differents).toEqual([]);
  });
  it('sous-comptes créés pour le TFT ventilés dans leur flux', () => {
    const attendu: Record<string, string> = {
      47811: 'TIERS', 47831: 'TIERS', 47911: 'TIERS', 47931: 'TIERS',          // exploitation : variation du BFE (FD / FE)
      47818: 'FB', 47838: 'FB', 47918: 'FB', 47938: 'FB',                      // HAO
      48161: 'FF', 48171: 'FF', 48181: 'FF',                                   // fournisseurs d'immobilisations incorporelles
      48162: 'FG', 48172: 'FG', 48182: 'FG',                                   // corporelles (48172 : intitulé « incorporelles » erroné dans le référentiel)
    };
    expect(Object.fromEntries(Object.keys(attendu).map(c => [c, fluxCompteBilan(c)]))).toEqual(attendu);
  });
});
