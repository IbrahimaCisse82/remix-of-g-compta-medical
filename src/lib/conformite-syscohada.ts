import { calc, ACTIF, PASSIF, CR, TFT, calculateActif, type BalanceLine } from './accounting';
import { accountReference, UNVALIDATED_MAPPINGS } from './syscohada-reference';

export interface ControleSyscohada { code: string; ok: boolean; detail: string; bloquant: boolean }
export function controlesSyscohada(balance: BalanceLine[], previous: BalanceLine[] = []): ControleSyscohada[] {
  const a = calculateActif(balance), p = calc(balance, PASSIF), cr = calc(balance, CR), t = calc(balance, TFT);
  const sum = (field: keyof BalanceLine) => balance.filter(b => !b.compte.startsWith('9')).reduce((s,b) => s + Number(b[field] ?? 0),0);
  const invalid = balance.filter(b => !accountReference(b.compte));
  const unknownManagement = balance.filter(b => /^[6-8]/.test(b.compte) && (b.md || b.mc) && !CR.some(l => l.c?.some(([prefix]) => b.compte.startsWith(prefix)) && !l.exclusions?.some(prefix => b.compte.startsWith(prefix))));
  const treasury = (a.net.BT ?? 0) - (p.DT ?? 0) - balance.filter(b => b.compte.startsWith('472')).reduce((s,b) => s + b.sfd - b.sfc,0);
  const check = (code: string, ok: boolean, detail: string, bloquant = true) => ({ code, ok, detail, bloquant });
  const unsupported = balance.filter(b => /^(17|106|154|19|2714|404|481|482|414|485|465)/.test(b.compte) && (b.md || b.mc));
  return [
    check('C01', sum('md') === sum('mc') && sum('sfd') === sum('sfc'), 'Équilibre des mouvements et des soldes'),
    check('C02', previous.length > 0 && balance.filter(b => /^[1-5]/.test(b.compte)).every(b => {
      const old = previous.find(p => p.compte === b.compte);
      return b.sd - b.sc === (old?.sfd ?? 0) - (old?.sfc ?? 0);
    }) && previous.filter(b => /^[1-5]/.test(b.compte) && (b.sfd || b.sfc)).every(b => balance.some(n => n.compte === b.compte && n.sd-n.sc === b.sfd-b.sfc)), 'Correspondance ouverture / clôture précédente ; non vérifiable sans N−1'),
    check('C03', a.net.BZ === p.DZ, `Actif ${a.net.BZ} / passif ${p.DZ}`),
    check('C04', p.CJ === cr.XI, `Résultat bilan ${p.CJ} / résultat de gestion ${cr.XI}`),
    check('C05', t.ZH === treasury, `Trésorerie calculée ${t.ZH} / bilan corrigé de 472 ${treasury}`),
    check('C06', invalid.length === 0, invalid.length ? `Comptes inconnus ou supprimés : ${invalid.map(b=>b.compte).join(', ')}` : 'Comptes rattachés au référentiel 2019'),
    check('C07', !a.issues.some(i=>i.startsWith('C07')) && unknownManagement.length === 0, [...a.issues.filter(i=>i.startsWith('C07')), ...unknownManagement.map(b=>`${b.compte} sans affectation de résultat`)].join('; ') || 'Pas de conflit détecté'),
    check('C08', !a.issues.some(i=>i.startsWith('C08')), a.issues.filter(i=>i.startsWith('C08')).join('; ') || 'Aucun compte partagé non affecté'),
    check('TFT-RETRAITEMENTS', unsupported.length === 0, unsupported.length ? `Retraitements à documenter : ${unsupported.map(b=>b.compte).join(', ')}` : 'Aucune opération complexe détectée'),
    check('REF-VISA', UNVALIDATED_MAPPINGS.length === 0, `${UNVALIDATED_MAPPINGS.length} lignes du référentiel fourni restent à valider officiellement`),
  ];
}

/** Drafts remain viewable; an unverified statement must not be exported as final. */
export function assertExportable(balance: BalanceLine[], previous: BalanceLine[]) {
  const failed = controlesSyscohada(balance, previous).filter(c => c.bloquant && !c.ok);
  if (failed.length) throw new Error(`États provisoires — ${failed.map(c=>`${c.code} : ${c.detail}`).join(' ; ')}`);
}