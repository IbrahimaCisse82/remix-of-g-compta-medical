/**
 * Stocks reliés aux soins et au laboratoire — règles pures (sans accès réseau).
 * Le serveur (migration 0050) applique les mêmes règles ; ces fonctions servent
 * à l'aperçu à l'écran et aux tests.
 */

export interface LotReactif { id: string; peremption: string; quantite_restante: number; recu_le?: string }
export interface Prelevement { lot_id: string; quantite: number }

/** Répartition FEFO (premier périmé, premier sorti) d'un besoin sur les lots utilisables. */
export function allouerFefo(lots: LotReactif[], besoin: number, aujourdHui: string): { prelevements: Prelevement[]; rupture: number } {
  if (!(besoin > 0)) return { prelevements: [], rupture: 0 };
  const utilisables = lots
    .filter(l => l.quantite_restante > 0 && l.peremption >= aujourdHui)
    .sort((a, b) => a.peremption.localeCompare(b.peremption) || (a.recu_le ?? '').localeCompare(b.recu_le ?? ''));
  const prelevements: Prelevement[] = [];
  let reste = besoin;
  for (const l of utilisables) {
    if (reste <= 0) break;
    const pris = Math.min(reste, l.quantite_restante);
    prelevements.push({ lot_id: l.id, quantite: pris });
    reste = arrondi(reste - pris);
  }
  return { prelevements, rupture: Math.max(0, reste) };
}

export interface LigneDelivrance { article_id: string; quantite: number }
export interface ArticleStock { id: string; designation: string; unite: string; quantite_stock: number }

/** Contrôles avant délivrance ; les quantités d'un même article sont cumulées. */
export function verifierDelivrance(lignes: LigneDelivrance[], articles: ArticleStock[]): string[] {
  const erreurs: string[] = [];
  if (lignes.length === 0) return ['Ajoutez au moins un article.'];
  const parId = new Map(articles.map(a => [a.id, a]));
  const cumul = new Map<string, number>();
  for (const l of lignes) {
    if (!l.article_id) { erreurs.push('Choisissez un article sur chaque ligne.'); continue; }
    if (!(l.quantite > 0)) { erreurs.push('Chaque quantité doit être supérieure à zéro.'); continue; }
    cumul.set(l.article_id, arrondi((cumul.get(l.article_id) ?? 0) + l.quantite));
  }
  for (const [id, q] of cumul) {
    const a = parId.get(id);
    if (!a) erreurs.push('Article introuvable dans le stock de la structure.');
    else if (q > a.quantite_stock) erreurs.push(`Stock insuffisant pour ${a.designation} : ${a.quantite_stock} ${a.unite} disponible(s).`);
  }
  return [...new Set(erreurs)];
}

export interface AlertesStock {
  reactifs_sous_seuil?: { id: string; nom: string; unite: string; stock: number; seuil: number }[];
  lots_bientot_perimes?: { reactif: string; lot: string; peremption: string; quantite: number }[];
  ruptures_30j?: { reactif: string; quantite: number; demandes: number }[];
  articles_sous_minimum?: { id: string; code: string; designation: string; unite: string; stock: number; minimum: number }[];
}

export function nombreAlertes(a: AlertesStock | null | undefined): number {
  if (!a) return 0;
  return (a.reactifs_sous_seuil?.length ?? 0) + (a.lots_bientot_perimes?.length ?? 0)
    + (a.ruptures_30j?.length ?? 0) + (a.articles_sous_minimum?.length ?? 0);
}

const arrondi = (n: number) => Math.round(n * 10000) / 10000;
