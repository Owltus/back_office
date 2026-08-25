-- =============================================================================
-- Parking — nouveau statut 'gratuite' (place accordée gratuitement à un
-- client).
--
-- À EXÉCUTER PAR L'UTILISATEUR dans Supabase → SQL Editor.
--
-- Contrairement à 'employe' (exclu de toutes les vues analytiques, voir
-- parking_analytics_agg.sql), 'gratuite' reste COMPTÉ dans l'occupation et
-- les nuitées générales — c'est une place client, simplement non facturée
-- — mais dans une colonne dédiée en plus des totaux (voir
-- parking_analytics_agg.sql, colonnes `free`/`free_nights`/`occupied_free`).
-- Elle est aussi exclue du calcul de CA (colonnes `ca_ht`/`ca_ttc`), au même
-- titre que 'employe' : ni l'une ni l'autre ne génèrent de revenu.
--
-- Idempotent : drop/add constraint rejouable sans dommage.
-- =============================================================================
alter table public.parking_reservations
  drop constraint if exists parking_reservations_status_check;

alter table public.parking_reservations
  add constraint parking_reservations_status_check
  check (status in ('reserve', 'paye', 'checkout', 'employe', 'gratuite'));

-- Requête de contrôle :
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conname = 'parking_reservations_status_check';
