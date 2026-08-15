-- Arregla el guardado de "Falsa Alarma" (y de cualquier tipo de registro
-- futuro): la tabla entries tenía una restricción que solo permitía
-- type IN ('episode','eq','trigger','joy'), y nunca se actualizó cuando
-- se agregó "falsealarm" — por eso el guardado fallaba silenciosamente.
--
-- Ejecuta esto en: Supabase Dashboard → SQL Editor → New query → Run

do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'entries'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%type%'
  loop
    execute format('alter table entries drop constraint %I', con.conname);
  end loop;
end $$;
