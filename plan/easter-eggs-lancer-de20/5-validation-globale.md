# Étape 5 — Validation globale

## Objectif

Valider l'effet complet de bout en bout : typecheck, build et **découpage des chunks**
(three/cannon hors bundle racine), rendu visuel, **absence de fuite WebGL** au rejeu,
perf, et **non-régression** des 22 effets 2D et du reste de l'app.

## Contexte

Dernière étape (validation post-chantier). L'effet touche le cœur partagé (contrat +
overlay, étape 1) et ajoute des dépendances lourdes en lazy-load : il faut prouver que
rien n'a régressé et que le coût est bien confiné au chunk de l'effet.

## Fichier(s) impacté(s)

- Aucun nouveau. Vérification sur : `types.ts`, `EffectOverlay.tsx`, `dice.ts`,
  `index.ts`, `package.json`.

## Travail à réaliser

### 1. Typecheck + build + chunks

```bash
npx tsc --noEmit
pnpm build
```

Inspecter `dist/client/assets/` : `three-*.js` (et cannon) doivent être des **chunks
séparés**, **non référencés par l'entrée** (`_shell.html`) — donc absents du chargement
initial. Comparer la taille de l'entrée avant/après (elle ne doit pas gonfler de
~150 Ko).

### 2. Rendu visuel

- Déclencher depuis l'onglet « Effets » de l'artefact, la carte de `/easter-eggs`, et
  via un mot-clé (créer un easter egg -> `d20`) : les trois chemins jouent l'effet.
- Le dé tombe, roule, s'immobilise, le résultat s'affiche, l'overlay se démonte
  proprement.

### 3. Fuite WebGL / mémoire

- Rejouer l'effet 15-20 fois d'affilée : aucun warning « too many active WebGL
  contexts », pas de dégradation. Preuve du `destroy()` correct.

### 4. Perf

- 60 fps visés pendant le lancer (pas de saccade). Vérifier sur une fenêtre plein
  écran. Le `dpr` est plafonné à 2.

### 5. Non-régression

- Jouer 2-3 effets 2D (sakura, flowers, fireworks) : comportement identique à avant.
- `pnpm lint` / `pnpm check` propres.

## Ordre d'exécution

1. `npx tsc --noEmit` + `pnpm build` (+ inspection des chunks).
2. Tests visuels des trois chemins de déclenchement.
3. Test de fuite (rejeu répété).
4. Contrôle perf + non-régression 2D.
5. `pnpm lint` / `pnpm check`.

## Critère de validation

- `npx tsc --noEmit`, `pnpm build`, `pnpm lint`, `pnpm check` tous propres.
- three.js + cannon-es sont des chunks **lazy** hors du bundle racine (entrée non
  gonflée).
- L'effet joue correctement depuis les trois déclencheurs et se termine proprement.
- Aucune fuite WebGL après ~20 rejeux.
- Les effets 2D et le reste de l'app sont inchangés.

## Contrôle /borg

Étape critique (validation globale post-chantier). Audit final :

- **Confinement du poids** : confirmer par le manifeste de build que `three`/`cannon`
  n'apparaissent que dans le chunk de l'effet, jamais dans l'entrée / le root.
- **Cycle de vie** : `destroy()` bien appelé sur chaque fin (naturelle et démontage),
  une seule fois ; aucune boucle rAF orpheline ; contexte WebGL rendu
  (`forceContextLoss`).
- **Non-régression du cœur** : le mode `2d` de `EffectOverlay` est stricto sensu
  l'ancien comportement ; les 22 effets 2D et leurs déclencheurs (onglet, page,
  clavier) fonctionnent.
- **Robustesse** : lecture de la face déterministe (pas d'ambiguïté d'arête non
  gérée) ; timeout de sécurité empêche tout blocage sous le cap `durationMs + 4000`.
- **Registre** : `id` `'d20'` unique, présent dans `EFFECTS` et
  `VALIDATED_EFFECT_IDS`, `label`/`hint` cohérents.
