CREATE OR REPLACE FUNCTION public.sante_compte(_structure_id uuid, _cle text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT compte FROM sante_comptes_parametres WHERE structure_id = _structure_id AND cle = _cle),
    CASE WHEN _cle LIKE 'produits\_%' THEN (SELECT compte FROM sante_comptes_parametres WHERE structure_id = _structure_id AND cle = 'produits') END,
    sante_compte_defaut(_cle))
$$;