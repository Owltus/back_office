# Étape 1 — Métier : format unique du couple + détection des comptes manquants

## Objectif

Poser le socle métier pur, sans dépendance React, que les étapes 2 et 3 consommeront :

1. une **fonction unique** de formatage du couple `(code, compte)` ;
2. un **helper de détection** des codes dont le compte est requis mais manquant ;
3. une **notice** `compte-manquant` dans le modèle de notices.

## Contexte

Aujourd'hui le couple est formaté à trois endroits avec trois conventions différentes
(`stampLayout.ts:78-86`, `HistoriqueDialog.tsx:113-115`, chips `InvoicePanel.tsx:732-734`),
et rien ne signale un compte manquant (`notices.ts:24-77` ne parle que de codes/émetteur).
Cette étape centralise ces deux logiques.

## Fichier(s) impacté(s)

- `src/lib/facturation/imputationFormat.ts` (nouveau)
- `src/lib/facturation/budgetRegistry.ts`
- `src/lib/facturation/notices.ts`
- `src/lib/facturation/types.ts` (si le type de notice est énuméré)
- `src/lib/facturation/facturation.test.ts`

## Travail à réaliser

### 1. `imputationFormat.ts` — source unique du rendu du couple

Fonction pure exposant à la fois les parties (pour un rendu riche) et une chaîne prête à
l'emploi. Le séparateur écran est `·` ; l'appelant PDF pourra réutiliser les parties pour
son propre alignement en colonnes (cf. A2).

```ts
export interface ImputationParts {
  code: string
  compte: string
  hasCompte: boolean
}

export function imputationParts(code: string, compte: string): ImputationParts {
  const c = (compte ?? '').trim()
  return { code, compte: c, hasCompte: c.length > 0 }
}

// Rendu écran homogène : `code · compte`, ou `code` seul si pas de compte.
export function formatImputation(code: string, compte: string): string {
  const p = imputationParts(code, compte)
  return p.hasCompte ? `${p.code} · ${p.compte}` : p.code
}
```

### 2. `budgetRegistry.ts` — détection des comptes manquants

Helper pur (le registre `comptesForCode` existe déjà, `budgetRegistry.ts:66`). On garde
l'appelant maître du résolveur pour rester testable.

```ts
// Codes retenus qui EXIGENT un compte (>= 2 comptes possibles au référentiel)
// mais dont aucun n'a été choisi (comptes[code] vide).
export function missingComptes(
  codes: string[],
  comptes: Record<string, string>,
  comptesFor: (code: string) => string[],
): string[] {
  return codes.filter((code) => {
    const chosen = (comptes[code] ?? '').trim()
    if (chosen) return false
    return comptesFor(code).length > 1
  })
}
```

Note A3 : un code à 0 compte au référentiel n'est PAS « manquant » (rien à choisir) — il
sera traité en indicateur discret à l'étape 2, pas en anomalie ici.

### 3. `notices.ts` — notice `compte-manquant`

Ajouter une notice reprenant `missingComptes`. Respecter le style des messages existants
(court, pas de « PDJ », ponctuation simple, cf. règle UX). Selon A1 :

- variante **avertir** : `kind: 'warning'`, n'affecte pas `canStamp` ;
- variante **bloquer** : `kind: 'error'`, consommée par `canStamp` à l'étape 2.

```ts
// Exemple (à ajuster à la forme réelle des notices) :
const manquants = missingComptes(record.codes, record.comptes, comptesForCode)
if (manquants.length > 0) {
  notices.push({
    id: 'compte-manquant',
    kind: 'warning', // ou 'error' selon A1
    text:
      manquants.length === 1
        ? `Compte à choisir pour ${manquants[0]}.`
        : `Comptes à choisir pour ${manquants.length} imputations.`,
  })
}
```

### 4. Tests

Dans `facturation.test.ts` : `formatImputation` (avec/sans compte, compte espacé),
`imputationParts`, `missingComptes` (0 compte → non listé, 1 compte → non listé, ≥2 sans
choix → listé, ≥2 avec choix → non listé).

## Ordre d'exécution

1. Créer `imputationFormat.ts` + tests.
2. Ajouter `missingComptes` + tests.
3. Brancher la notice dans `notices.ts` (variante retenue en A1).

## Critère de validation

- `npx tsc --noEmit` propre.
- Nouveaux tests verts (`pnpm test` ou équivalent du projet).
- Aucun composant modifié à ce stade (socle pur uniquement).
