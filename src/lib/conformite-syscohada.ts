import { calc, PASSIF, CR, calculateActif, type BalanceLine } from './accounting';
import { accountReference, REFERENCE_MAPPING, REFERENCE_VISA, UNVALIDATED_MAPPINGS } from './syscohada-reference';
import { calculerTft } from './tft-syscohada';

const prefixes = (r: { comptes_prefixes: string; exclusions: string }, compte: string) =>
  !r.comptes_prefixes.startsWith('FORMULE:')
  && r.comptes_prefixes.split(';').some(p => p && compte.startsWith(p.replace('*', '')))
  && !r.exclusions.split(';').filter(Boolean).some(p => compte.startsWith(p));

/**
 * Comptes de bilan dont le solde n'est repris dans aucun poste (C09) : un solde débiteur doit
 * alimenter un poste d'actif (brut) ou un poste de passif soustractif ; un solde créditeur un poste
 * de passif ou une colonne amortissements/dépréciations. Sinon le bilan perd ce montant.
 */
export function comptesNonRepris(balance: BalanceLine[]): { compte: string; solde: number }[] {
  const actif = REFERENCE_MAPPING.filter(r => r.etat === 'BILAN_ACTIF');
  const passif = REFERENCE_MAPPING.filter(r => r.etat === 'BILAN_PASSIF');
  return balance.filter(l => /^[1-5]/.test(l.compte)).map(l => ({ compte: l.compte, solde: (l.sfd || 0) - (l.sfc || 0) }))
    .filter(({ compte, solde }) => {
      if (!solde) return false;
      const amort = /^(28|29|39|49|59)/.test(compte);
      const repris = solde > 0
        ? (!amort && actif.some(r => r.colonne === 'brut' && prefixes(r, compte)))
          || passif.some(r => (r.sens_solde.startsWith('D') || r.sens_solde === 'net') && prefixes(r, compte))
        : (amort && actif.some(r => r.colonne === 'amort_deprec' && prefixes(r, compte)))
          || passif.some(r => (r.sens_solde.startsWith('C') || r.sens_solde === 'net') && prefixes(r, compte));
      return !repris;
    });
}


/**
 * C02 : l'ouverture de N reprend la clôture de N-1, compte par compte. Le résultat de N-1 (comptes de
 * gestion, ou 13 s'il était déjà constaté) est affecté à l'ouverture en réserves, report à nouveau ou
 * dividendes : l'écart sur les comptes 11, 12, 13 et 465 doit donc égaler ce résultat.
 */
function controleOuverture(balance: BalanceLine[], previous: BalanceLine[]): [boolean, string] {
  if (!previous.length) return [false, 'Correspondance ouverture / clôture précédente ; non vérifiable sans N−1'];
  const bilan = (c: string) => /^[1-5]/.test(c);
  const affectation = (c: string) => /^(11|12|13|465)/.test(c);
  const ouv = new Map<string, number>(), clo = new Map<string, number>();
  for (const b of balance) if (bilan(b.compte)) ouv.set(b.compte, (ouv.get(b.compte) ?? 0) + (b.sd || 0) - (b.sc || 0));
  for (const b of previous) if (bilan(b.compte)) clo.set(b.compte, (clo.get(b.compte) ?? 0) + (b.sfd || 0) - (b.sfc || 0));
  const ecarts: string[] = [];
  let ecartAffectation = 0;
  for (const c of new Set([...ouv.keys(), ...clo.keys()])) {
    const e = Math.round((ouv.get(c) ?? 0) - (clo.get(c) ?? 0));
    if (!e) continue;
    if (affectation(c)) ecartAffectation += e; else ecarts.push(`${c} (${e})`);
  }
  const resultatN1 = previous.filter(b => /^[6-8]/.test(b.compte)).reduce((s, b) => s + (b.mc || 0) - (b.md || 0), 0);
  const affecte = Math.round(-ecartAffectation - resultatN1) === 0;
  const ok = ecarts.length === 0 && affecte;
  return [ok, ok ? `Ouverture = clôture N-1 ; résultat N-1 (${Math.round(resultatN1)}) affecté` : [
    ecarts.length ? `Ouverture ≠ clôture N-1 : ${ecarts.join(', ')}` : '',
    affecte ? '' : `Affectation du résultat N-1 : ${Math.round(-ecartAffectation)} au lieu de ${Math.round(resultatN1)}`,
  ].filter(Boolean).join(' ; ')];
}

