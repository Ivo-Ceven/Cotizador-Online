alter table public.poly_regi_pipeline
  add column perdido_motivo jsonb;

comment on column public.poly_regi_pipeline.perdido_motivo is
  'Motivo y feedback de pérdida fijados por Ceven: {motivo, detalle}. Solo aplica cuando forecast_override es Perdido; sobrevive las reimportaciones del Excel.';
