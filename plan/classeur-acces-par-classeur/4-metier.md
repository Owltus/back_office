# Étape 4 — Métier TypeScript : miroir du niveau effectif

## Objectif

Que l'interface masque exactement ce que la base refuserait — ni plus, ni
moins. La base reste l'autorité ; le TypeScript ne sert qu'à masquer.

## Fichier(s) impacté(s)

- `src/lib/classeur/droits.ts` (réécrit)
- `src/lib/classeur/droits.test.ts`, `droits.property.test.ts` (nouveau)
- `src/lib/classeur/service.ts`, `keys.ts`, `types.ts`
- `src/components/classeur/hooks/useDroitsClasseur.ts`

## Travail à réaliser

### 1. `niveauEffectif` (pur)

```ts
type NiveauPage = 'lecture' | 'ecriture' | 'gestion' | null
type NiveauClasseur = 'aucun' | 'lecture' | 'ecriture'
type NiveauEffectif = NiveauClasseur | 'gestion'

function niveauEffectif(page, classeur: { acces_tous, created_by },
  exception: NiveauClasseur | null, userId): NiveauEffectif
```

Même ordre de priorité que `private.classeur_niveau`. Test de propriétés
(fast-check) : pour toute combinaison, `niveauEffectif` ≤ page (hors
gestion), exception prioritaire, créateur en écriture sauf exception.

### 2. Capacités dérivées

`peutLire`, `peutModifier`, `peutGererAcces`, `peutSupprimerClasseur`,
`peutRestaurer`, `peutViderHistorique`, `peutReordonnerListe`,
`peutCreerPrive` — la table « Ce que l'écriture ne permet PAS » de
`00-INDEX.md`, testée ligne à ligne.

### 3. Service et clés

- `fetchMesAcces()` : mes lignes de `classeur_acces` (RLS : les siennes) ;
- `fetchAccesClasseur(id)`, `definirAcces(id, userId, niveau | null)`,
  `definirAccesTous(id, niveau)` (gestion) ;
- `fetchPersonnesClasseur()` → RPC `classeur_personnes` ;
- clés `classeurKeys.mesAcces()`, `acces(id)`, `personnes()` — **exclues du
  cache disque** (noms, droits) dans `PREFIXES_SENSIBLES`.
- `COLS_CLASSEUR` : ajouter `acces_tous`.

### 4. `useDroitsClasseur(id)`

Rend `niveau` et les capacités ; `false` partout tant que le classeur et mes
accès ne sont pas chargés (on masque, jamais l'inverse).

## Critère de validation

- `npx tsc --noEmit`, `pnpm lint` sur `src/lib/classeur`,
  `npx vitest run src/lib/classeur` verts.
- Mutation manuelle : inverser la priorité exception / créateur fait échouer
  un test.
