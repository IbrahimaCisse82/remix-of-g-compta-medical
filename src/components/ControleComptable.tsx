import { controlesSyscohada } from '@/lib/conformite-syscohada';
import type { BalanceLine } from '@/lib/accounting';
import { REFERENCE_VERSION } from '@/lib/syscohada-reference';

export default function ControleComptable({ balance, previous }: { balance: BalanceLine[]; previous: BalanceLine[] }) {
  const checks = controlesSyscohada(balance, previous);
  return <section className="my-3 border-t border-border pt-3" aria-label="Contrôles SYSCOHADA">
    <h2 className="text-sm font-semibold">Contrôles SYSCOHADA — états provisoires</h2>
    <p className="text-xs text-muted-foreground">{REFERENCE_VERSION} · Validation officielle non obtenue</p>
    <ul className="mt-2 space-y-1 text-xs">{checks.map(c => <li key={c.code} className={c.ok ? 'text-success' : 'text-destructive'}>{c.ok ? '✓' : '⚠'} {c.code} — {c.detail}</li>)}</ul>
  </section>;
}