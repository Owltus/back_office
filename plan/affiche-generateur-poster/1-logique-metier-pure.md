# Étape 1 — Logique métier et constantes en fonctions pures

## Objectif

Porter à l'identique les modules JS purs du fork (aucune dépendance DOM) en modules TypeScript sous `src/lib/poster/`. Ce sont les fonctions autoritaires du dimensionnement et du formatage : leurs constantes numériques doivent être recopiées au chiffre près, car elles conditionnent le rendu des affiches déjà imprimées.

## Fichier(s) impacté(s)

- `src/lib/poster/config.ts` (nouveau)
- `src/lib/poster/dateFormatter.ts` (nouveau)
- `src/lib/poster/sizeCalculator.ts` (nouveau)
- `src/lib/poster/templates.ts` (nouveau)

Sources fork : `assets/js/config.js`, `assets/js/date-formatter.js`, `assets/js/size-calculator.js`, `assets/js/templates.js`.

## Travail à réaliser

### 1. `config.ts` — constantes

Recopier `CONFIG` verbatim. Cinq thèmes de couleur, chacun `{ bg, text, border, icon, name }` :

```ts
export const COLORS = {
  bw:     { bg: '#ffffff', text: '#000000', border: '#333333', icon: '#000000', name: 'Noir & Blanc' },
  okko:   { bg: '#FFFBF5', text: '#3E3435', border: '#C38F77', icon: '#C38F77', name: 'OKKO' },
  red:    { bg: '#FFF5F5', text: '#742A2A', border: '#C53030', icon: '#C53030', name: 'Rouge' },
  blue:   { bg: '#F0F4F8', text: '#2C5282', border: '#4299E1', icon: '#4299E1', name: 'Bleu' },
  yellow: { bg: '#FFFEF0', text: '#835B10', border: '#EAB308', icon: '#EAB308', name: 'Jaune' },
} as const

export type ColorKey = keyof typeof COLORS

export const POSTER = {
  width: 1123,   // A3 portrait, 96 DPI (297 mm)
  height: 1587,  // A3 portrait, 96 DPI (420 mm)
  padding: { vertical: 60, horizontal: 80 },
} as const

export const DEFAULTS = { color: 'okko', icon: 'none', autoSizeMode: true } as const
```

