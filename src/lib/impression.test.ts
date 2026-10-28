import { describe, it, expect } from 'vitest';
import { escapeHtml, protegerFormuleCsv } from './impression';

describe('escapeHtml', () => {
  it('neutralise une balise script', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
  it('échappe les guillemets et apostrophes (attributs)', () => {
    expect(escapeHtml('"><img src=x onerror=alert(1)>')).toBe('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
    expect(escapeHtml("l'assurance")).toBe('l&#39;assurance');
  });
  it('échappe le esperluette', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });
  it('laisse passer les nombres et valeurs vides', () => {
    expect(escapeHtml(12000)).toBe('12000');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('protegerFormuleCsv', () => {
  it('préfixe les formules par une apostrophe', () => {
    expect(protegerFormuleCsv('=1+1')).toBe("'=1+1");
    expect(protegerFormuleCsv('+CMD|/C calc')).toBe("'+CMD|/C calc");
    expect(protegerFormuleCsv('-2+3')).toBe("'-2+3");
    expect(protegerFormuleCsv('@SUM(A1)')).toBe("'@SUM(A1)");
  });
  it('protège aussi après espaces ou tabulations initiales', () => {
    expect(protegerFormuleCsv('  =1+1')).toBe("'  =1+1");
    expect(protegerFormuleCsv('\t=1+1')).toBe("'\t=1+1");
  });
  it('ne touche pas au texte ordinaire ni aux nombres', () => {
    expect(protegerFormuleCsv('IPM Dakar')).toBe('IPM Dakar');
    expect(protegerFormuleCsv('Dossier P-2026-0001')).toBe('Dossier P-2026-0001');
    expect(protegerFormuleCsv(5000)).toBe(5000);
    expect(protegerFormuleCsv(null)).toBe(null);
  });
});
