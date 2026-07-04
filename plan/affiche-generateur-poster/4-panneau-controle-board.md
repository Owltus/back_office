# Étape 4 — Panneau de contrôle et orchestration (AffichageBoard)

## Objectif

Créer le composant `AffichageBoard` qui héberge l'état complet, le panneau de contrôle (formulaire de saisie, dropdowns, sliders), l'orchestration mode auto/manuel et l'impression. C'est l'équivalent React de `Controls` + `app.js` du fork, dans le thème sombre Tailwind/shadcn de l'app.

## Fichier(s) impacté(s)

- `src/components/affiche/AffichageBoard.tsx` (nouveau)
- `src/lib/afficheStore.ts` (nouveau, si Option A de l'index)

Sources fork : `assets/js/app.js`, `assets/js/controls.js`, structure du `control-panel` (`index.html` lignes 24-194).

## Travail à réaliser

### 1. Modèle d'état

Un objet d'état unique (ou champs `useState`/store) :

```ts
{
  titleFr, messageFr, titleEn, messageEn,   // strings
  selectedIcon,        // clé d'icône ou 'none'
  colorKey,            // ColorKey, défaut 'okko'
  selectedTemplate,    // clé de template
  dateStart, dateEnd,  // 'YYYY-MM-DD'
  timeStart, timeEnd,  // 'HH:MM'
  isAutoSizeMode,      // bool, défaut true
  fontSizeIcon, fontSizeTitle, fontSizeMessage, fontSizeInfo,  // nombres (dérivés en auto)
}
```

État initial = contenu du **premier template** (`getTemplatesList()[0]` = `coffee_broken`) + couleur `okko` + mode auto (le fork ne démarre jamais vide).

Si Option A : `src/lib/afficheStore.ts` calqué sur `pdjStore.ts` (singleton `Store` + actions `setAffiche…`/`resetAffiche`, types sérialisables). Sinon `useState` local.

### 2. Recalcul des tailles (mode auto)

Porter `updateSizeMode()` : quand `isAutoSizeMode` est vrai, recalculer les 4 tailles via `calculateAutoSizes(...)` à chaque changement de contenu (titre/message FR/EN, icône, langues). Reproduire fidèlement les valeurs codées en dur du fork : `showDates=true` et `showHours=true` sont **toujours** passés à `calculateAutoSizes` indépendamment de la présence réelle de dates/heures (controls.js l.240-241). La taille icône est recalculée via `calculateIconSize(...)` (`adjustIconSize`).

Implémentation React : un `useEffect` dépendant de `[titleFr, messageFr, titleEn, messageEn, selectedIcon, isAutoSizeMode]` qui, si auto, écrit les 4 tailles dans l'état. En mode manuel, les sliders pilotent directement les tailles.

### 3. Panneau de contrôle (Tailwind + shadcn)

Reproduire les sections du fork avec les composants maison, dans le thème sombre (`bg-card`, `border-border`, `rounded-xl`…), le panneau à gauche et l'aperçu à droite (layout `flex`, panneau largeur fixe ~320px, `print:hidden` sur tout le panneau) :

- Templates : `Select` (shadcn) peuplé par `getTemplatesList()`. Sélection → applique le template (remplace les 4 textes + icône + couleur, puis recalcul auto).
- Textes FR : `Input` (titre) + `Textarea` (message). Textes EN : idem.
- Icône : `Select` ou `Popover` listant `getAvailableIcons()` avec aperçu SVG + nom.
- Couleur : `Select`/`Popover` listant les 5 thèmes, pastille = dégradé `linear-gradient(135deg, bg 0-50%, border 50-100%)`.
- Date : 2 `Input type="date"` (début/fin). Horaires : 2 `Input type="time"`.
- Tailles : `Switch` (shadcn) « Taille automatique » ; bloc `#manualSizeControls` avec 4 `Slider` (icône, titre, description, info) affiché seulement en mode manuel. Bornes des sliders identiques au fork (icône 80-200/140, titre 30-80/56, message 16-40/26, info 14-30/18).
- Bouton « Imprimer » : `<Button>` + icône `Printer` (lucide).

Reproduire `updateVisibleControls()` : en mode manuel uniquement, masquer les sliders dont le contenu associé est absent (icône si `none`, titre si FR+EN vides, description si FR+EN vides, dates/horaires si les deux dates vides).

### 4. Impression

Reprendre le pattern PDJ (`handlePrint`) : modifier temporairement `document.title` (ex. `Affiche_JJ-MM-AAAA` ou nom métier) autour de `window.print()`, restaurer après 100 ms. Le rendu print est piloté par le CSS de l'étape 5.

### 5. Composition

`AffichageBoard` rend : `<div>` racine `flex`, panneau de contrôle (`print:hidden`) à gauche, wrapper d'aperçu à droite contenant `<Poster {...state} />` avec le transform d'échelle. Sous-composants privés dans le même fichier (dropdowns, groupe de sliders), sur le modèle `BreakfastBoard.tsx`.

## Ordre d'exécution

1. Modèle d'état + état initial (premier template) + store optionnel.
2. Effet de recalcul auto des tailles (`showDates/showHours` forcés à true).
3. Panneau de contrôle (sections, dropdowns, sliders, visibilité conditionnelle).
4. `handlePrint`.
5. Composition board + aperçu.

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- Sélectionner un template remplit les 4 textes + icône + couleur et recalcule les tailles.
- Bascule auto/manuel : en auto les sliders sont masqués et pilotés par l'algo ; en manuel ils sont visibles et modifient l'affiche.
- Saisir des dates/heures met à jour la zone info de l'affiche (FR + EN si contenu EN présent).
- Bouton Imprimer déclenche l'aperçu navigateur.
