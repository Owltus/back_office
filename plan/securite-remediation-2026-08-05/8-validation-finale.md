# Étape 8 — [ASSISTANT + TOI] Validation finale et clôture

## Objectif

Confirmer que chaque finding du pentest #2 est clos (ou accepté), dater le re-test,
mettre à jour la documentation et la mémoire.

## Répartition
- **ASSISTANT** : rédige `doc/pentest-2026-08-05/retest-2026-08-05.md` (verdict finding par finding), met à jour `CLAUDE.md` (faits sécurité) et la mémoire, pousse.
- **TOI** : 2 contrôles rapides (ci-dessous).

## Contrôles

### Côté assistant (automatique)
- `npx tsc --noEmit` + tests + `pnpm build` au vert.
- Relecture : chaque finding A1–B12 → CLOS / ACCEPTÉ / REPORTÉ.

### Côté toi (guidage)
1. **HSTS en prod** — dans un terminal : `curl -sI https://<ton-domaine> | grep -i strict-transport`. Attendu : une ligne `strict-transport-security: max-age=...`. Colle-moi le résultat.
2. **Contre-signature caisse (A3)** — facultatif : dans `/caisse`, le flux normal doit fonctionner comme avant (rien ne change à l'usage ; seule la forge par API directe est bloquée).

## Critère de validation

- `retest-2026-08-05.md` complet, chaque finding avec un verdict.
- Aucun finding « ouvert » sans décision.
- HSTS confirmé présent en prod.

## Contrôle /borg

Audit final : (1) aucune régression fonctionnelle (caisse, rapro, facturation, comptes) ; (2) les gardes inter-admin (A2/A4) n'empêchent pas les opérations légitimes ; (3) la RPC d'apprentissage idempotente (A1) apprend toujours correctement une nouvelle facture ; (4) `audit_log` reçoit bien les nouvelles traces.
