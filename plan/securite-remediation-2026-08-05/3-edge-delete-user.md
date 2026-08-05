# Étape 3 — [ASSISTANT] delete-user : messages d'erreur génériques (B3)

## Objectif

Aligner `delete-user` sur le durcissement déjà appliqué à `create-user`/`send-report`
au pentest #1 : ne plus renvoyer au client les messages d'erreur Postgres/Auth
bruts (fuite d'info), les logger côté serveur uniquement.

## Findings couverts

- **B3** — `delete-user/index.ts:110,131` (et autres) renvoient `targetErr.message` / `profDelErr.message` / `delErr.message` bruts.

## Fichiers impactés

- `supabase/functions/delete-user/index.ts`

## Travail à réaliser

Pour chaque `return json({ error: <err>.message ... })` : remplacer par un message
générique fixe et `console.error(<contexte>, err)` avant le return. Exemple :
```ts
if (targetErr) {
  console.error('delete-user: lecture profil cible', targetErr)
  return json({ error: 'Vérification du compte échouée' }, 400)
}
```
Idem pour `profDelErr` et `delErr`.

## Ordre d'exécution

1. Éditer `delete-user/index.ts`.
2. Committer + pousser (le déploiement effectif est en fiche 6, à ta charge).

## Critère de validation

- Aucun `<err>.message` renvoyé au client dans `delete-user`.
- Cohérence avec `create-user`/`send-report` (même pattern « log serveur + message neutre »).
