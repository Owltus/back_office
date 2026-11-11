/*
 * Navigation du Planning : le planning est l'écran par défaut ; les
 * paramètres (équipe, postes, horaires et absences, besoins) s'ouvrent par
 * l'engrenage (prototype `MenuParametres`), et chaque écran de paramètres a
 * sa flèche « Revenir au planning ». Sur un écran de paramètres, la pastille
 * « À vérifier » (`ControleReglages`, étape 5 du plan
 * `planning-coherence-2026-10-28`) précède l'engrenage.
 *
 * Étape 7 : le menu suit l'ordre de réglage (Horaires, Postes, Équipe,
 * Besoins), numéroté discrètement, avec une coche quand l'écran n'a plus de
 * point BLOQUANT (`etapesDemarrage`). Les points « à voir » ne retirent pas
 * la coche : certains restent longtemps (un écart d'heures accepté), et la
 * coche ne servirait plus à rien ; ils se lisent dans la pastille.
 */

import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  Briefcase,
  Check,
  Clock3,
  LayoutGrid,
  Settings,
  Users,
} from 'lucide-react'

import { usePretAGenerer } from '#/components/planning/PretAGenerer.tsx'
import { useReferentiel } from '#/components/planning/hooks/usePlanning.ts'

import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu.tsx'

/** Dans l'ordre de réglage (`ORDRE_ECRANS` de `coherence.ts`). */
export const PARAMETRES = [
  {
    to: '/planning/horaires',
    ecran: 'horaires',
    libelle: 'Horaires et absences',
    icone: Clock3,
  },
  {
    to: '/planning/postes',
    ecran: 'postes',
    libelle: 'Postes',
    icone: Briefcase,
  },
  { to: '/planning/equipe', ecran: 'equipe', libelle: 'Équipe', icone: Users },
  {
    to: '/planning/besoins',
    ecran: 'besoins',
    libelle: 'Besoins',
    icone: LayoutGrid,
  },
] as const

export type CheminParametre = (typeof PARAMETRES)[number]['to']

/** L'engrenage et son menu. `actif` : l'écran de paramètres ouvert (la
 * pastille « À vérifier » est alors montrée avant lui). */
export function MenuParametres({ actif }: { actif?: CheminParametre }) {
  const navigate = useNavigate()
  const ref = useReferentiel()
  const { etapes } = usePretAGenerer(ref.data)
  const fait = new Set(etapes.filter((e) => e.fait).map((e) => e.ecran))
  return (
    <>
      {/* Pastille « À vérifier » RETIRÉE le 2026-11-11 (demande
          utilisateur : « ça m'intéresse pas »). */}
      <DropdownMenu>
        <Tip label="Paramètres : horaires et absences, postes, équipe, besoins">
          <DropdownMenuTrigger asChild>
            <Button
              variant={actif ? 'secondary' : 'outline'}
              size="icon-sm"
              aria-label="Paramètres"
            >
              <Settings />
            </Button>
          </DropdownMenuTrigger>
        </Tip>
        <DropdownMenuContent align="end" className="min-w-56">
          {PARAMETRES.map(({ to, ecran, libelle, icone: Icone }, i) => (
            <DropdownMenuItem
              key={to}
              onSelect={() => void navigate({ to })}
              className={actif === to ? 'bg-accent font-medium' : undefined}
            >
              <span
                aria-hidden
                className="w-3 text-xs text-muted-foreground tabular-nums"
              >
                {i + 1}
              </span>
              <Icone />
              {libelle}
              {fait.has(ecran) && (
                <>
                  <Check
                    aria-hidden
                    className="ml-auto text-emerald-600 dark:text-emerald-400"
                  />
                  <span className="sr-only">, réglé</span>
                </>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

/** La flèche des écrans de paramètres. */
export function RetourPlanning() {
  return (
    <Tip label="Revenir au planning">
      <Button asChild variant="outline" size="icon-sm">
        <Link to="/planning" aria-label="Revenir au planning">
          <ArrowLeft />
        </Link>
      </Button>
    </Tip>
  )
}
