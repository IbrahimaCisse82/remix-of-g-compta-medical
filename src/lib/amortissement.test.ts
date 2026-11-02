import { describe, it, expect } from 'vitest';
import { calcPlan, compteAmortFrom, getDotationExercice, type Immo } from './amortissement';

const mk = (o: Partial<Immo> = {}): Immo => ({
  code: 'IMMO1', libelle: 'Test',
  date_acquisition: '2024-01-01',
  date_mise_service: '2024-01-01',
  valeur_origine: 1200000, valeur_residuelle: 0,
  duree_annees: 4, mode_amortissement: 'lineaire',
  statut: 'actif', ...o,
});

describe('Amortissement — linéaire', () => {
  it('somme des dotations = base amortissable', () => {
    const rows = calcPlan(mk({ valeur_origine: 1200000, duree_annees: 4 }));
    const somme = rows.reduce((s, r) => s + r.dotation, 0);
    expect(somme).toBe(1200000);
  });

  it('produit une dotation annuelle constante quand la mise en service est au 1er janvier', () => {
    const rows = calcPlan(mk({ valeur_origine: 1200000, duree_annees: 4 }));
    // 4 lignes pleines de 300 000
    const pleines = rows.filter(r => r.dotation === 300000);
    expect(pleines.length).toBe(4);
  });

  it('applique le prorata temporis à la 1ère année', () => {
    const rows = calcPlan(mk({ date_mise_service: '2024-07-01', valeur_origine: 1200000, duree_annees: 4 }));
    // prorata: 6 mois → 300000 * 6/12 = 150000
    expect(rows[0].dotation).toBe(150000);
  });

  it('respecte la valeur résiduelle dans la VNC finale', () => {
    const rows = calcPlan(mk({ valeur_origine: 1000000, valeur_residuelle: 100000, duree_annees: 4 }));
    const derniere = rows[rows.length - 1];
    expect(derniere.vnc).toBe(100000);
  });
});

describe('Amortissement — dégressif', () => {
  it('somme = base amortissable (dernière année = solde)', () => {
    const rows = calcPlan(mk({ valeur_origine: 1000000, duree_annees: 5, mode_amortissement: 'degressif' }));
    const somme = rows.reduce((s, r) => s + r.dotation, 0);
    expect(somme).toBe(1000000);
  });

  it('la 1ère année dégressive dépasse la 1ère année linéaire équivalente (durée >= 5)', () => {
    const deg = calcPlan(mk({ valeur_origine: 1000000, duree_annees: 5, mode_amortissement: 'degressif' }));
    const lin = calcPlan(mk({ valeur_origine: 1000000, duree_annees: 5, mode_amortissement: 'lineaire' }));
    expect(deg[0].dotation).toBeGreaterThanOrEqual(lin[0].dotation);
  });
});

describe('Amortissement — helpers', () => {
  it('getDotationExercice cible la bonne année', () => {
    const immo = mk({ date_mise_service: '2024-01-01', valeur_origine: 1200000, duree_annees: 4 });
    expect(getDotationExercice(immo, 2025)).toBe(300000);
    expect(getDotationExercice(immo, 2099)).toBe(0);
  });

  it('compteAmortFrom convertit 2XX en 28XX', () => {
    expect(compteAmortFrom('2441')).toBe('28441');
    expect(compteAmortFrom('2181')).toBe('28181');
  });
});
