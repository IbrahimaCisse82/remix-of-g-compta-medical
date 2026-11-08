import { describe, expect, it } from 'vitest';
import { sectionsCatalogue, titreCatalogue } from './catalogue-structure';

describe('catalogue selon le type de structure', () => {
  it('cabinet : actes seulement, sans nomenclature ni validation de laboratoire', () => {
    const s = sectionsCatalogue('cabinet');
    expect(s).toEqual({ actes: true, analyses: false, nomenclatureLabo: false, validationBiologique: false });
    expect(titreCatalogue(s)).toBe('Praticiens et actes');
  });
  it('laboratoire : analyses et nomenclature, sans actes', () => {
    const s = sectionsCatalogue('laboratoire');
    expect(s).toEqual({ actes: false, analyses: true, nomenclatureLabo: true, validationBiologique: true });
    expect(titreCatalogue(s)).toBe('Praticiens et analyses');
  });
  it('mixte (ou type inconnu) : tout', () => {
    for (const t of ['mixte', null, undefined]) expect(sectionsCatalogue(t)).toEqual({ actes: true, analyses: true, nomenclatureLabo: true, validationBiologique: true });
    expect(titreCatalogue(sectionsCatalogue('mixte'))).toBe('Praticiens, actes et analyses');
  });
});
