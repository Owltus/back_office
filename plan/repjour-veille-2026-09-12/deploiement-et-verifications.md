# Déploiement du 2026-09-12 — pipeline RepJour

Ce fichier trace CE QUI A ÉTÉ DÉPLOYÉ et CE QUI A ÉTÉ VÉRIFIÉ EN VRAI, pour que
la nuit suivante soit lisible sans avoir à rejouer le raisonnement.

## Déployé

| Objet | Avant | Après |
|---|---|---|
| Edge `import-report` | v39 (2026-09-06) | **v41** |
| Edge `send-report` | v51 (2026-09-06) | **v52** |
| Worker `stayntouch_in_to_supabase` | sans minuterie | handlers `email` + `scheduled`, `crons = ["*/2 0-4 * * *"]` |
| Base | — | `repjour_auto_send_log` + 3 contraintes de forme |

## Vérifié en conditions réelles

**Barrière de sécurité** (appels directs sur l'endpoint public) :

- `POST` sans secret → `401 {"error":"Non autorisé"}` — c'est NOTRE message, donc
  `verify_jwt=false` est bien actif et la garde du secret s'exécute ;
- `GET` → `405`, refusé avant toute lecture de secret ;
- `POST` avec `X-Import-Check: 1` mais sans secret → `401` : le nouveau point
  d'entrée ne court-circuite pas la barrière ;
- `POST` avec un mauvais secret → `401`.

**Worker après déploiement** (`wrangler versions view`) :

- `Handlers: email, scheduled` — le routage e-mail n'a pas été perdu ;
- `Secrets: IMPORT_SECRET` présent ;
- `env.IMPORT_ENDPOINT` et `env.REQUIRE_SENDER_AUTH="true"` préservés par
  `keep_vars = true`.

**Chaîne complète minuterie → Edge → base**, testée en accélérant temporairement
la minuterie à chaque minute, hors fenêtre horaire (aucun e-mail ne pouvait
partir) :

```
#5 21:42:05 cycle=2026-09-12 par=veille planifiée envoyé=false
   « hors fenêtre horaire — envoi auto ignoré »
```

Le Worker a répondu `Ok` à chaque déclenchement, sans erreur, et la ligne est
arrivée en base avec le bon cycle, le bon émetteur et le bon motif. La minuterie
de production a été restaurée immédiatement après.

⚠ Le premier essai avait conclu « aucune ligne » : la requête tournait à 21h41,
la première ligne est arrivée à 21h42. Compter une minute après le déploiement
avant de juger — Cloudflare ne déclenche pas à l'instant du déploiement.

**Déduplication du journal** : une cinquantaine de déclenchements n'ont produit
que 3 lignes, toutes identiques en motif. La règle « écrire au changement d'état »
fonctionne ; les quelques écritures en trop viennent d'une relecture du dernier
motif qui échoue parfois et retombe alors sur « écrire », ce qui est le défaut le
moins grave.

## NON vérifié — l'angle mort assumé

**Aucun import d'e-mail réel n'a été testé** après déploiement. Le chemin
critique (PMS → Cloudflare → Edge → base) n'a de preuve que le code, les tests et
l'audit. La première preuve réelle sera la nuit du 12 au 13 septembre.

Si l'ingestion échouait, le repli reste entier : import manuel dans l'application,
puis envoi manuel, disponible 24 h/24 et sans garde horaire.

## Le matin, pour savoir ce qui s'est passé

```sql
select to_char(created_at at time zone 'Europe/Paris','HH24:MI:SS') as heure,
       trigger_report, attempt, waited_seconds, sent, retryable, note
from public.repjour_auto_send_log
where cycle_date = current_date
order by created_at;
```

Une table vide pour un cycle donné signifie qu'aucune invocation n'a eu lieu —
donc que rien n'est arrivé, pas que tout s'est bien passé.
