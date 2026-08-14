-- Reclasifica episodios de ira que quedaron guardados como "Otros" con
-- "Salvador" escrito en el detalle, ahora que Salvador es una opción propia.
-- Ejecuta esto en: Supabase Dashboard → SQL Editor → New query.

-- 1) Primero revisa cuáles se van a mover (no cambia nada todavía):
select id, data->>'who' as who, data->>'contextDetail' as detalle, date
from entries
where type = 'episode'
  and data->>'who' = 'Otros'
  and data->>'contextDetail' ilike '%salvador%';

-- 2) Si la lista de arriba se ve bien, corre esto para reclasificarlos:
update entries
set data = (data - 'contextDetail') || jsonb_build_object('who', 'Salvador')
where type = 'episode'
  and data->>'who' = 'Otros'
  and data->>'contextDetail' ilike '%salvador%';
