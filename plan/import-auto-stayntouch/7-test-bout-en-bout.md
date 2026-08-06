# Étape 7 — Test bout-en-bout + garde-fous

## Objectif

Vérifier que toute la chaîne marche en conditions réelles, et que la sécurité +
l'idempotence tiennent.

## Qui

**TOI** (déclenchement) + **MOI** (analyse des logs / correctifs).

## Travail à réaliser

1. **Envoi réel** : depuis le PMS (ou en te forwardant un vrai export StayNTouch),
   envoyer chacun des 3 rapports à `backoffice@naostack.com`.
2. **Vérifier l'import** : les données apparaissent dans RepJour (jour J-1) et PDJ,
   identiques à ce qu'un import manuel aurait produit.
3. **Idempotence** : renvoyer le même rapport → aucune ligne en double ; la saisie
   PDJ (`breakfasts_served`) est préservée.
4. **Sécurité** :
   - un e-mail d'un domaine ≠ stayntouch → rejeté (rien importé) ;
   - un appel direct à l'Edge Function sans `X-Import-Secret` → 401.
5. **Traçabilité** : les imports apparaissent « importé par StayNTouch ».
6. **Diagnostic** : consulter les logs de l'Edge Function (Supabase) et du Worker
   (Cloudflare) en cas d'échec.

## Critère de validation

- Les 3 rapports s'importent seuls, sans intervention.
- Rejets de sécurité effectifs. Idempotence confirmée. Aucun impact sur l'import
  manuel (toujours fonctionnel).

## Contrôle /borg

Étape finale : revue globale — pas de fuite de secret, pas de double écriture, RLS
respectée, import manuel intact, comportement identique manuel vs auto.