Ne pas reporter le bloc `CONFIG.icons` (map redondante « pour compatibilité », code mort ; la source des icônes est `icons.ts` de l'étape 2).

### 2. `dateFormatter.ts` — formatage bilingue

Porter les 6 fonctions en fonctions pures exportées, à l'identique :

- `formatDateFr(dateStr)` : `YYYY-MM-DD` → `"15 octobre 2024"` (mois FR en toutes lettres).
- `formatDateEn(dateStr)` : → `"October 15, 2024"`.
- `formatTimeFr(time)` : plage `"HH:MM - HH:MM"` → `"9h00 - 17h00"` ; simple → `"9h00"` (heures `parseInt`, minutes conservées en 2 chiffres).
- `formatTimeEn(time)` : format 12h AM/PM (`ap = h>=12 ? 'PM':'AM'`, `h12 = h>12 ? h-12 : (h===0 ? 12 : h)`).
- `getDateString(dateStart, dateEnd)` → `{ start, end, isRange }` (`isRange` vrai seulement si les deux dates présentes).
- `getTimeString(timeStart, timeEnd)` → `{ full, isRange }`.

### 3. `sizeCalculator.ts` — dimensionnement adaptatif

Porter l'algorithme au chiffre près. Fonctions exportées : `calculateAutoSizes(...)`, `calculateIconSize(...)`. Fonctions internes (module-privées) : `_findOptimalSizes`, `_estimateSectionHeight`. Le paramètre `contentDensity` est calculé mais jamais lu par `_findOptimalSizes` (code mort) — on peut l'omettre sans changer le comportement.

Constantes à recopier exactement :

```ts
// calculateAutoSizes
const availableHeight = 1587 - 120        // = 1467
const posterWidth     = 1123 - 160        // = 963
// layout réservé
const dividerHeight   = hasTwoLanguages ? 2 : 0
const dividerMargins  = hasTwoLanguages ? 80 : 0
const numSections     = hasTwoLanguages ? 2 : 1
const sectionPaddingVertical = 60         // 30*2 par section
const logoHeight = 100, logoTopPadding = 40, SAFETY_MARGIN = 20
const textWidth = posterWidth - 120       // = 843
// _findOptimalSizes
const titleRange = { min: 20, max: 80 }, messageRange = { min: 12, max: 40 }, infoRange = { min: 10, max: 28 }
const MESSAGE_TO_TITLE_RATIO = 0.48, INFO_TO_MESSAGE_RATIO = 0.74
const TITLE_BOTTOM_MARGIN = 25, MESSAGE_BOTTOM_MARGIN = 25, INFO_TOP_MARGIN = 15
const SAFETY_FILL_RATIO = 0.98, targetFillRatio = 0.92
// _estimateSectionHeight
const TITLE_LINE_HEIGHT = 1.1, MESSAGE_LINE_HEIGHT = 1.6, INFO_LINE_HEIGHT = 2.0
const TITLE_CHAR_WIDTH_FACTOR = 0.55, MESSAGE_CHAR_WIDTH_FACTOR = 0.50
// calculateIconSize : paliers >900→85, >700→100, >500→115, >350→130, >200→145, >100→160, sinon 175 ;
//   *1.15 si une seule langue ; clamp final min(max(size,80),180)
```

Points de fidélité impératifs :
- La boucle `titleSize` décroît de 80 à 20 (pas de -1), `messageSize = round(titleSize*0.48)` clampé [12,40], `infoSize = round(messageSize*0.74)` clampé [10,28] ; early-break dès `fillRatio >= 0.92`. Fallback minima `{ title:20, message:12, info:10 }`.
- `_estimateSectionHeight` mesure la **longueur brute** des chaînes (balises comprises) et compte les `\n` (`messageLineBreaks`). Ne pas nettoyer le HTML avant de mesurer, sinon les tailles calculées divergent des affiches existantes. (Selon l'arbitrage « rendu HTML » de l'index : si les templates passent en `\n\n`, la mesure comptera 2 sauts de ligne au lieu de 0 — vérifier que cela ne change pas visiblement les tailles ; sinon conserver Option B.)

### 4. `templates.ts` — 7 templates prédéfinis

Recopier les 7 entrées verbatim (`coffee_broken`, `elevator_maintenance`, `water_outage`, `power_outage`, `fire_alarm_test`, `wet_paint`, `toilet_out`), chacune `{ name, icon, color, titleFr, messageFr, titleEn, messageEn }`. Exposer `getTemplatesList()` → `[{ key, name, icon }]` et `getTemplate(key)`. La fonction `applyTemplate` du fork (qui mute le DOM) n'est PAS portée ici : l'étape 4 la remplace par un setter d'état React.

Selon l'arbitrage « rendu HTML » : si Option A, remplacer les `<br><br>` des `messageFr/En` par `\n\n` dans les données.

## Ordre d'exécution

1. `config.ts` (aucune dépendance).
2. `dateFormatter.ts` (aucune dépendance).
3. `sizeCalculator.ts` (dépend de `config.ts` pour les dimensions).
4. `templates.ts` (types de couleurs/icônes).

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- Vérification manuelle sur quelques cas connus : `formatDateFr('2024-10-15') === '15 octobre 2024'`, `formatTimeEn('17:00') === '5:00 PM'`, `calculateIconSize` renvoie 175 pour un texte court mono-langue clampé, etc.
- Les constantes numériques correspondent exactement au fork (relecture croisée `size-calculator.js`).
