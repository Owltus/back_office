# Étape 7 — Durcissement client & config (B3, B5, B6, B7)

## Objectif

Renforcer la défense en profondeur côté front/config, sans faille active à la clé :
retirer `'unsafe-inline'` de la CSP (B3), aligner les écritures `easter_eggs` sur
`is_admin()` (B5), clamper l'interpolation SVG du poster (B6), isoler l'iframe artefact
(B7).

## Fichier(s) impacté(s)

- `vercel.json` (CSP : hash du script de thème)
- `supabase/easter_eggs.sql` (écritures via `is_admin()`)
- `src/components/affiche/Poster.tsx` (clamp `fontSizeIcon`)
- `src/components/artefact/ArtefactBoard.tsx` (attribut `sandbox`)

## Travail à réaliser

### 1. B3 — CSP sans `'unsafe-inline'`

`'unsafe-inline'` n'est requis que par le script de thème inline
(`__root.tsx:75`, contenu statique `theme.ts:26`). Le remplacer par un **hash CSP** :
calculer `sha256` du contenu exact du script, et poser
`script-src 'self' 'wasm-unsafe-eval' 'sha256-...'` dans `vercel.json:12`. Garder
`'wasm-unsafe-eval'` (légitime pour Tesseract).

### 2. B5 — `easter_eggs` : `is_admin()` au lieu de `get_user_role()`

Dans `supabase/easter_eggs.sql:53,60-61,68`, remplacer `get_user_role() = 'admin'` par
`public.is_admin()` (déjà dans le dépôt, `page_permissions.sql:34`), pour supprimer la
dépendance à la fonction hors dépôt. Attention M1 : ce fichier recrée aussi la lecture
`using(true)` (`:44-46`) — la laisser telle quelle (config non sensible) OU l'aligner par
page ; ne pas rejouer ce fichier sans conscience de ses `drop policy`.

### 3. B6 — Poster : clamp de `fontSizeIcon`

`src/components/affiche/Poster.tsx:140` — avant interpolation dans la chaîne SVG :

```ts
const iconPx = Math.round(Math.max(0, Number(fontSizeIcon) || 0))
```

et utiliser `iconPx` dans `width:${iconPx}px;height:${iconPx}px`. Défense contre une
future régression de typage (valeur importée/chargée).

### 4. B7 — iframe artefact : `sandbox`

`src/components/artefact/ArtefactBoard.tsx:47` — ajouter `sandbox` à l'`<iframe srcDoc>`
(contenu statique de confiance, isolation par principe) :

```tsx
<iframe srcDoc={galleryHtml} sandbox="allow-scripts" title="Galerie d'effets" />
```

> `allow-scripts` seulement si la galerie exécute du JS ; sinon `sandbox=""`. À vérifier
> au rendu (les effets canvas peuvent nécessiter `allow-scripts`, mais pas
> `allow-same-origin`).

## Ordre d'exécution

1. Client : clamp Poster (B6), sandbox iframe (B7).
2. Config : CSP hash (B3) dans `vercel.json`.
3. DB : aligner `easter_eggs.sql` (B5) — exécuté par l'utilisateur.
4. `npx tsc --noEmit` + `pnpm build` ; déploiement front (`git push`) et Edge/SQL selon.

## Critère de validation

- `npx tsc --noEmit` OK, `pnpm build` OK.
- En preview prod : l'app charge sans violation CSP en console (le script de thème passe
  par son hash), l'OCR d'un PDF scanné fonctionne (`wasm-unsafe-eval` conservé).
- La galerie artefact s'affiche/anime toujours dans l'iframe sandboxée.
- Écriture `easter_eggs` par un non-admin refusée ; par un admin acceptée.
