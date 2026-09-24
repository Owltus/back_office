# `shared_buffers` 229 Mo → 96 Mo (2026-09-24)

Réglage d'INSTANCE (API de gestion Supabase), pas un script SQL — d'où ce
fichier `.md` et non `.sql`. Il est la trace versionnée de l'opération, au même
titre que les scripts.

## Symptôme
Panne du 2026-09-24 (`plan/panne-supabase-2026-09-24/`). Terrain mesuré sur
Reports → Database : **~300 Mo de swap en permanence** sur une machine Nano de
512 Mo, engagement mémoire 1,25 / 1,41 Go, CPU 1,6 %, IOPS < 1. Ce n'est ni
la charge ni le disque : la RAM.

## Cause
`shared_buffers` = 28672 × 8 ko = **229 Mo**, soit 45 % de la RAM physique,
pour une base de **27 Mo**. Pendant ce temps PostgREST, GoTrue, le pooler et
Realtime vivent dans le swap — et quand la maintenance Realtime de Supabase
déclenche sa tempête de rechargements de cache (bug `supabase/supabase#50043`),
PostgREST reconstruit son catalogue depuis le swap (6,4 s au lieu de 1 s) et se
fait tuer.

## Correctif
```
supabase postgres-config update --config shared_buffers=96MB \
  --project-ref ozpavwghrmmkrnmkxodg --experimental
```
96 Mo = 3,5 × la base entière : tout tient toujours en cache, aucune requête
ne ralentit, et ~130 Mo de RAM physique sont rendus aux autres services.
Paramètre « Restart: Yes » : la CLI redémarre la base (quelques secondes à
une minute). Décision utilisateur explicite du 2026-09-24 (« vas-y »), après
refus de l'abonnement Micro.

## Innocuité / retour arrière
Aucune surcharge n'existait avant (`postgres-config get` → vide) : 229 Mo est
la valeur par défaut Supabase. Retour :
```
supabase postgres-config delete --config shared_buffers \
  --project-ref ozpavwghrmmkrnmkxodg --experimental
```

## Vérification
```sql
select setting::int * 8 / 1024 as shared_buffers_mo from pg_settings
 where name = 'shared_buffers';   -- attendu : 96
```
Puis Reports → Database : la bande « Swap » doit reculer nettement sous 24 h.
