# Étape 1 — C1/E2 : XSS stocké dans le tooltip de la galaxie facturation

## Objectif

Supprimer le seul XSS stocké réel de l'app : la branche « arête » du formatter de
tooltip ECharts (`GalaxyChart.tsx`) interpole des libellés de nœuds (noms
d'émetteur issus de PDF/OCR, donc contrôlés par un tiers) en `innerHTML` sans
échappement. La branche « nœud » juste à côté échappe déjà — c'est un oubli isolé.

## Contexte

Chaîne d'attaque (CRITIQUE) : un fournisseur émet une facture dont la raison
sociale contient `<img src=x onerror=...>`. Un admin la traite dans `/facturation`
(le nom est appris et persisté), puis survole l'arête correspondante dans
`/facturation/galaxie` -> le payload s'exécute dans la session admin et peut lire
les tokens Supabase en `localStorage` (prise de contrôle du compte). Le correctif
casse le maillon XSS ; le maillon localStorage (F1) reste structurel et accepté.

## Fichier(s) impacté(s)

- `src/components/facturation/GalaxyChart.tsx`

## Travail à réaliser

### 1. Compléter `escapeHtml` (vers ligne 213) pour couvrir `"` et `'`

État actuel (3 caractères seulement) :

```ts
const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
```

Cible (aligné sur `src/lib/repjour/reportHtml.ts`, 5 caractères) :

```ts
const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
```

### 2. Échapper `s` et `t` dans la branche arête (vers lignes 481-485)

État actuel (vecteur) :

```ts
if (p.dataType === 'edge') {
  const s = labelById.get(p.data.source ?? '') ?? p.data.source
  const t = labelById.get(p.data.target ?? '') ?? p.data.target
  return `<span style="color:#94a3b8">Fournisseur → imputation</span><br>${s} → ${t}`
}
```

Cible :

```ts
if (p.dataType === 'edge') {
  const s = labelById.get(p.data.source ?? '') ?? p.data.source ?? ''
  const t = labelById.get(p.data.target ?? '') ?? p.data.target ?? ''
  return `<span style="color:#94a3b8">Fournisseur → imputation</span><br>${escapeHtml(s)} → ${escapeHtml(t)}`
}
```

Le `?? ''` est nécessaire : `p.data.source`/`target` sont `string | undefined` et
`escapeHtml` attend une `string`.

## Ordre d'exécution

1. Modifier `escapeHtml`.
2. Modifier la branche arête.
3. `npx tsc --noEmit` puis `pnpm build`.
4. `git commit` + `git push` (déploiement Vercel automatique).

## Critère de validation

- `npx tsc --noEmit` : 0 erreur.
- Vérif manuelle dans `/facturation/galaxie` : le tooltip d'arête affiche bien les
  noms (rendu inchangé pour un nom normal), et un nom contenant `<` s'affiche en
  texte littéral (pas d'exécution).
- Aucun autre sink HTML dans le fichier (vérifié : le formatter tooltip est le seul).
