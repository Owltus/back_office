# Étape 4 — Modal : affichage, filtre et recherche par tag

## Objectif

Dans le modal `CodePicker` : afficher les tags sur chaque ligne, ajouter une barre
de filtre par tag (cliquer un tag ne montre que les lignes de ce domaine), et
inclure les tags dans la recherche texte.

## Contexte

`CodePicker` filtre déjà par tokens ET sur un `INDEX` pré-calculé
(`search = normalize(code + label + category + hint)`) et groupe par `category`.
On étend : (1) `search` inclut les tags ; (2) un état `activeTag` filtre en ET avec
la recherche (D5, option A : un seul tag actif) ; (3) chaque ligne montre ses tags.

## Fichier(s) impacté(s)

- `src/components/facturation/CodePicker.tsx` (modification)

## Travail à réaliser

### 1. Inclure les tags dans l'index de recherche

```ts
const INDEX = BUDGET_LINES.map((l) => ({
  line: l,
  search: normalize(
    `${l.code} ${l.label} ${l.category} ${l.hint ?? ''} ${l.tags.join(' ')}`,
  ),
}))
```

### 2. État + barre de filtre par tag

Ajouter à côté de `q` :

```ts
const [activeTag, setActiveTag] = useState<string | null>(null)
```

Insérer une barre de chips entre la zone de recherche et la liste (utilise le
composant `Tag` de l'étape 3, en mode cliquable). Cliquer le tag actif le
désélectionne :

```tsx
<div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2">
  {TAGS.map((t) => (
    <Tag
      key={t}
      label={t}
      active={activeTag === t}
      onClick={() => setActiveTag((cur) => (cur === t ? null : t))}
    />
  ))}
</div>
```

### 3. Appliquer le filtre (ET avec la recherche texte)

Dans le `useMemo`, ajouter le test tag et la dépendance `activeTag` :

```ts
const groups = useMemo(() => {
  const tokens = normalize(q).split(/\s+/).filter(Boolean)
  const out: { category: string; lines: typeof BUDGET_LINES }[] = []
  for (const it of INDEX) {
    if (activeTag && !it.line.tags.includes(activeTag)) continue
    if (!tokens.every((t) => it.search.includes(t))) continue
    // …regroupement inchangé…
  }
  return out
}, [q, activeTag])
```

### 4. Afficher les tags sur chaque ligne

Dans le bloc `min-w-0 flex-1` d'une ligne, après le hint (ou après le
code/label), une rangée de tags passifs :

```tsx
{l.tags.length > 0 && (
  <span className="mt-1 flex flex-wrap gap-1">
    {l.tags.map((t) => (
      <Tag key={t} label={t} />
    ))}
  </span>
)}
```

Imports à ajouter : `Tag` depuis `#/components/facturation/Tag.tsx`, `TAGS` depuis
`#/lib/facturation/constants.ts`.

### 5. Détails UX

- Réinitialiser `activeTag` à la fermeture du modal n'est pas obligatoire (l'état
  est local au composant, remonté à chaque ouverture si `CodePicker` est démonté ;
  vérifier qu'il l'est — sinon reset sur `open` passant à `false`).
- L'état vide « Aucune ligne ne correspond » doit tenir compte du tag actif dans son
  message si utile (facultatif).

## Ordre d'exécution

1. Étendre `INDEX.search` avec les tags.
2. Ajouter `activeTag` + la barre de chips.
3. Brancher le filtre dans le `useMemo`.
4. Afficher les tags par ligne.
5. `npx tsc --noEmit`.

## Critère de validation

- Chaque ligne du modal affiche ses tags colorés.
- Cliquer « Hébergement » ne montre que les lignes tagguées Hébergement ; recliquer
  désélectionne.
- Le filtre par tag se combine en ET avec la recherche texte (ex. tag « Restauration »
  + « alcool »).
- Taper « rh » (ou « hebergement ») dans la recherche remonte les lignes tagguées
  correspondantes.
