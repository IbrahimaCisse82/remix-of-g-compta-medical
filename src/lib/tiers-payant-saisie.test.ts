import { describe, expect, it } from 'vitest';
import { couvertureValide, imputationsValides } from './tiers-payant-saisie';
describe('Saisie tiers payant', () => {
  it('enregistre taux, plafond et dates sans inventer de couverture', () => {
    expect(couvertureValide('80','50000','2026-01-01','2026-12-31')).toEqual({ taux_couverture:80,plafond:50000,date_debut:'2026-01-01',date_fin:'2026-12-31' });
    expect(() => couvertureValide('','','','')).toThrow();
  });
  it('refuse les taux hors limites, plafonds fractionnaires et dates inversées', () => {
    for (const t of ['-1','101','Infinity']) expect(() => couvertureValide(t,'','','')).toThrow();
    expect(() => couvertureValide('80','1.5','','')).toThrow();
    expect(() => couvertureValide('80','','2026-12-31','2026-01-01')).toThrow();
  });
  it('permet un règlement partiel 3 000 sur un solde de 8 000', () => {
    expect(imputationsValides({ f:'3000' }, [{ id:'f',reste:8000 }])).toEqual([{ facture_id:'f',montant:3000 }]);
  });
  it('refuse surpaiement, fraction, négatif ou facture hors sélection', () => {
    for (const value of ['8001','1.5','-1','NaN']) expect(() => imputationsValides({ f:value },[{ id:'f',reste:8000 }])).toThrow();
    expect(() => imputationsValides({ inconnu:'10' },[{ id:'f',reste:8000 }])).toThrow();
  });
});