# Plan — Effet « fleurs qui poussent » pour les Easter eggs

## Contexte

La page d'administration `/easter-eggs` et l'onglet « Effets » de l'artefact partagent
un **registre unique** d'effets visuels canvas (`src/lib/artefact/effects/index.ts`).
Chaque effet est un objet `EffectDefinition` autonome (`id`, `label`, `hint`,
`durationMs`, `create`) rendu par un overlay plein écran (`EffectOverlay.tsx`).

Le chantier ajoute un **nouvel effet** dans la lignée des effets « nature » existants
(sakura, autumn) : un « printemps » où des **tiges poussent depuis le bas de la
fenêtre**, grandissent, déroulent des feuilles, puis s'ouvrent en **fleurs simples de
différents types et couleurs**. Contraintes explicites de l'utilisateur : **rester
simple**, **s'inscrire dans le style des autres effets**, et viser **la même durée
moyenne** que les effets frères.

Aucune écriture Supabase, **aucune migration** : `easter_eggs.effect_id` est une
simple chaîne résolue au runtime contre le registre. L'ajout est **100 % front** :
un nouveau fichier d'effet + trois lignes dans `index.ts`. Les consommateurs UI
(`EasterEggsBoard.tsx`, `EffectsPanel.tsx`) itèrent dynamiquement sur `EFFECTS` /
`VALIDATED_EFFECT_IDS` et n'ont rien à modifier.

## Angles à clarifier

- **D1 — Durée de l'effet (à trancher).** **Option A retenue (recommandée)** :
  `durationMs = 12000`, aligné sur sakura et autumn (ses voisins botaniques directs)
  et sur la consigne « même durée que les autres en moyenne » (la famille nature du
  parc tourne autour de 12 000 ms). Option B : ~4 000 ms — l'inspiration web juge un
  one-shot de fleurs plus percutant court, mais cela dénoterait des effets frères.
  Concerne l'étape 1.
- **D2 — Fin de l'effet (à trancher).** **Option A retenue (recommandée)** :
  après l'éclosion, un léger balancement d'inactivité (idle sway) puis un discret
  flétrissement/retrait sur la dernière seconde — respecte l'esprit « ça s'en va »
  du projet sans pouvoir littéralement « sortir de l'écran » (une tige est
  enracinée). Option B : coupe sèche à `DURATION` (patron `heart.ts` /
  `kaleidoscope.ts`), plus simple mais plus abrupte. Concerne l'étape 1.
- **D3 — Nommage (à confirmer).** Proposé : `id: 'flowers'`,
  `label: 'Fleurs de printemps'`, `hint: 'Des tiges fleurissent depuis le bas'`.
  Ajustable au goût. Concerne les étapes 1 et 2.
- **D4 — Variété (non bloquant).** Proposé : 4 à 5 types de fleurs procéduraux
  (marguerite, fleur ronde, tulipe, lavande, bleuet) tirés au sort par tige, avec
  les palettes printanières du rapport d'inspiration. Réglable sans risque.
- **Patron d'implémentation (tranché, non ambigu).** `create` custom (état des tiges
  figé à la création, `ctx.clearRect` par frame, `return elapsed < DURATION`), et
  **non** `particleField` : ce moteur déplace chaque élément linéairement et le
  supprime dès qu'il sort de l'écran, ce qui est incompatible avec des tiges qui
  poussent puis restent.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-effet-canvas-fleurs.md](./1-effet-canvas-fleurs.md) | Runner canvas custom (tiges → feuilles → fleurs) | — | P1 | 2h30 | `flowers.ts` : effet complet, typé, `tsc` propre | |
| 2 | [2-enregistrement-validation.md](./2-enregistrement-validation.md) | Enregistrement dans le registre + validation globale | 1 | P1 | 45 min | Effet visible et jouable (admin + onglet), build OK | ⚠ |

## Ordre d'exécution

Séquentiel strict : l'étape 2 dépend de l'étape 1 (elle importe le symbole exporté).

- **Avant l'étape 1** : acter D1 (durée) et D2 (fin de l'effet) — ce sont les deux
  seuls choix qui changent le code du runner. D3 et D4 peuvent être ajustés en cours
  ou après sans reprise structurelle.
- **Étape 1** : écrire `flowers.ts` de bout en bout (squelette → tige → feuilles →
  fleurs → orchestration → export). Validation intermédiaire = `npx tsc --noEmit`.
- **Étape 2** : brancher dans `index.ts` (import + `EFFECTS` + `VALIDATED_EFFECT_IDS`),
  puis valider visuellement (onglet « Effets » et page `/easter-eggs`), `pnpm build`
  et audit `/borg` (dernière étape).

## Architecture cible

```
src/lib/artefact/effects/
├── types.ts            ← contrat EffectDefinition (inchangé)
├── particles.ts        ← moteur « chute/envol » (inchangé, NON réutilisé ici)
├── index.ts            ← + import flowers, + entrée EFFECTS, + entrée VALIDATED_EFFECT_IDS [modifié]
├── flowers.ts          ← runner canvas custom : tiges qui poussent du bas [nouveau]
├── sakura.ts           ← effet frère de référence (modèle nature, inchangé)
├── autumn.ts           ← effet frère (feuille en quadraticCurveTo, inchangé)
├── heart.ts            ← modèle de create custom (clearRect + elapsed < DURATION, inchangé)
└── … (18 autres effets, inchangés)

src/components/easter-eggs/EasterEggsBoard.tsx   ← itère VALIDATED_EFFECTS (inchangé)
src/components/artefact/EffectsPanel.tsx         ← itère EFFECTS (inchangé)
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Effets (métier canvas) | `src/lib/artefact/effects/index.ts` | `src/lib/artefact/effects/flowers.ts` |
| UI | — | — |
| DB / Supabase | — | — |
| **Total** | **1 modifié** | **1 nouveau** |