export interface ControleSyscohada { code: string; ok: boolean; detail: string; bloquant: boolean }
export function controlesSyscohada(balance: BalanceLine[], previous: BalanceLine[] = []): ControleSyscohada[] {
  const a = calculateActif(balance), p = calc(balance, PASSIF), cr = calc(balance, CR), tft = calculerTft(balance), t = tft.valeurs;
  const omis = comptesNonRepris(balance);
  const sum = (field: keyof BalanceLine) => balance.filter(b => !b.compte.startsWith('9')).reduce((s,b) => s + Number(b[field] ?? 0),0);
  const invalid = balance.filter(b => !accountReference(b.compte));
  const unknownManagement = balance.filter(b => /^[6-8]/.test(b.compte) && (b.md || b.mc) && !CR.some(l => l.c?.some(([prefix]) => b.compte.startsWith(prefix)) && !l.exclusions?.some(prefix => b.compte.startsWith(prefix))));
  const check = (code: string, ok: boolean, detail: string, bloquant = true) => ({ code, ok, detail, bloquant });
  const unsupported = balance.filter(b => /^(17|106|154|19|2714|404|481|482|414|485|465)/.test(b.compte) && (b.md || b.mc));
  return [
    check('C01', sum('md') === sum('mc') && sum('sfd') === sum('sfc'), 'Équilibre des mouvements et des soldes'),
    check('C02', ...controleOuverture(balance, previous)),
    check('C03', a.net.BZ === p.DZ, `Actif ${a.net.BZ} / passif ${p.DZ}`),
    check('C04', p.CJ === cr.XI, `Résultat bilan ${p.CJ} / résultat de gestion ${cr.XI}`),
    check('C05', t.ZH === tft.tresorerieCloture && tft.comptesNonAffectes.length === 0, `Trésorerie du TFT ${t.ZH} / trésorerie de clôture (50 à 58) ${tft.tresorerieCloture}${tft.comptesNonAffectes.length ? ` ; comptes non affectés : ${tft.comptesNonAffectes.join(', ')}` : ''}`),
    check('C06', invalid.length === 0, invalid.length ? `Comptes inconnus ou supprimés : ${invalid.map(b=>b.compte).join(', ')}` : 'Comptes rattachés au référentiel 2019'),
    check('C07', !a.issues.some(i=>i.startsWith('C07')) && unknownManagement.length === 0, [...a.issues.filter(i=>i.startsWith('C07')), ...unknownManagement.map(b=>`${b.compte} sans affectation de résultat`)].join('; ') || 'Pas de conflit détecté'),
    check('C08', !a.issues.some(i=>i.startsWith('C08')), a.issues.filter(i=>i.startsWith('C08')).join('; ') || 'Aucun compte partagé non affecté'),
    check('C09', omis.length === 0, omis.length ? `Soldes repris dans aucun poste du bilan : ${omis.map(o => `${o.compte} (${o.solde > 0 ? 'débiteur' : 'créditeur'} ${Math.abs(o.solde)})`).join(', ')}` : 'Tous les soldes de bilan sont repris'),
    check('TFT-RETRAITEMENTS', true, unsupported.length ? `Retraitements appliqués automatiquement (location-acquisition, cessions, capital, dividendes…) : ${unsupported.map(b=>b.compte).join(', ')} — à vérifier` : 'Aucune opération complexe détectée', false),
    check('REF-VISA', UNVALIDATED_MAPPINGS.length === 0, REFERENCE_VISA ? `Référentiel visé par l'expert-comptable (déclaré le ${REFERENCE_VISA.date.split('-').reverse().join('/')})` : `${UNVALIDATED_MAPPINGS.length} lignes du référentiel fourni restent à valider officiellement`),
  ];
}

/** Drafts remain viewable; an unverified statement must not be exported as final. */
export function assertExportable(balance: BalanceLine[], previous: BalanceLine[]) {
  const failed = controlesSyscohada(balance, previous).filter(c => c.bloquant && !c.ok);
  if (failed.length) throw new Error(`États provisoires — ${failed.map(c=>`${c.code} : ${c.detail}`).join(' ; ')}`);
}