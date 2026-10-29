/*
 * Navigation du Planning : le planning est l'écran par défaut ; les
 * paramètres (équipe, postes, horaires et absences, besoins) s'ouvrent par
 * l'engrenage (prototype `MenuParametres`), et chaque écran de paramètres a
 * sa flèche « Revenir au planning ». Sur un écran de paramètres, la pastille
 * « À vérifier » (`ControleReglages`, étape 5 du plan
 * `planning-coherence-2026-10-28`) précède l'engrenage.
 */

import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  Briefcase,
  Clock3,
  FileUp,
  LayoutGrid,
  Settings,
  Users,
} from 'lucide-react'

import { ControleReglages } from '#/components/planning/parametres/ControleReglages.tsx'
import { ImportPrototypeDialog } from '#/components/planning/ImportPrototypeDialog.tsx'
import { useDroitsPlanning } from '#/components/planning/hooks/usePlanning.ts'

import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu.tsx'

export const PARAMETRES = [
  { to: '/planning/equipe', libelle: 'Équipe', icone: Users },
  { to: '/planning/postes', libelle: 'Postes', icone: Briefcase },
  { to: '/planning/horaires', libelle: 'Horaires et absences', icone: Clock3 },
  { to: '/planning/besoins', libelle: 'Besoins', icone: LayoutGrid },
] as const

export type CheminParametre = (typeof PARAMETRES)[number]['to']

/** L'engrenage et son menu. `actif` : l'écran de paramètres ouvert (la
 * pastille « À vérifier » est alors montrée avant lui). */
export function MenuParametres({ actif }: { actif?: CheminParametre }) {
  const navigate = useNavigate()
  const { gerer } = useDroitsPlanning()
  const [importer, setImporter] = useState(false)
  return (
    <>
      {actif && <ControleReglages />}
      <DropdownMenu>
        <Tip label="Paramètres : équipe, postes, horaires et absences, besoins">
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
          {PARAMETRES.map(({ to, libelle, icone: Icone }) => (
            <DropdownMenuItem
              key={to}
              onSelect={() => void navigate({ to })}
              className={actif === to ? 'bg-accent font-medium' : undefined}
            >
              <Icone />
              {libelle}
            </DropdownMenuItem>
          ))}
          {gerer && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setImporter(true)}>
                <FileUp />
                Importer le prototype
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {gerer && (
        <ImportPrototypeDialog
          ouvert={importer}
          onFermer={() => setImporter(false)}
        />
      )}
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
