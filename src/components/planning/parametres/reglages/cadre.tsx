/*
 * Cadre commun des trois écrans de réglages (Postes, Horaires et absences,
 * Besoins) : en-tête (flèche du planning à gauche, titre, actions puis
 * engrenage à droite), mention de lecture seule, chargement et erreur de
 * lecture, et le brouillon d'une carte (enregistrement EXPLICITE, jamais à
 * la frappe : anomalie 12 de la spécification).
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import { RotateCw } from 'lucide-react'

import {
  MenuParametres,
  RetourPlanning,
} from '#/components/planning/EnTeteParametres.tsx'
import type { CheminParametre } from '#/components/planning/EnTeteParametres.tsx'
import { MentionLectureSeule } from '#/components/planning/parametres/reglages/controles.tsx'
import { memes } from '#/components/planning/parametres/reglages/validation.ts'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'

export function CadreReglages({
  titre,
  actif,
  actions,
  modifiable,
  pret,
  chargement,
  erreur,
  onReessayer,
  children,
}: {
  titre: string
  actif: CheminParametre
  actions?: ReactNode
  modifiable: boolean
  pret: boolean
  chargement: boolean
  erreur: boolean
  onReessayer: () => void
  children: ReactNode
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <PageHeader
        leading={<RetourPlanning />}
        title={titre}
        actionsAlign="end"
        actions={
          <>
            {actions}
            <MenuParametres actif={actif} />
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-6 pb-6">
          {!modifiable && !chargement && !erreur && (
            <MentionLectureSeule pret={pret} />
          )}
          {erreur ? (
            <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-4 text-sm">
              Les réglages du planning n'ont pas pu être lus.
              <Button variant="outline" size="sm" onClick={onReessayer}>
                <RotateCw />
                Réessayer
              </Button>
            </div>
          ) : chargement ? (
            <div
              className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
              aria-busy="true"
            >
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-64 rounded-xl" />
              ))}
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  )
}

/** Titre et texte d'une partie d'écran. */
export function EnTeteSection({
  titre,
  texte,
  actions,
  niveau = 2,
}: {
  titre: string
  texte?: ReactNode
  actions?: ReactNode
  niveau?: 2 | 3
}) {
  const Titre = niveau === 2 ? 'h2' : 'h3'
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="max-w-3xl min-w-0">
        <Titre
          className={
            niveau === 2 ? 'text-lg font-semibold' : 'text-base font-semibold'
          }
        >
          {titre}
        </Titre>
        {texte != null && (
          <p className="mt-1 text-sm text-muted-foreground">{texte}</p>
        )}
      </div>
      {actions}
    </div>
  )
}

/**
 * Le brouillon d'une carte : modifié localement, envoyé par Enregistrer.
 * Tant qu'il n'est pas modifié, il suit les données relues (un collègue a
 * changé la ligne) ; modifié, il est gardé tel quel.
 */
export function useBrouillon<T extends object>(enregistre: T) {
  const [base, setBase] = useState(enregistre)
  const [brouillon, setBrouillon] = useState(enregistre)
  const modifie = !memes(brouillon, base)
  if (!memes(base, enregistre)) {
    setBase(enregistre)
    if (!modifie) setBrouillon(enregistre)
  }
  return {
    brouillon,
    modifie,
    changer: (maj: Partial<T>) => setBrouillon((b) => ({ ...b, ...maj })),
    annuler: () => setBrouillon(base),
    /** Après un enregistrement réussi : la saisie devient la référence. */
    adopter: (valeurs: T) => {
      setBase(valeurs)
      setBrouillon(valeurs)
    },
  }
}
