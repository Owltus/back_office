# Étape 1 — Socle de rendu : directives, figures, pipeline partagé

## Objectif

Poser la mécanique commune aux trois blocs, sans encore changer l'aspect d'un
document existant : `remark-directive` filtré par une liste blanche, la
transformation « image seule → figure », et un pipeline unique utilisé partout
où du Markdown du Classeur est rendu.

## Fichier(s) impacté(s)

- `package.json`, `pnpm-lock.yaml` (`remark-directive@^4`)
- `src/lib/classeur/print/pipeline.ts` (nouveau)
- `src/lib/classeur/print/remarkBlocs.ts` (nouveau) + test
- `src/lib/classeur/print/rehypeFigures.ts` (nouveau) + test
- `src/components/classeur/print/DocumentPages.tsx` (l. ~179-180)
- `src/components/classeur/dialogs/AideMiseEnFormeDialog.tsx` (l. ~91)

## Travail à réaliser

### 1. Dépendance

`pnpm add remark-directive@^4` — même génération que react-markdown 10
(unified 11, micromark 4), vérifiée au banc par l'agent avec remark-gfm 4.

### 2. `remarkBlocs` — liste blanche ET remise en texte

Piège vérifié au banc : `remark-directive` lit aussi `:mot` comme directive
de TEXTE, chiffres compris — `RDV à 10:30, code:4400.` perd silencieusement
`:30` et `:4400`. Aucun document n'est touché aujourd'hui, mais tout « 10:30 »
tapé demain le serait. Donc :

- `containerDirective` dont le nom ∈ { `photos`, `etape` } → `data.hName =
  'div'`, `data.hProperties = { dataBloc: nom }` (la position est recopiée par
  remark-rehype : `data-ligne` suit) ;
- TOUTE autre directive (texte, feuille, conteneur inconnu) → remise en texte
  à partir de la SOURCE (offsets `position.start/end`), jamais reconstruite
  depuis l'arbre (perdrait la casse, les espaces, les attributs).

```ts
export function remarkBlocs() {
  return (arbre: Root, fichier: VFile) => { /* visit… */ }
}
```

Note : `::: photos` (avec espace, forme VitePress) n'est PAS reconnu par le
parseur : il reste du texte. La relecture (étape 6) le signalera.

### 3. `rehypeFigures`

`p` dont le SEUL enfant significatif est un `img` → `figure` (position du `p`
recopiée) contenant l'`img` et, si la légende est affichable (`legende.ts`,
étape 2), un `figcaption`. Placé AVANT `rehypeLignesSource`.

### 4. Pipeline partagé

```ts
export const REMARK_CLASSEUR = [remarkGfm, remarkMath, remarkDirective, remarkBlocs]
export const REHYPE_CLASSEUR = [rehypeKatex, rehypeFigures, rehypeLignesSource]
```

`DocumentPages` et `AideMiseEnFormeDialog` importent ces deux listes.

## Critère de validation

- Tests `remarkBlocs` : `10:30`, `code:4400`, `:::inconnu`, `::feuille`,
  `::: photos` restent du texte à l'identique ; `:::photos` produit
  `div[data-bloc=photos]` avec `data-ligne`.
- Tests `rehypeFigures` : image seule → figure ; image dans une phrase ou un
  lien → inchangée ; deux images dans un même paragraphe → inchangées.
- Mutation à la main (retirer la remise en texte) attrapée par un test.
- Les 86 documents réels rendent un texte IDENTIQUE avant/après (banc
  navigateur en lecture seule, comme le 2026-09-30) : seule la balise des
  images seules change.
- `npx tsc --noEmit`, `pnpm vitest run src/lib/classeur`.

## Contrôle /borg

- Aucun texte perdu par les directives (comparaison des 86 documents).
- `data-ligne` toujours posé (clic aperçu → ligne).
- Le chunk de `remark-directive` reste dans celui du Classeur (`pnpm build`).
