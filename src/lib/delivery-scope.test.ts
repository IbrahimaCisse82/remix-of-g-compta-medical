import { describe, expect, it } from 'vitest';
import { DELIVERY_SCOPE, moduleInDelivery } from './delivery-scope';
describe('Périmètre de livraison choisi par Ibou', () => {
  it('exclut les SMS', () => { expect(DELIVERY_SCOPE.sms).toBe(false); });
  it('exclut les abonnements commerciaux', () => {
    expect(DELIVERY_SCOPE.subscriptions).toBe(false);
    expect(moduleInDelivery('mon_abonnement')).toBe(false);
    expect(moduleInDelivery('abonnements_clients')).toBe(false);
  });
  it('conserve les écritures récurrentes et les modules métier', () => {
    expect(moduleInDelivery('abonnement')).toBe(true);
    expect(moduleInDelivery('sante_patients')).toBe(true);
  });
});