# Étape 6 — Page de revue + déclaration denylist (UI)

## Objectif

Exposer la file de revue d'anomalies (étape 4) dans une interface de curation, et permettre
de résoudre chaque cas (désapprendre, bannir via denylist) — semi-autonome : le système
détecte, l'utilisateur valide.

## Contexte

Diagnostic des agents : l'atelier `FacturationBoard` est déjà saturé (3 colonnes). La revue
est une tâche de curation GLOBALE, de même nature que la galaxie → une page pleine sœur
`/facturation/revue` calquée sur `FacturationGalaxie` (D6, option A). `useFacturationModel`
expose déjà `serverPool`, `issuers`, `issuerCodes` (et, après l'étape 5, `issuerDenylist`).

## Fichier(s) impacté(s)

- `src/routes/facturation/revue.tsx` (nouveau, route)
- `src/components/facturation/FacturationRevue.tsx` (nouveau, page)
- `src/components/facturation/GalaxyCard.tsx` (lien vers la revue)
- `src/components/facturation/InvoicePanel.tsx` (action « bannir cet émetteur pour ce code »)

## Travail à réaliser

### 1. Route + page

- `routes/facturation/revue.tsx` : route `/facturation/revue` (même patron que `galaxie.tsx`,
  `ssr:false` si nécessaire). Réservée admin (cohérent avec la page).
- `FacturationRevue.tsx` : consomme `useFacturationModel`, calcule `reviewQueue(pool,
  issuerCodes)` (étape 4), liste les anomalies avec, pour chacune, les actions de résolution :
  - outlier émetteur→code : « désapprendre » (`unlearnIssuerCodes`) et/ou « bannir »
    (`addIssuerDeny`) ;
  - codes confusables : lien vers les deux nébuleuses (galaxie) pour inspection.
- Patch optimiste + invalidation des caches concernés après action (modèle
  `handleUndoLearn`).

### 2. Navigation

- Ajouter un lien « Revue / Anomalies » à côté du lien « Galaxie » (probablement
  `GalaxyCard`), avec un compteur d'anomalies si > 0.

### 3. Déclaration denylist depuis l'atelier

- `InvoicePanel` (`ImputationList`) : action discrète près du `X` de retrait — « ne plus
  jamais imputer cet émetteur sur ce code » → `addIssuerDeny(name, code)` (+ purge D5) +
  patch cache.

## Ordre d'exécution

1. Route + `FacturationRevue.tsx`.
2. Lien de navigation + compteur.
3. Action denylist dans `InvoicePanel`.
4. `npx tsc --noEmit` puis `npx vitest run` + `pnpm build`.

## Critère de validation

- `/facturation/revue` liste les anomalies calculées à la volée ; chaque action résout
  réellement (cache + serveur cohérents).
- Bannir un émetteur↔code depuis l'atelier fonctionne et l'exclut ensuite de la détection.
- Base vide → page « aucune anomalie » propre.
- `npx tsc --noEmit`, `npx vitest run`, `pnpm build` verts.
