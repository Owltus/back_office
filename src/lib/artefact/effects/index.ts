import { auroraEffect } from './aurora.ts'
import { blackholeEffect } from './blackhole.ts'
import { boidsEffect } from './boids.ts'
import { disintegrateEffect } from './disintegrate.ts'
import { glitchEffect } from './glitch.ts'
import { kaleidoscopeEffect } from './kaleidoscope.ts'
import { lightningEffect } from './lightning.ts'
import { matrixEffect } from './matrix.ts'
import { shockwaveEffect } from './shockwave.ts'
import { vortexEffect } from './vortex.ts'
import type { EffectDefinition } from './types.ts'

export type { EffectDefinition, EffectEnv, EffectRunner } from './types.ts'

/*
 * Registre des effets de la page Artefact. L'ordre est celui des boutons.
 * Chacun se déclenche à la demande via `EffectOverlay` (bouton), là où l'easter
 * egg `SecretFireworks` se déclenche à la frappe d'un mot-clé — même moteur
 * canvas, déclencheur différent, comme demandé.
 */
export const EFFECTS: readonly EffectDefinition[] = [
  matrixEffect,
  blackholeEffect,
  vortexEffect,
  shockwaveEffect,
  auroraEffect,
  lightningEffect,
  glitchEffect,
  disintegrateEffect,
  kaleidoscopeEffect,
  boidsEffect,
]
