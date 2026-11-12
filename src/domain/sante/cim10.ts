/** Référentiel CIM-10 : normalisation des codes et lecture d'un fichier de codes (CSV, TXT tabulé ou à barres). */

export type LigneCim10 = { code: string; libelle: string; chapitre?: string };

/** « A000 », « a00.0 », « A00.0 » → « A00.0 » (même règle que la base). */
export function normaliserCode(c: string): string {
  const x = c.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return x.length > 3 ? `${x.slice(0, 3)}.${x.slice(3)}` : x;
}

export const CODE_VALIDE = /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/;

const sansAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Lit les lignes d'un fichier déjà découpé en colonnes. Avec un en-tête, les colonnes « code » et « libellé »
 * (et « chapitre » si présente) sont repérées par leur nom ; sans en-tête, la première colonne qui ressemble à un code
 * est le code et la colonne de texte la plus longue est le libellé.
 */
export function lireReferentiel(lignes: string[][]): { lignes: LigneCim10[]; ignorees: number } {
  const propres = lignes.map(l => l.map(c => (c ?? '').trim())).filter(l => l.some(Boolean));
  if (propres.length === 0) return { lignes: [], ignorees: 0 };
  const entete = propres[0].map(sansAccents);
  const iCode = entete.findIndex(h => /^(code|code ?cim|cim ?10|code_cim10?)$/.test(h));
  const iLib = entete.findIndex(h => /libell|designation|intitul|label/.test(h));
  const iChap = entete.findIndex(h => /chapitre|chapter/.test(h));
  const avecEntete = iCode >= 0 && iLib >= 0;
  const corps = avecEntete ? propres.slice(1) : propres;
  const resultat = new Map<string, LigneCim10>();
  let ignorees = 0;
  for (const l of corps) {
    let code: string | undefined, libelle: string | undefined, chapitre: string | undefined;
    if (avecEntete) { code = l[iCode]; libelle = l[iLib]; chapitre = iChap >= 0 ? l[iChap] : undefined; }
    else {
      const ic = l.findIndex(c => CODE_VALIDE.test(normaliserCode(c)) && c.replace(/[^A-Za-z0-9]/g, '').length <= 7);
      code = ic >= 0 ? l[ic] : undefined;
      libelle = l.filter((c, i) => i !== ic && /[a-zA-Zà-ÿ]{3}/.test(c)).sort((a, b) => b.length - a.length)[0];
    }
    const c = (code ?? '').includes('-') ? '' : normaliserCode(code ?? ''); // « A00-A09 » est un bloc, pas un code
    if (!CODE_VALIDE.test(c) || !libelle || libelle.length < 2) { ignorees++; continue; }
    resultat.set(c, { code: c, libelle: libelle.slice(0, 500), ...(chapitre ? { chapitre } : {}) });
  }
  return { lignes: [...resultat.values()], ignorees };
}

/** Découpe en lots pour l'envoi au serveur (5 000 lignes au plus par appel). */
export function lots<T>(liste: T[], taille = 2000): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < liste.length; i += taille) r.push(liste.slice(i, i + taille));
  return r;
}
