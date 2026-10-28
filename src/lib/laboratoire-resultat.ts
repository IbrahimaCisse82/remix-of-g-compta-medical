/** Preserve textual/qualitative results even when their content looks numeric. */
export function valeurResultat(type: string, valeur: string) {
  const texte = valeur.trim();
  if (!texte) throw new Error('Résultat obligatoire');
  if (type !== 'numerique') return { _valeur_num: null as unknown as number, _valeur_texte: texte };
  const nombre = Number(texte.replace(',', '.'));
  if (!Number.isFinite(nombre)) throw new Error('Valeur numérique invalide');
  return { _valeur_num: nombre, _valeur_texte: null as unknown as string };
}