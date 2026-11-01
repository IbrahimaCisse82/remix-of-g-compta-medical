import { describe, expect, it } from 'vitest';
import { allouerFefo, nombreAlertes, verifierDelivrance } from './stocks-sante';

const J = '2026-10-22';

describe('allouerFefo', () => {
  const lots = [
    { id: 'tard', peremption: '2027-06-30', quantite_restante: 100 },
    { id: 'tot', peremption: '2026-11-15', quantite_restante: 3 },
    { id: 'perime', peremption: '2026-10-01', quantite_restante: 50 },
    { id: 'vide', peremption: '2026-10-30', quantite_restante: 0 },
  ];

  it('prend d’abord le lot qui périme le plus tôt, jamais un lot périmé ou vide', () => {
    expect(allouerFefo(lots, 5, J)).toEqual({ prelevements: [{ lot_id: 'tot', quantite: 3 }, { lot_id: 'tard', quantite: 2 }], rupture: 0 });
  });

  it('signale la rupture sans bloquer', () => {
    expect(allouerFefo(lots, 110, J)).toEqual({ prelevements: [{ lot_id: 'tot', quantite: 3 }, { lot_id: 'tard', quantite: 100 }], rupture: 7 });
    expect(allouerFefo([], 2, J)).toEqual({ prelevements: [], rupture: 2 });
  });

  it('un lot qui périme aujourd’hui reste utilisable', () => {
    expect(allouerFefo([{ id: 'j', peremption: J, quantite_restante: 1 }], 1, J).rupture).toBe(0);
  });

  it('départage deux lots de même péremption par date de réception', () => {
    const r = allouerFefo([
      { id: 'b', peremption: '2027-01-01', quantite_restante: 5, recu_le: '2026-10-10' },
      { id: 'a', peremption: '2027-01-01', quantite_restante: 5, recu_le: '2026-09-01' },
    ], 1, J);
    expect(r.prelevements[0].lot_id).toBe('a');
  });

  it('gère les quantités décimales', () => {
    expect(allouerFefo([{ id: 'x', peremption: '2027-01-01', quantite_restante: 0.3 }], 0.5, J).rupture).toBeCloseTo(0.2);
  });
});

describe('verifierDelivrance', () => {
  const articles = [{ id: 'gants', designation: 'Gants stériles', unite: 'paire', quantite_stock: 4 }];

  it('accepte une délivrance couverte par le stock', () => {
    expect(verifierDelivrance([{ article_id: 'gants', quantite: 4 }], articles)).toEqual([]);
  });

  it('cumule les lignes d’un même article', () => {
    expect(verifierDelivrance([{ article_id: 'gants', quantite: 3 }, { article_id: 'gants', quantite: 2 }], articles)[0]).toMatch(/Stock insuffisant pour Gants stériles : 4 paire/);
  });

  it('refuse les lignes vides, nulles ou inconnues', () => {
    expect(verifierDelivrance([], articles)).toHaveLength(1);
    expect(verifierDelivrance([{ article_id: '', quantite: 1 }], articles)[0]).toMatch(/Choisissez/);
    expect(verifierDelivrance([{ article_id: 'gants', quantite: 0 }], articles)[0]).toMatch(/supérieure à zéro/);
    expect(verifierDelivrance([{ article_id: 'x', quantite: 1 }], articles)[0]).toMatch(/introuvable/);
  });
});

describe('nombreAlertes', () => {
  it('additionne toutes les familles d’alertes', () => {
    const lot = { reactif: 'Glucose', lot: 'L1', peremption: '2026-11-01', quantite: 5 };
    expect(nombreAlertes({
      reactifs_sous_seuil: [{ id: 'r', nom: 'Glucose', unite: 'test', stock: 2, seuil: 10 }],
      lots_bientot_perimes: [lot, { ...lot, lot: 'L2' }],
      articles_sous_minimum: [{ id: 'a', code: 'GANT', designation: 'Gants', unite: 'paire', stock: 0, minimum: 10 }],
    })).toBe(4);
    expect(nombreAlertes(null)).toBe(0);
  });
});
