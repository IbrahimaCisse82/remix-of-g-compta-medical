import { describe, expect, it } from 'vitest';
import { aValider, avancementCatalogue, compterParametres, filtrerCatalogue, type AnalyseSuivi } from './catalogue-suivi';

const a = (o: Partial<AnalyseSuivi>): AnalyseSuivi => ({ id: 'x', code: 'GLY', libelle: 'Glycémie', section: 'biochimie', actif: false, nb_parametres: 0, ...o });
const liste = [
  a({ id: '1', code: 'AFP', libelle: 'Alpha-fœtoprotéine', section: 'hormonologie' }),
  a({ id: '2', code: 'NFS', libelle: 'Numération formule sanguine', section: 'hematologie', actif: true, nb_parametres: 12 }),
  a({ id: '3', code: 'GLY', libelle: 'Glycémie à jeun', actif: true, nb_parametres: 0 }),
  a({ id: '4', code: 'URE', libelle: 'Urée', nb_parametres: 1 }),
];

describe('suivi de validation du catalogue', () => {
  it('une analyse inactive ou sans paramètre est à valider', () => {
    expect(aValider({ actif: false, nb_parametres: 3 })).toBe(true);
    expect(aValider({ actif: true, nb_parametres: 0 })).toBe(true);
    expect(aValider({ actif: true, nb_parametres: 1 })).toBe(false);
  });
  it('filtre par statut, section et recherche sans accents', () => {
    expect(filtrerCatalogue(liste, { filtre: 'a_valider', section: '', q: '' }).map(x => x.id)).toEqual(['1', '3', '4']);
    expect(filtrerCatalogue(liste, { filtre: 'actives', section: '', q: '' }).map(x => x.id)).toEqual(['2']);
    expect(filtrerCatalogue(liste, { filtre: 'toutes', section: 'hormonologie', q: '' }).map(x => x.id)).toEqual(['1']);
    expect(filtrerCatalogue(liste, { filtre: 'toutes', section: '', q: 'glycemie' }).map(x => x.id)).toEqual(['3']);
    expect(filtrerCatalogue(liste, { filtre: 'toutes', section: '', q: 'nfs' }).map(x => x.id)).toEqual(['2']);
  });
  it('calcule l’avancement', () => {
    expect(avancementCatalogue(liste)).toEqual({ total: 4, actives: 1, sans_parametre: 2, a_valider: 3, pourcentage: 25 });
    expect(avancementCatalogue([]).pourcentage).toBe(0);
  });
  it('compte les paramètres par analyse', () => {
    expect(compterParametres([{ analyse_id: 'a' }, { analyse_id: 'a' }, { analyse_id: 'b' }])).toEqual({ a: 2, b: 1 });
  });
});
