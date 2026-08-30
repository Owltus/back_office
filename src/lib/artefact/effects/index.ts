import { autumnEffect } from './autumn.ts'
import { confettiEffect } from './confetti.ts'
import { diceEffect } from './dice.ts'
import { fireworksEffect } from './fireworks.ts'
import { flowersEffect } from './flowers.ts'
import { heartEffect } from './heart.ts'
import { heartSwarmEffect } from './heartswarm.ts'
import { lightningEffect } from './lightning.ts'
import { moneyRainEffect } from './moneyrain.ts'
import { pastisEffect } from './pastis.ts'
import { sakuraEffect } from './sakura.ts'
import { shootingStarsEffect } from './shootingstars.ts'
import { snowEffect } from './snow.ts'
import { strawhatEffect } from './strawhat.ts'
import type { EffectDefinition } from './types.ts'

export type {
  EffectDefinition,
  EffectEnv,
  EffectRunner,
  WebglEffectEnv,
} from './types.ts'

/*
 * Registre des effets déclenchables par les easter eggs (page admin
 * `/easter-eggs`, `components/easter-eggs/EasterEggsBoard.tsx`) et par les
 * détecteurs clavier (`SecretEffect`). L'ancienne page /artefact, qui servait
 * de bac à sable pour les essayer avant validation, a été retirée le
 * 2026-08-25 : ce registre ne contient donc plus que des effets déjà VALIDÉS
 * (`VALIDATED_EFFECT_IDS` couvre l'intégralité de la liste). Les effets « à
 * valider » retirés ce jour-là (matrix, blackhole, vortex, shockwave, aurora,
 * glitch, disintegrate, kaleidoscope, boids) ainsi que bulles et ballons
 * (validés mais retirés sur demande) ont été supprimés du code, pas
 * seulement du registre.
 */
export const EFFECTS: readonly EffectDefinition[] = [
  shootingStarsEffect,
  fireworksEffect,
  moneyRainEffect,
  heartEffect,
  snowEffect,
  sakuraEffect,
  autumnEffect,
  flowersEffect,
  confettiEffect,
  heartSwarmEffect,
  lightningEffect,
  diceEffect,
  strawhatEffect,
  pastisEffect,
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
  'flowers',
  'confetti',
  'heartswarm',
  'd20',
  'strawhat',
  'lightning',
  'pastis',
])
