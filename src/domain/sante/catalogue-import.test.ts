import { describe, expect, it } from 'vitest';
import { COLONNES, construireModele, lireFichier } from './catalogue-import';

const analyses = [
  { id: 'a1', code: 'GLY', libelle: 'Glycémie', section: 'biochimie', tube: 'Fluoré', echantillon: 'Sang veineux', delai_heures: 24, jeune: true, sensible: false },
  { id: 'a2', code: 'AFP', libelle: 'Alpha-fœtoprotéine; sérique', section: 'hormonologie', tube: null, echantillon: null, delai_heures: 48, jeune: false, sensible: false },
];
const parametres = [{ id: 'p1', analyse_id: 'a1', code: 'GLU', libelle: 'Glucose', unite: 'g/L', type: 'numerique', decimales: 2, ordre: 1 }];
const references = [{ parametre_id: 'p1', sexe: null, age_min_jours: 0, age_max_jours: 54788, bas: 0.7, haut: 1.1, critique_bas: 0.4, critique_haut: 4 }];

const csv = (lignes: string[][]) => [COLONNES.join(';'), ...lignes.map(l => l.join(';'))].join('\n');
const ligne = (o: Partial<Record<string, string>>) => COLONNES.map(c => o[c] ?? '');

describe('modèle tableur du catalogue', () => {
  it('pré-remplit une ligne par référence ou par analyse et se relit sans erreur', () => {
    const m = construireModele(analyses, parametres, references);
    expect(m.startsWith('﻿code_analyse;')).toBe(true);
    expect(m).toContain('GLY;Glycémie;biochimie;Fluoré;Sang veineux;24;oui;non;GLU;Glucose;g/L;numerique;2;;0;150;0,7;1,1;0,4;4');
    expect(m).toContain('"Alpha-fœtoprotéine; sérique"');
    const r = lireFichier(m, ['GLY', 'AFP']);
    expect(r.erreurs).toEqual([]);
    expect(r).toMatchObject({ analyses: 2, parametres: 1, references: 1 });
  });
});

describe('lecture du fichier rempli', () => {
  it('accepte les virgules décimales, le séparateur virgule et normalise les codes', () => {
    const t = [COLONNES.join(','), ligne({ code_analyse: 'gly', code_parametre: 'glu', bas: '0.7', haut: '1.1', sexe: 'f' }).join(',')].join('\n');
    const r = lireFichier(t, ['GLY']);
    expect(r.erreurs).toEqual([]);
    expect(r.lignes[0]).toMatchObject({ code_analyse: 'GLY', code_parametre: 'GLU', sexe: 'F', type: 'numerique' });
  });
  it('refuse une analyse inconnue, des bornes incohérentes et un type inconnu', () => {
    const r = lireFichier(csv([
      ligne({ code_analyse: 'XXX', code_parametre: 'A' }),
      ligne({ code_analyse: 'GLY', code_parametre: 'GLU', bas: '2', haut: '1' }),
      ligne({ code_analyse: 'GLY', code_parametre: 'GLU', type: 'liste' }),
      ligne({ code_analyse: 'GLY', code_parametre: 'GLU', bas: '0,7', haut: '1,1', critique_bas: '0,9' }),
      ligne({ code_analyse: 'GLY', code_parametre: 'GLU', bas: 'abc' }),
    ]), ['GLY']);
    expect(r.erreurs).toHaveLength(5);
    expect(r.erreurs[0]).toMatch(/Ligne 2 .*absente/);
    expect(r.erreurs.join(' ')).toMatch(/bas supérieur à haut/);
    expect(r.erreurs.join(' ')).toMatch(/type « liste »/);
    expect(r.erreurs.join(' ')).toMatch(/critique_bas doit être/);
    expect(r.erreurs.join(' ')).toMatch(/nombre attendu/);
  });
  it('refuse des valeurs de référence sur un paramètre non numérique ou sans code', () => {
    const r = lireFichier(csv([
      ligne({ code_analyse: 'GLY', code_parametre: 'ASP', type: 'texte', bas: '1' }),
      ligne({ code_analyse: 'GLY', bas: '1' }),
    ]), ['GLY']);
    expect(r.erreurs).toHaveLength(2);
  });
  it('exige les colonnes du modèle', () => {
    expect(() => lireFichier('a;b\n1;2', ['GLY'])).toThrow(/code_analyse/);
  });
  it('retire l’apostrophe de protection des formules', () => {
    const r = lireFichier(csv([ligne({ code_analyse: 'GLY', code_parametre: 'GLU', bas: "'-1", haut: '1' })]), ['GLY']);
    expect(r.erreurs).toEqual([]); expect(r.lignes[0].bas).toBe('-1');
  });
});
