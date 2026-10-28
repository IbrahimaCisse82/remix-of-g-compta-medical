/**
 * Échappement HTML pour les documents d'impression générés par document.write.
 * Toute donnée venant de la base (noms, libellés, numéros, motifs…) doit passer
 * par escapeHtml avant d'être insérée dans le HTML d'impression, sinon un texte
 * contenant des balises serait exécuté dans le navigateur de celui qui imprime.
 */
export function escapeHtml(val: string | number | null | undefined): string {
  if (val == null) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Protection contre l'injection de formules dans les exports CSV/Excel :
 * une cellule commençant par =, +, -, @ (ou tabulation/retour chariot) serait
 * interprétée comme une formule par Excel/LibreOffice. On la préfixe d'une
 * apostrophe pour la forcer en texte.
 */
export function protegerFormuleCsv(val: string | number | null | undefined): string | number | null | undefined {
  if (typeof val !== 'string') return val;
  if (/^[\t\r ]*[=+\-@]/.test(val)) return `'${val}`;
  return val;
}
