import type { EffectDefinition } from './types.ts'

/*
 * Registre PARESSEUX des effets d'easter egg — la même liste que `index.ts`,
 * mais réduite à l'identifiant et à une fonction de chargement.
 *
 * POURQUOI (audit du chargement, 2026-09-21). `AppAuthGate` monte `<EasterEggs>`
 * sur toute l'application authentifiée, et celui-ci importait `EFFECTS` depuis
 * `index.ts`. Or un `EffectDefinition` porte sa fonction `create(env)` : importer
 * le registre, c'est importer les QUATORZE animations. Résultat mesuré sur le
 * build : **44 150 octets bruts (~15 000 compressés) d'animations dans le chunk
 * d'entrée**, soit 10 % de `index-*.js`, payés par chaque page, à chaque
 * première visite — pour du code qui ne sert que si quelqu'un tape un mot
 * secret au clavier.
 *
 * Ici, chaque entrée ne contient qu'une chaîne et un `import()` non évalué. Le
 * code d'un effet n'est téléchargé qu'au moment où son mot-clé est effectivement
 * tapé. Le détecteur clavier, lui, ne pèse rien.
 *
 * ⚠ Cette liste doit rester synchrone avec `EFFECTS` de `index.ts` —
 * `effects.registry.test.ts` échoue si l'une contient un identifiant que l'autre
 * n'a pas. La page admin `/easter-eggs`, qui prévisualise les effets, continue
 * d'utiliser `index.ts` : elle vit dans son propre chunk de route, le poids n'y
 * est donc payé que par elle.
 */

/** Un effet désigné par son identifiant, chargé à la demande. */
export interface LazyEffect {
  /** Identifiant stable, celui stocké dans `easter_eggs.effect_id`. */
  id: string
  /** Télécharge et rend la définition complète de l'effet. */
  load: () => Promise<EffectDefinition>
}

export const LAZY_EFFECTS: readonly LazyEffect[] = [
  {
    id: 'shootingstars',
    load: () => import('./shootingstars.ts').then((m) => m.shootingStarsEffect),
  },
  {
    id: 'fireworks',
    load: () => import('./fireworks.ts').then((m) => m.fireworksEffect),
  },
  {
    id: 'moneyrain',
    load: () => import('./moneyrain.ts').then((m) => m.moneyRainEffect),
  },
  { id: 'heart', load: () => import('./heart.ts').then((m) => m.heartEffect) },
  { id: 'snow', load: () => import('./snow.ts').then((m) => m.snowEffect) },
  {
    id: 'sakura',
    load: () => import('./sakura.ts').then((m) => m.sakuraEffect),
  },
  {
    id: 'autumn',
    load: () => import('./autumn.ts').then((m) => m.autumnEffect),
  },
  {
    id: 'flowers',
    load: () => import('./flowers.ts').then((m) => m.flowersEffect),
  },
  {
    id: 'confetti',
    load: () => import('./confetti.ts').then((m) => m.confettiEffect),
  },
  {
    id: 'heartswarm',
    load: () => import('./heartswarm.ts').then((m) => m.heartSwarmEffect),
  },
  {
    id: 'lightning',
    load: () => import('./lightning.ts').then((m) => m.lightningEffect),
  },
  { id: 'd20', load: () => import('./dice.ts').then((m) => m.diceEffect) },
  {
    id: 'strawhat',
    load: () => import('./strawhat.ts').then((m) => m.strawhatEffect),
  },
  {
    id: 'pastis',
    load: () => import('./pastis.ts').then((m) => m.pastisEffect),
  },
]
