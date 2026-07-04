# Plan — Générateur d'affiches A3 (fork poster-okko-generator)

## Contexte

L'utilisateur veut porter son projet `poster-okko-generator` (générateur d'affiches A3 bilingues FR/EN pour OKKO Hotels, écrit en JS/CSS vanilla, zéro dépendance) dans la page `/affichage` de l'app Back Office. La logique et le fonctionnement doivent être reproduits fidèlement, mais l'implémentation doit utiliser exclusivement la stack maison : TanStack Start + React 19, Tailwind v4 et les composants shadcn/ui existants, dans le thème sombre navy des autres pages. Comme pour le fork PDJ précédent, la priorité est la fidélité du rendu imprimé (PDF A3) : les affiches déjà imprimées doivent rester compatibles.

Le fork n'a aucun state store, aucun localStorage, aucun virtual DOM : l'état vit dans les inputs DOM et deux instances impératives (`Poster`, `Controls`) qui réécrivent le DOM. Le portage consiste à transformer cet état impératif en état React (un objet de contenu + options + tailles), à extraire les modules purs (`SizeCalculator`, `DateFormatter`) en fonctions pures, et à convertir `Poster.update()` en rendu JSX.

## Angles à clarifier

Arbitrages de portage tranchés par l'utilisateur avant exécution (les couches explorées étaient disjointes, aucune divergence entre agents) :

- Persistance de la saisie entre navigations : **Option A retenue** — créer `src/lib/afficheStore.ts` calqué sur `pdjStore.ts` (le contenu survit au changement d'onglet). Étape 4.
- Rendu des messages : **Option A retenue** — stocker les templates avec des `\n\n` (au lieu de `<br><br>`) et faire un rendu contrôlé `\n` → `<br>`, sans `dangerouslySetInnerHTML` sur la saisie libre. Étapes 1 et 3.
- Police de l'affiche : **Option A retenue** — charger Poppins 400/600/800 pour l'affiche (le chrome garde Inter) afin de préserver les tailles calculées. Étape 5.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-logique-metier-pure.md](./1-logique-metier-pure.md) | Logique métier et constantes portées en fonctions pures | — | P0 | 2h | `config.ts`, `dateFormatter.ts`, `sizeCalculator.ts`, `templates.ts` | |
| 2 | [2-assets-svg.md](./2-assets-svg.md) | Logo bicolore et collection d'icônes en modules React | — | P0 | 1h30 | `icons.ts`, `PosterLogo.tsx` | |
| 3 | [3-composant-poster.md](./3-composant-poster.md) | Rendu JSX de l'affiche A3 + hook de mise à l'échelle | 1, 2 | P0 | 2h | `Poster.tsx` | |
| 4 | [4-panneau-controle-board.md](./4-panneau-controle-board.md) | Panneau de contrôle, orchestration état, impression | 1, 2, 3 | P0 | 3h | `AffichageBoard.tsx`, `afficheStore.ts` (opt.) | |
| 5 | [5-styles-ecran-impression.md](./5-styles-ecran-impression.md) | CSS écran + `@media print` A3 fidèle au fork | 3 | P0 | 1h30 | section `poster-*` dans `styles.css` | |
| 6 | [6-cablage-route-validation.md](./6-cablage-route-validation.md) | Câblage route `/affichage` + audit de conformité | 1-5 | P0 | 1h | `affichage.tsx` | ⚠ |

## Ordre d'exécution

Séquentiel pour la cohérence des dépendances, mais les étapes 1 et 2 sont parallélisables (aucune dépendance mutuelle). Ordre recommandé : 1 et 2 d'abord (fondations pures), puis 3 (le poster consomme les deux), puis 4 (le board consomme le poster), puis 5 (styles du poster déjà rendu), enfin 6 (câblage et audit global). L'étape 5 peut démarrer dès que 3 est posée.

## Architecture cible

```
src/
├── lib/
│   ├── poster/
│   │   ├── config.ts          ← couleurs (5 thèmes), dimensions A3, defaults
│   │   ├── dateFormatter.ts    ← formatDateFr/En, formatTimeFr/En, getDateString/getTimeString
│   │   ├── sizeCalculator.ts   ← calculateAutoSizes, calculateIconSize, estimations
│   │   ├── templates.ts        ← 7 templates prédéfinis + getTemplatesList/getTemplate
│   │   └── icons.ts            ← collection ~37 icônes SVG + API (getSVG, getAvailableIcons…)
│   └── afficheStore.ts         ← (optionnel) persistance TanStack Store
├── components/
│   └── affiche/
│       ├── AffichageBoard.tsx  ← état, panneau de contrôle, handlePrint, orchestration
│       ├── Poster.tsx          ← rendu JSX de l'affiche A3 (props → JSX)
│       └── PosterLogo.tsx      ← logo OKKO bicolore paramétré par thème
├── routes/
│   └── affichage.tsx           ← <AffichageBoard /> (remplace <ComingSoon />), print:p-0
└── styles.css                  ← section .poster-* (écran + @media print A3)
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Logique métier | — | `src/lib/poster/config.ts`, `src/lib/poster/dateFormatter.ts`, `src/lib/poster/sizeCalculator.ts`, `src/lib/poster/templates.ts`, `src/lib/poster/icons.ts` |
| Persistance | — | `src/lib/afficheStore.ts` (si Option A) |
| Composants | — | `src/components/affiche/AffichageBoard.tsx`, `src/components/affiche/Poster.tsx`, `src/components/affiche/PosterLogo.tsx` |
| Routing | `src/routes/affichage.tsx` | — |
| Styles | `src/styles.css` | — |
| **Total** | **2 modifiés** | **8 nouveaux** (9 avec Option A) |
