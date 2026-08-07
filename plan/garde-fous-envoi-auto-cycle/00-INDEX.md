# Plan — Garde-fous d'envoi automatique alignés sur le cycle hôtelier (2h→2h)

## Contexte

L'envoi automatique RepJour & PDJ fonctionne (validé en réel le 2026-08-08). Mais
deux règles métier ne sont pas pleinement respectées :

1. **RepJour = Comparison ET Forecast du CYCLE COURANT.** Aujourd'hui l'auto-send
   part si un forecast EXISTE en base, même périmé. La nuit du 2026-08-08 le
   Forecast a échoué (422) mais le RepJour est parti quand même, avec un projeté
   potentiellement périmé. Règle voulue : **tant que les deux ne sont pas frais,
   on n'envoie RIEN en auto** (le manuel reste possible).
2. **Un seul envoi AUTO par cycle, puis manuel seulement.** L'idempotence existe
   déjà (`daily_reports.auto_sent_at`, table `pdj_auto_send_log`) et le manuel ne
   la consulte pas — donc c'est presque acquis, mais il faut **caler la fenêtre de
   récence et la notion de "cycle" sur la frontière 02h00**, pas sur minuit.

Principe : additif et prudent. On ne casse pas l'existant (envoi manuel, imports).
Toute écriture SQL est non destructive et exécutée par l'utilisateur.

## Cycle hôtelier

`src/lib/businessDay.ts` définit déjà la frontière : la journée bascule à **02h00**
(`DAY_CUTOFF_HOUR=2`, `businessNow`, `businessDateStr`). C'est CÔTÉ CLIENT ; les
Edge Functions (Deno) ne peuvent pas l'importer → on recopie ce petit helper en
Deno (comme les autres modules `_shared`).

## Phases

| # | Fichier | Phase | Dépend de | Effort | Critique |
|---|---------|-------|-----------|--------|----------|
| 1 | [1-helper-cycle-deno.md](./1-helper-cycle-deno.md) | Helper cycle métier (02h) porté en Deno | — | 30 min | |
| 2 | [2-fraicheur-forecast.md](./2-fraicheur-forecast.md) | Fraîcheur du Forecast (colonne `imported_at` + estampillage import) | 1 | 1 h | ⚠ |
| 3 | [3-garde-fou-repjour.md](./3-garde-fou-repjour.md) | RepJour auto : exiger Comparison + Forecast FRAIS, sinon rien (manuel ok) | 1,2 | 2 h | ⚠ |
| 4 | [4-alignement-cycle-pdj.md](./4-alignement-cycle-pdj.md) | PDJ auto : récence + idempotence calées sur le cycle 02h | 1 | 45 min | |
| 5 | [5-validation-deploiement.md](./5-validation-deploiement.md) | Validation dry-run/réel + déploiement (`--no-verify-jwt`) | 1-4 | 1 h | ⚠ |

## Ordre d'exécution

Séquentiel : 1 → 2 → 3 → 4 → 5. (2 et 3 sont le cœur ; 4 est léger ; 5 clôt.)

## Garanties à préserver (non négociables)

- **L'envoi MANUEL reste toujours possible** (bouton admin), **non bridé** par
  `auto_sent_at` / `pdj_auto_send_log` — c'est le filet quand l'auto s'abstient.
- **Un seul envoi AUTO par cycle** (idempotence atomique déjà en place).
- **Aucune régression** sur l'import ni sur le PDJ (jugé OK par l'utilisateur).
- **`import-report` se redéploie TOUJOURS avec `--no-verify-jwt`** (sinon 401).

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Edge (Deno) | `functions/import-report/{autoSend,autoSendPdj,repjour,index}.ts` | `functions/_shared/businessDay.ts` |
| SQL | — | `supabase/forecast_days_imported_at.sql` |

| **Total** | **~4 modifiés** | **~2 nouveaux** |
