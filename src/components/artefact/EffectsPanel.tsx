import { Sparkles } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import { EFFECTS } from '#/lib/artefact/effects/index.ts'
import { useEffectTrigger } from './EffectOverlay.tsx'

/*
 * Onglet « Effets » de la page Artefact — bac à sable visuel.
 *
 * Dix effets canvas, chacun déclenché par un bouton (à la différence de l'easter
 * egg `SecretFireworks`, déclenché par un mot-clé). L'overlay se superpose à
 * TOUTE la page en `pointer-events: none` : on peut relancer un effet ou en
 * lancer un autre pendant qu'il tourne, les boutons restent cliquables.
 *
 * Page réservée aux admins et vouée aux tests — d'où le ton assumé « terrain de
 * jeu » plutôt qu'un composant de production.
 */
export function EffectsPanel() {
  const { trigger, overlay, activeId } = useEffectTrigger()

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center gap-2">
        <Sparkles className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">Effets visuels</h2>
      </div>
      <p className="mb-8 max-w-2xl text-sm text-muted-foreground">
        Dix effets plein écran, déclenchés au clic. Ils se superposent à la page
        sans en bloquer l'usage — on peut en relancer un ou en enchaîner un
        autre à tout moment. Terrain de jeu, rien n'est écrit ni envoyé.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {EFFECTS.map((effect) => {
          const isActive = activeId === effect.id
          return (
            <Button
              key={effect.id}
              type="button"
              variant={isActive ? 'default' : 'outline'}
              onClick={() => trigger(effect)}
              className="flex h-auto flex-col items-start gap-1 whitespace-normal px-4 py-3 text-left"
            >
              <span className="font-semibold">{effect.label}</span>
              <span className="text-xs font-normal opacity-70">
                {effect.hint}
              </span>
            </Button>
          )
        })}
      </div>

      {overlay}
    </div>
  )
}
