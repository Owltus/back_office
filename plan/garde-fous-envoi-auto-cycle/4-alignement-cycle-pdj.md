# Étape 4 — PDJ auto : récence + idempotence calées sur le cycle 02h

## Objectif

Le PDJ est jugé OK par l'utilisateur (il ne dépend que du In-House). On se
contente donc de **caler sa fenêtre de récence sur le cycle hôtelier** (02h) et de
confirmer l'unicité « un envoi auto par cycle ». Pas de refonte.

## Fichier(s) impacté(s)

- `supabase/functions/import-report/autoSendPdj.ts`

## Travail à réaliser

### 1. Récence basée sur le cycle

Remplacer la borne calendaire (`now - 3 jours`) par une comparaison au cycle
métier (`businessDateStr`, étape 1) : n'auto-envoyer que la `service_date`
correspondant au cycle courant (ou tolérance courte), jamais un vieux jour.

### 2. Unicité par cycle

`pdj_auto_send_log(service_date)` garantit déjà « un envoi auto par jour ». Vérifier
que la `service_date` du In-House correspond bien au cycle attendu, et que
l'insert-on-conflict reste atomique (pas de double envoi).

### 3. Filet manuel préservé

Le bouton PDJ manuel (`send-report` kind=pdj) ne consulte pas `pdj_auto_send_log`
→ toujours possible. Ne pas régresser.

## Ordre d'exécution

1. Adapter la fenêtre de récence.
2. `deno check`.

## Critère de validation

- In-House du cycle courant → 1 envoi auto PDJ.
- Ré-import → pas de second envoi (idempotence).
- Vieux In-House (hors cycle) → pas d'envoi auto.
- Bouton manuel → toujours possible.
