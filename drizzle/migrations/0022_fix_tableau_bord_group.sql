DO $$ DECLARE s text; BEGIN
  s := pg_get_functiondef('public.sante_tableau_bord(uuid,date,date)'::regprocedure);
  s := replace(s, 'GROUP BY 1->>0 IS NULL, ', 'GROUP BY ');
  EXECUTE s;
END $$;