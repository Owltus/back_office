/*
 * Le choix écrit devant chaque liste de réglages (codes d'un poste, codes
 * d'une personne, postes d'un groupe) : « Tous » ou « Seulement ceux-ci ».
 * « Tous » masque la liste et dit combien sont ouverts ; « Seulement
 * ceux-ci » montre la liste et refuse d'en décocher le dernier. Logique :
 * `tousOuCertains.ts`.
 */

import { useState } from 'react'
import type { ReactNode } from 'react'

import { Segmente } from '#/components/planning/parametres/reglages/controles.tsx'
import {
  basculerMode,
  modeDe,
  modificationPermise,
} from '#/components/planning/parametres/reglages/tousOuCertains.ts'
import type { ModeListe } from '#/components/planning/parametres/reglages/tousOuCertains.ts'

export interface ListeGardee {
  choisis: number[]
  /** Change la liste, sauf si elle ne garderait plus rien. */
  onChange: (choisis: number[]) => void
}

export function TousOuCertains({
  etiquette,
  choisis,
  proposes,
  onChange,
  disabled,
  texteTous,
  quoi = 'code',
  children,
}: {
  /** Ce que règle la liste, pour les lecteurs d'écran. */
  etiquette: string
  choisis: number[]
  /** Les identifiants que la liste propose. */
  proposes: number[]
  onChange: (choisis: number[]) => void
  disabled?: boolean
  /** Ce qu'affiche « Tous » à la place de la liste (« Les 7 codes »). */
  texteTous: ReactNode
  /** Le mot de la phrase de refus. */
  quoi?: 'code' | 'poste'
  /** La liste, en mode « Seulement ceux-ci ». */
  children: (liste: ListeGardee) => ReactNode
}) {
  const mode = modeDe(choisis)
  // Sélection mise de côté par « Tous », le temps de la séance.
  const [memoire, setMemoire] = useState<number[]>([])
  const [refus, setRefus] = useState(false)

  const changerMode = (m: ModeListe) => {
    if (m === mode) return
    const b = basculerMode(m, choisis, memoire, proposes)
    setMemoire(b.memoire)
    setRefus(false)
    if (b.choisis.length || m === 'tous') onChange(b.choisis)
  }

  const changerListe = (suivante: number[]) => {
    const permise = modificationPermise(suivante, proposes)
    setRefus(permise === null)
    if (permise) onChange(permise)
  }

  return (
    <div className="flex flex-col gap-2">
      <Segmente<ModeListe>
        etiquette={etiquette}
        valeur={mode}
        disabled={disabled}
        onChange={changerMode}
        options={[
          { valeur: 'tous', libelle: 'Tous' },
          {
            valeur: 'certains',
            libelle: 'Seulement ceux-ci',
          },
        ]}
      />
      {mode === 'tous' ? (
        <span className="text-sm text-muted-foreground">{texteTous}</span>
      ) : (
        <>
          {children({ choisis, onChange: changerListe })}
          {refus && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              Gardez au moins un {quoi}, ou choisissez Tous.
            </span>
          )}
        </>
      )}
    </div>
  )
}
