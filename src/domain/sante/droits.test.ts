import { describe, expect, it } from 'vitest';
import { formaterResultat, peut } from './droits';

describe('peut', () => {
  it('réserve la réception et la saisie au technicien et au biologiste', () => {
    expect(peut(['preleveur'], 'traiter_echantillon')).toBe(false);
    expect(peut(['preleveur'], 'prelever')).toBe(true);
    expect(peut(['technicien'], 'saisir_resultat')).toBe(true);
    expect(peut(['technicien'], 'valider_biologique')).toBe(false);
    expect(peut(['biologiste'], 'valider_biologique')).toBe(true);
  });
  it('réserve la caisse, la remise et l’annulation', () => {
    expect(peut(['tiers_payant'], 'gerer_caisse')).toBe(false);
    expect(peut(['caissier'], 'gerer_caisse')).toBe(true);
    expect(peut(['caissier'], 'accorder_remise')).toBe(false);
    expect(peut(['caissier'], 'annuler_facture')).toBe(false);
    expect(peut(['caissier', 'admin_structure'], 'annuler_facture')).toBe(true);
    expect(peut(['caissier'], 'analyse_chiffre_affaires')).toBe(false);
    expect(peut(['comptable'], 'analyse_chiffre_affaires')).toBe(true);
  });
  it('refuse tout sans rôle', () => {
    expect(peut([], 'creer_facture')).toBe(false);
  });
});

describe('formaterResultat', () => {
  it('garde la précision saisie au-delà des décimales prévues', () => {
    expect(formaterResultat(1.26, 1)).toBe('1,26');
  });
  it('complète jusqu’aux décimales prévues', () => {
    expect(formaterResultat(1.2, 2)).toBe('1,20');
    expect(formaterResultat(5, 1)).toBe('5,0');
  });
  it('ne groupe pas les milliers et plafonne à 4 décimales', () => {
    expect(formaterResultat(12500, 0)).toBe('12500');
    expect(formaterResultat(0.123456, 2)).toBe('0,1235');
  });
});
