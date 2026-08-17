# Étape 1 — Tooltips des cartes du haut de /pdj

## Objectif

Ajouter la prop `hint` (déjà supportée par `StatTile`, non utilisée ici) aux
6 cartes de synthèse en haut de la page `/pdj`, pour expliquer au survol ce
que chacune mesure — même mécanisme et même ton que les 4 cartes du haut de
`/repjour` (`SummaryCards.tsx`, déjà équipées).

## Fichier(s) impacté(s)

- `src/components/pdj/BreakfastBoard.tsx` (modifié) — 6 `<StatTile>`, lignes
  ~1018-1111

## Travail à réaliser

### 1. Ajouter `hint` à chacune des 6 cartes

Textes proposés (D1, ajustables), dérivés des calculs réels (`stats`,
`ca = computePdjCA(...)`, `captageDay`, `extrasCount` — cf. code déjà lu) :

```tsx
<StatTile
  value={stats.rooms}
  label="Chambres occupées"
  accent="#818cf8"
  hint="Nombre de chambres occupées ce jour (présentes dans l'import In-House), qu'elles aient du petit-déjeuner inclus ou non."
  sub={...}
/>

<StatTile
  value={stats.guests}
  label="Clients"
  accent="#38bdf8"
  hint="Nombre total de clients logés ce jour, toutes chambres occupées confondues."
  sub={...}
/>

<StatTile
  value={stats.breakfasts}
  label="PDJ inclus"
  accent="#34d399"
  hint="Petits-déjeuners dus ce jour : inclus au tarif de la réservation, facturés même si le client ne les a pas encore pris."
  sub={...}
/>

<StatTile
  value={extrasCount}
  label="PDJ Extra"
  accent="#fbbf24"
  printHidden
  hint="Petits-déjeuners servis au-delà de ce qui était inclus, valorisés au tarif PDJ standard."
  sub={...}
/>

<StatTile
  printHidden
  label="CA PDJ"
  accent="#60a5fa"
  hint="Chiffre d'affaires HT du petit-déjeuner ce jour : inclus valorisés au tarif de leur code, extras au tarif PDJ standard."
  value={...}
  sub={...}
/>

<StatTile
  printHidden
  label="Taux de captage"
  accent="#f472b6"
  hint="Part des clients logés ayant pris un petit-déjeuner ce jour (inclus + extras ÷ clients). « — » si aucune donnée client."
  value={...}
  sub={...}
/>
```

Ne toucher à AUCUNE autre prop (`value`, `sub`, `accent`, `printHidden`,
`className`) — uniquement l'ajout de `hint`.

## Ordre d'exécution

1. Ajouter les 6 `hint` un par un, dans l'ordre du fichier.

## Critère de validation

- `npx tsc --noEmit`
- Vérification visuelle : survoler chaque carte affiche son tooltip, centré,
  sans troncature ni débordement (`max-w-56` déjà géré par `StatTile`).
