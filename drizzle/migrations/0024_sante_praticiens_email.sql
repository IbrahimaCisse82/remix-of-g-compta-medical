-- Notifications au praticien prescripteur : adresse e-mail facultative par praticien.
alter table public.sante_praticiens add column if not exists email text;

comment on column public.sante_praticiens.email is 'Adresse e-mail du praticien, utilisée pour les notifications (ex. validation définitive d''un compte rendu). Facultative, normalisée en minuscules.';

alter table public.sante_praticiens drop constraint if exists sante_praticiens_email_forme;
alter table public.sante_praticiens add constraint sante_praticiens_email_forme
  check (email is null or (email = lower(btrim(email)) and email ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'));