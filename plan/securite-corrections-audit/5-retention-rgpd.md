# Étape 5 — Décision de rétention RGPD (csv-archive + parking)

## Objectif

Trancher la rétention de deux gisements de PII non couverts par la purge RGPD du PDJ, puis (optionnellement) poser une purge automatique. Ce n'est PAS une faille (bucket privé, aucune URL publique) mais une question de minimisation.

## Contexte

Le PDJ purge les noms invités des jours passés (`src/lib/pdj/service.ts:121-128`). Deux autres endroits gardent de la PII sans fenêtre :
- `csv-archive/comparison.csv` : noms clients PMS bruts, archivés à l'import (`src/lib/repjour/import/orchestrator.ts`). Bucket PRIVÉ, aucun `getPublicUrl`/`createSignedUrl` émis ; per notes projet, le bucket peut même ne pas exister (upload = no-op avalé).
- `parking_reservations.client` : nom du client de parking, aucune purge.

## Fichier(s) impacté(s)

- Décision : aucune (ou `supabase/parking_realtime.sql` si purge parking retenue).
- Éventuel `pg_cron` calqué sur `supabase/pdj_breakfasts.sql:115-131`.

## Travail à réaliser

### 1. Décider la politique de rétention

- csv-archive : conserver (utile au rapprochement) ou purger après N jours ? Confirmer que le bucket est bien privé et le rester.
- parking : le nom du client a-t-il une durée de conservation cible (aligner sur le PDJ, ex. J-1) ou reste-t-il pour l'historique d'exploitation ?

### 2. (Optionnel) Purge automatique du nom parking

Si une fenêtre est retenue, un `pg_cron` anonymisant `parking_reservations.client` au-delà de la fenêtre, sur le modèle de la purge PDJ (UPDATE statique, sans SQL dynamique) :

```sql
-- EXEMPLE — à n'exécuter que si la décision de rétention le retient.
-- update public.parking_reservations set client = ''
-- where <arrivée + nights> < current_date - interval '<N> days' and client <> '';
```

## Ordre d'exécution

1. Acter la politique (utilisateur).
2. Si purge retenue → rédiger + exécuter le `pg_cron` (utilisateur).

## Critère de validation

- Décision de rétention consignée pour les deux gisements.
- Si purge : job `pg_cron` en place, statique (aucune injection), vérifié idempotent.
