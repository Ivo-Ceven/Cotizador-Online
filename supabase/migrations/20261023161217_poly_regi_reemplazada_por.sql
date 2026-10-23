-- HP a veces da de baja una oportunidad y la vuelve a cargar con OPD y REGI
-- nuevos (caso real: IBERO ASISTENCIA, OPD-0005283476 -> OPD-0005555397).
-- `reemplazada_por` guarda el OPD de la oportunidad nueva en la fila vieja:
-- el número viejo pasa a ser un alias del nuevo (las cotizaciones de Ceven
-- con el OPG viejo se vinculan a la nueva) y la fila vieja sale de la tabla y
-- de los totales. Sin FK a propósito: cada importación borra y reinserta filas.
alter table public.poly_regi_pipeline
  add column reemplazada_por text;

comment on column public.poly_regi_pipeline.reemplazada_por is
  'OPD de la oportunidad que la reemplaza cuando HP la renumeró. La fija Ceven a mano desde la vista REGI; sobrevive las reimportaciones del Excel (el upsert no la manda). null = no fue renumerada.';
