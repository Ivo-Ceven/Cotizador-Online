-- Separación de datos por marca (apple / poly / hp / ...)
alter table public.pipeline add column if not exists brand text not null default 'apple';
alter table public.pipeline drop constraint pipeline_pkey;
alter table public.pipeline add constraint pipeline_pkey primary key (brand, id);

alter table public.app_settings add column if not exists brand text not null default 'apple';
alter table public.app_settings drop constraint app_settings_pkey;
alter table public.app_settings add constraint app_settings_pkey primary key (brand, key);