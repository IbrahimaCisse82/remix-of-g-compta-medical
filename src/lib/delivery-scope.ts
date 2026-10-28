// Delivery scope is independent of roles and never grants access.
export const DELIVERY_SCOPE = { sms: false, subscriptions: false } as const;
export function moduleInDelivery(id: string): boolean {
  return DELIVERY_SCOPE.subscriptions || !['mon_abonnement', 'abonnements_clients'].includes(id);
}