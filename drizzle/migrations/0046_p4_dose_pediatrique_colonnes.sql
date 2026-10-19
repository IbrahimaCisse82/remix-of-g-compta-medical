ALTER TABLE public.sante_catalogue_medicaments ADD COLUMN dose_max_pediatrique_mg_kg numeric(8,2);
COMMENT ON COLUMN public.sante_catalogue_medicaments.dose_max_pediatrique_mg_kg IS 'Dose maximale pediatrique en mg/kg/jour ; si renseignee, l ordonnance chez l enfant de moins de 12 ans est controlee contre le poids mesure';
ALTER TABLE public.sante_ordonnance_lignes ADD COLUMN dose_mg_jour numeric(10,2);
ALTER TABLE public.sante_ordonnance_lignes ADD COLUMN justification_pediatrie text;
COMMENT ON COLUMN public.sante_ordonnance_lignes.justification_pediatrie IS 'Justification ecrite obligatoire quand la dose pediatrique depasse le seuil mg/kg/jour ou que le poids est inconnu';