import type { ReactNode } from 'react'
import { Button } from '#/components/ui/button.tsx'
import { EFFECTS, VALIDATED_EFFECT_IDS } from '#/lib/artefact/effects/index.ts'
import { useEffectTrigger } from '#/components/shared/EffectOverlay.tsx'

/*
 * Onglet « Effets » de la page Artefact — bac à sable visuel.
 *
 * Des effets canvas, chacun déclenché par un bouton — dont le feu d'artifice et
 * les étoiles filantes, aussi ouverts par les easter eggs clavier « chloé » et
 * « claudia » (`SecretEffect`). L'overlay se
 * superpose à TOUTE la page en `pointer-events: none` : on peut relancer un effet
 * ou en lancer un autre pendant qu'il tourne, les boutons restent cliquables.
 *
 * Les effets sont rangés en deux groupes — « Validés » (relus et approuvés) et
 * « À valider » (le reste) — d'après `VALIDATED_EFFECT_IDS`. Le conteneur et
 * l'en-tête vivent dans `ArtefactBoard` (layout standard) : ici on ne rend que
 * l'intro et les deux grilles, alignées sur le reste de la page.
 */
type Effect = (typeof EFFECTS)[number]

export function EffectsPanel() {
  const { trigger, overlay, activeId } = useEffectTrigger()

  const validated = EFFECTS.filter((effect) =>
    VALIDATED_EFFECT_IDS.has(effect.id),
  )
  const pending = EFFECTS.filter(
    (effect) => !VALIDATED_EFFECT_IDS.has(effect.id),
  )

  const renderEffect = (effect: Effect) => {
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
        <span className="text-xs font-normal opacity-70">{effect.hint}</span>
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-2xl text-sm text-muted-foreground">
        {EFFECTS.length} effets plein écran, déclenchés au clic. Ils se
        superposent à la page sans en bloquer l'usage — on peut en relancer un
        ou en enchaîner un autre à tout moment. Terrain de jeu, rien n'est écrit
        ni envoyé.
      </p>

      <EffectGroup
        title="Validés"
        dot="bg-emerald-400"
        count={validated.length}
      >
        {validated.map(renderEffect)}
      </EffectGroup>

      <EffectGroup
        title="À valider"
        dot="bg-muted-foreground/50"
        count={pending.length}
      >
        {pending.map(renderEffect)}
      </EffectGroup>

      {overlay}
    </div>
  )
}

interface EffectGroupProps {
  title: string
  /** Classe de couleur de la pastille de statut (ex. `bg-emerald-400`). */
  dot: string
  count: number
  children: ReactNode
}

function EffectGroup({ title, dot, count, children }: EffectGroupProps) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span
          className={`inline-block h-2 w-2 rounded-full ${dot}`}
          aria-hidden="true"
        />
        {title}
        <span className="font-normal text-muted-foreground">({count})</span>
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {children}
      </div>
    </section>
  )
}
