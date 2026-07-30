# Étape 2 — Enregistrement dans le registre + validation globale

## Objectif

Rendre l'effet `flowers` visible et jouable partout (page admin `/easter-eggs` et
onglet « Effets » de l'artefact) en l'ajoutant au registre partagé, puis valider
l'ensemble : typecheck, build, rendu visuel, absence de régression sur les autres
effets.

## Contexte

Les deux consommateurs UI (`EasterEggsBoard.tsx`, `EffectsPanel.tsx`) itèrent
dynamiquement sur `EFFECTS` / `VALIDATED_EFFECT_IDS` : aucune retouche UI. La page
admin ne montre que les effets **validés** (`EFFECTS.filter(e =>
VALIDATED_EFFECT_IDS.has(e.id))`) — oublier l'ajout au `Set` rendrait l'effet
invisible côté admin (il n'apparaîtrait que dans le groupe « À valider » de l'onglet).
Aucune migration Supabase : `easter_eggs.effect_id` est une chaîne résolue au runtime.

## Fichier(s) impacté(s)

- `src/lib/artefact/effects/index.ts` (modifié) — 3 ajouts : import, entrée `EFFECTS`,
  entrée `VALIDATED_EFFECT_IDS`.

## Travail à réaliser

### 1. Import + entrée dans `EFFECTS`

Ajouter l'import (respecter l'ordre alphabétique du bloc d'imports) et pousser la
définition dans le tableau `EFFECTS` (l'ordre du tableau = l'ordre des boutons ; le
placer près des effets nature, sakura/autumn, est cohérent).

```ts
import { flowersEffect } from './flowers.ts'
// ...
export const EFFECTS: EffectDefinition[] = [
  // ... effets existants
  flowersEffect,
]
```

### 2. Entrée dans `VALIDATED_EFFECT_IDS`

```ts
export const VALIDATED_EFFECT_IDS = new Set<string>([
  // ... ids existants
  'flowers',
])
```

### 3. (Facultatif, hors code) associer un mot-clé de déclenchement clavier

Pour déclencher l'effet au clavier (et pas seulement via les boutons de preview), un
admin crée un easter egg depuis `/easter-eggs` : mot-clé → effet `flowers`, `enabled`.
C'est une **donnée en base saisie via l'app**, pas une migration ni du SQL à écrire.
À laisser à la discrétion de l'utilisateur ; hors périmètre code de ce plan.

## Ordre d'exécution

1. Appliquer les 3 ajouts dans `index.ts`.
2. `npx tsc --noEmit` — doit rester propre.
3. `pnpm build` — vérifier qu'aucun chunk ne casse et que `flowers.ts` est bien pris
   dans le bundle des effets.
4. Preview visuelle : `pnpm dev`, onglet « Effets » de l'artefact → bouton « Fleurs de
   printemps » ; puis page `/easter-eggs` → la carte et le `Select` doivent lister
   l'effet et le jouer.

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- `pnpm build` réussit, découpage des chunks inchangé hormis l'ajout attendu.
- L'effet apparaît dans l'onglet « Effets » (groupe « Validés ») **et** sur la page
  `/easter-eggs` (carte cliquable + entrée du `Select`).
- Au clic, l'animation joue : tiges qui poussent du bas, feuilles, fleurs variées ;
  elle se termine proprement (pas de canvas figé résiduel) et l'overlay se démonte.
- Aucun autre effet n'a changé de comportement, d'ordre ou de label.

## Contrôle /borg

Étape critique (dernière étape — validation globale post-chantier). Audit final :

- **Cohérence du registre** : `id` `'flowers'` unique (pas de collision), présent à la
  fois dans `EFFECTS` et `VALIDATED_EFFECT_IDS` ; `label` / `hint` non vides et dans
  le ton des autres.
- **Non-régression** : les 21 effets préexistants restent listés, dans le même ordre
  relatif, avec leurs mêmes ids ; aucun import cassé dans `index.ts`.
- **Cycle de vie / fuite** : `frame` finit bien par renvoyer `false` (ou le cap
  `durationMs + 4000` de l'overlay s'applique) ; pas de `requestAnimationFrame`
  détenu hors de l'overlay (le runner ne lance pas sa propre boucle — c'est l'overlay
  qui pilote).
- **Perf** : nombre de tiges raisonnable (~10-20), géométrie pré-calculée dans
  `create` et non par frame, pas de `shadowBlur` ni de gradient recréé par frame ;
  dessin en pixels CSS (aucun `* dpr`).
- **Rendu** : l'effet dessine bien `clearRect` en tête de frame (pas de traînée
  involontaire) et respecte l'origine haut-gauche (tiges ancrées à `y = height`).
