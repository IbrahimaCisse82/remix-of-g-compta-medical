import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { BalanceLine, Entreprise, Exercice } from './accounting';
import { htmlLiasse, montant, PAGES_DGID, type PagesModele } from './pdf-export';

const modele = JSON.parse(readFileSync(`public/${PAGES_DGID}`, 'utf8')) as PagesModele;
const b = (compte: string, d: Partial<BalanceLine>): BalanceLine => ({ compte, intitule: compte, sd: 0, sc: 0, md: 0, mc: 0, sfd: 0, sfc: 0, ...d });
const d = {
  entreprise: { nom: 'Clinique <Test>', sigle: 'CT', ninea: '0012345', adresse: 'Dakar', monnaie: 'FCFA' } as Entreprise,
  exercice: { annee: 2026, date_debut: '2026-01-01', date_fin: '2026-12-31' } as Exercice,
  balance: [b('101', { sc: 1_000_000, mc: 1_000_000, sfc: 1_000_000 }), b('521', { sd: 1_000_000, md: 1_500_000, sfd: 1_500_000 }), b('706', { mc: 500_000, sfc: 500_000 })],
  balanceN1: [],
};

describe('PDF de la liasse (contexture DGID)', () => {
  it('contient toutes les pages : garde, R1 à R4, états et notes 1 à 36', () => {
    const html = htmlLiasse(modele, d, ['garde', 'bilan', 'cr', 'tft', 'notes']);
    expect(html.match(/<section class="page/g)).toHaveLength(54);
    for (const t of ['NOTE 3A', 'NOTE 36', 'BILAN', 'COMPTE DE RESULTAT', 'FLUX DE TRESORERIE', 'DIRIGEANTS']) expect(html.toUpperCase()).toContain(t);
  });
  it('remplit identification et montants, échappe le texte', () => {
    const html = htmlLiasse(modele, d, ['bilan', 'notes']);
    expect(html).toContain('Clinique &lt;Test&gt;');
    expect(html).toContain('1 500 000');
    expect(html).toContain('31/12/2026');
    expect(html).not.toContain('Clinique <Test>');
  });
  it('sélection : un seul état', () => expect(htmlLiasse(modele, d, ['tft']).match(/<section class="page/g)).toHaveLength(1));
  it('format des montants', () => { expect(montant(-1234567)).toBe('-1 234 567'); expect(montant(0)).toBe(''); });
});
