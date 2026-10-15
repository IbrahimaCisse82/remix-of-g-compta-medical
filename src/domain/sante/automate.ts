/** Lecture d'un export d'automate : une ligne « CODE;valeur » (séparateur ; , ou tabulation), lignes « # » ignorées. */
export function parseAutomate(texte: string): { code: string; valeur: string }[] {
  return texte.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => l.split(/[;\t]|,(?=\s*[^\d])/).map(x => x.trim())).filter(c => c.length >= 2 && c[0] && c[1])
    .map(c => ({ code: c[0].toUpperCase(), valeur: c[1] }));
}
