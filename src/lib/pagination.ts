// L'API renvoie au plus 1 000 lignes par requête : au-delà, les données sont tronquées sans erreur.
// chargerTout lit page par page jusqu'à la dernière (la requête doit avoir un ordre stable).
export async function chargerTout<T>(
  page: (de: number, a: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  taille = 1000,
): Promise<T[]> {
  const tout: T[] = [];
  for (let de = 0; ; de += taille) {
    const { data, error } = await page(de, de + taille - 1);
    if (error) throw error instanceof Error ? error : new Error((error as { message?: string })?.message ?? 'Lecture impossible');
    tout.push(...(data ?? []));
    if (!data || data.length < taille) return tout;
  }
}
