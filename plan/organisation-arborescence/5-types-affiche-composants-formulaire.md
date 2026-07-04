# Étape 5 — Types affiche unifiés et contrôles de formulaire extraits

## Objectif

Éliminer la duplication de type `PosterProps` ≅ `AfficheState` via un type canonique `PosterContent` (arbitrage D7), absorber `parseDateStr`/`formatDateStr` dans `dateFormatter.ts` (D6), centraliser la règle `showEnglish`, et extraire les cinq contrôles de formulaire génériques d'`AffichageBoard.tsx` vers `components/form/fields.tsx` (D2). `AffichageBoard.tsx` passe de 756 lignes à un board orchestrateur.

## Fichier(s) impacté(s)

- `src/lib/poster/types.ts` (nouveau)
- `src/lib/poster/dateFormatter.ts` (modification : ajout de `parseDateStr`/`formatDateStr`)
- `src/lib/poster/sizeCalculator.ts` (modification : champs d'`AutoSizes` renommés `fontSizeTitle`/`fontSizeMessage`/`fontSizeInfo`)
- `src/lib/afficheStore.ts` (modification : `AfficheState` dérive de `PosterContent`)
- `src/components/affiche/Poster.tsx` (modification : `PosterProps` dérive de `PosterContent`, `showEnglish` importé)
- `src/components/affiche/AffichageBoard.tsx` (modification : suppression du re-mapping et des sous-composants extraits)
- `src/components/form/fields.tsx` (nouveau)

## Travail à réaliser

### 1. Créer `src/lib/poster/types.ts`

Définir le type canonique `PosterContent` (textes FR/EN, `selectedIcon`, `colorKey`, dates/heures, `fontSizeTitle`/`fontSizeMessage`/`fontSizeInfo` — nommage du store retenu) et le helper pur :

```ts
export function hasEnglishContent(c: Pick<PosterContent, 'titleEn' | 'messageEn'>): boolean {
  return c.titleEn.trim() !== '' || c.messageEn.trim() !== ''
}
```

`AfficheState` (`afficheStore.ts:12-33`) devient une extension de `PosterContent` ; `PosterProps` (`Poster.tsx:32-66`) en dérive (`PosterContent` directement ou `Pick<…>`), supprimant la double déclaration des 16 champs.

### 2. Aligner `sizeCalculator.ts`

Renommer les champs du type de retour `AutoSizes` (`title`/`message`/`info` → `fontSizeTitle`/`fontSizeMessage`/`fontSizeInfo`) et supprimer le re-mapping manuel d'`AffichageBoard.tsx:151-160` (spread direct possible).

### 3. Absorber les helpers de date

Déplacer `parseDateStr` (`AffichageBoard.tsx:75-79`) et `formatDateStr` (`:82-86`) dans `lib/poster/dateFormatter.ts` tels quels, sans toucher aux fonctions existantes du module.

### 4. Extraire `src/components/form/fields.tsx`

Y déplacer `Field` (`AffichageBoard.tsx:548`), `DateField` (`:569`), `TimeField` (`:625`), `TimeColumn` (`:686`), `SizeSlider` (`:727`) avec leurs props, en named exports, conventions maison (simple quotes, alias `#/`). Les constantes `HOURS`/`MINUTES` (`:88-91`) suivent les composants qui les consomment. `colorSwatch` (`:98-104`) reste dans le board (présentation, arbitrage D8).

## Ordre d'exécution

1. Créer `types.ts`, aligner `sizeCalculator.ts` et `dateFormatter.ts`.
2. Basculer `afficheStore.ts` puis `Poster.tsx` sur `PosterContent`.
3. Extraire `form/fields.tsx` et alléger `AffichageBoard.tsx`.
4. Typecheck et vérification visuelle.

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- Sur `/affichage` : rendu de l'affiche identique au pixel (templates, tailles auto, couleurs, bascule EN) ; contrôles de formulaire fonctionnels (dates, heures, sliders).
- Plus aucune interface dupliquée : la forme du contenu d'affiche n'est déclarée qu'une fois (`PosterContent`).
