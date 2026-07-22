import { auroraEffect } from './aurora.ts'
import { autumnEffect } from './autumn.ts'
import { balloonsEffect } from './balloons.ts'
import { blackholeEffect } from './blackhole.ts'
import { boidsEffect } from './boids.ts'
import { bubblesEffect } from './bubbles.ts'
import { confettiEffect } from './confetti.ts'
import { disintegrateEffect } from './disintegrate.ts'
import { fireworksEffect } from './fireworks.ts'
import { glitchEffect } from './glitch.ts'
import { heartEffect } from './heart.ts'
import { heartSwarmEffect } from './heartswarm.ts'
import { kaleidoscopeEffect } from './kaleidoscope.ts'
import { lightningEffect } from './lightning.ts'
import { matrixEffect } from './matrix.ts'
import { moneyRainEffect } from './moneyrain.ts'
import { sakuraEffect } from './sakura.ts'
import { shockwaveEffect } from './shockwave.ts'
import { shootingStarsEffect } from './shootingstars.ts'
import { snowEffect } from './snow.ts'
import { vortexEffect } from './vortex.ts'
import type { EffectDefinition } from './types.ts'

export type { EffectDefinition, EffectEnv, EffectRunner } from './types.ts'

/*
 * Registre des effets de la page Artefact. L'ordre est celui des boutons.
 * Chacun se déclenche à la demande via `EffectOverlay` (bouton) ; les easter eggs
 * clavier (`SecretEffect`) rejouent certains de ces effets à la frappe d'un
 * mot-clé — même moteur canvas, déclencheur différent.
 */
export const EFFECTS: readonly EffectDefinition[] = [
  matrixEffect,
  blackholeEffect,
  vortexEffect,
  shockwaveEffect,
  auroraEffect,
  shootingStarsEffect,
  fireworksEffect,
  moneyRainEffect,
  heartEffect,
  snowEffect,
  sakuraEffect,
  autumnEffect,
  confettiEffect,
  bubblesEffect,
  balloonsEffect,
  heartSwarmEffect,
  lightningEffect,
  glitchEffect,
  disintegrateEffect,
  kaleidoscopeEffect,
  boidsEffect,
]

/**
 * Effets relus et validés par l'utilisateur — regroupés à part dans le panneau
 * (les autres restent « à valider »). Liste étendue au fil des validations.
 */
export const VALIDATED_EFFECT_IDS: ReadonlySet<string> = new Set([
  'fireworks',
  'shootingstars',
  'moneyrain',
  'heart',
  'snow',
  'sakura',
  'autumn',
  'confetti',
  'bubbles',
  'balloons',
  'heartswarm',
])
