import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { BabyCotBoard } from '#/components/literie/BabyCotBoard.tsx'
import { MouseGlyph } from '#/components/parking/MouseGlyph.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { Skeleton } from '#/components/ui/skeleton.tsx'
import { beddingMap, FLOORS } from '#/lib/literie/model.ts'
import { fetchRooms, toggleBedding } from '#/lib/literie/service.ts'
import type { DbHotelRoom } from '#/lib/literie/types.ts'
import { cn } from '#/lib/utils.ts'

const ROOMS_KEY = ['literie', 'rooms']

/**
 * Literie anti-allergène — page unique (pas de sous-route/bouton de bascule,
 * décision explicite de l'utilisateur) : tuile de synthèse + grille des 80
 * chambres, puis planning des lits parapluie bébé (BabyCotBoard) en bas. État
 * de la grille PERMANENT (pas de notion de jour, pas de feuille à clôturer,
 * pas de commentaire) : un clic sur une pastille bascule immédiatement plume
 * ↔ synthétique, à tout moment, tant que `can('literie','ecriture')` (RLS de
 * toute façon autoritaire côté serveur).
 *
 * Pas de suivi de stock ICI (retiré à la demande de l'utilisateur, « pour le
 * moment ») : la page trace UNIQUEMENT quelles chambres ont actuellement de
 * la literie synthétique installée, sans compteur d'oreillers/couettes de
 * secours. Les tables/RPC de stock (`literie_stock`, `literie_toggle_
 * bedding`, cf. `supabase/literie.sql`) restent en base, orphelines, au cas
 * où le suivi de stock reviendrait plus tard.
 */
export function LiterieBoard() {
  const { can } = useAuth()
  const canWrite = can('literie', 'ecriture')
  const queryClient = useQueryClient()

  const { data: rooms, isError } = useQuery({
    queryKey: ROOMS_KEY,
    queryFn: fetchRooms,
  })
  const loading = rooms === undefined

  const bedding = rooms ? beddingMap(rooms) : undefined

  // Message d'échec de la dernière bascule — affiché plutôt qu'un rollback
  // silencieux, effacé à la bascule suivante.
  const [toggleError, setToggleError] = useState<string | null>(null)

  /**
   * Bascule optimiste : snapshot du cache → mutation locale → écriture serveur
   * (simple `update hotel_rooms`) → rollback par snapshot si l'écriture
   * échoue (même schéma que RaproBoard.mutateDay).
   */
  async function handleToggle(room: number) {
    if (!canWrite || !bedding) return
    const next = !(bedding.get(room) ?? false)
    setToggleError(null)

    await queryClient.cancelQueries({ queryKey: ROOMS_KEY })
    const prev = queryClient.getQueryData<DbHotelRoom[]>(ROOMS_KEY)
    queryClient.setQueryData<DbHotelRoom[]>(ROOMS_KEY, (curr) =>
      (curr ?? []).map((r) =>
        r.room === room ? { ...r, literie_synthetique: next } : r,
      ),
    )
    try {
      await toggleBedding(room, next)
    } catch (err) {
      queryClient.setQueryData(ROOMS_KEY, prev)
      console.error(err)
      const message = err instanceof Error ? err.message : String(err)
      setToggleError(
        next
          ? `Impossible d'installer la literie synthétique en chambre ${room} — ${message}`
          : `Impossible de repasser la chambre ${room} en plume — ${message}`,
      )
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4">
      <PageHeader title="Literie" />

      {isError && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Impossible de charger l'état des chambres (connexion ?).
        </div>
      )}

      {toggleError && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {toggleError}
        </div>
      )}

      {loading ? (
        <Skeleton className="h-96 flex-1 rounded-xl" />
      ) : (
        <>
          <div className={cn('literie-floors', !canWrite && 'is-locked')}>
            {FLOORS.map(({ floor, rooms: floorRooms }) => (
              <div key={floor} className="literie-floor">
                <div className="literie-floor-head">
                  <span className="literie-floor-title">Étage {floor}</span>
                </div>
                <div className="literie-rooms">
                  {floorRooms.map((room) => {
                    const synthetic = bedding?.get(room) ?? false
                    const label = `Chambre ${room} — literie ${synthetic ? 'synthétique' : 'plume'}${canWrite ? `, cliquer pour repasser en ${synthetic ? 'plume' : 'synthétique'}` : ''}`
                    return (
                      <button
                        key={room}
                        type="button"
                        onClick={() => handleToggle(room)}
                        disabled={!canWrite}
                        aria-label={label}
                        title={label}
                        className={cn(
                          'literie-room',
                          synthetic && 'literie-room-synthetic',
                        )}
                      >
                        {room}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div
            className={cn(
              'flex flex-wrap items-center gap-x-6 gap-y-2 text-xs',
              canWrite ? 'justify-between' : 'justify-end',
            )}
          >
            {canWrite && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <MouseGlyph side="left" />
                  bascule
                </span>
              </div>
            )}
            <div className="literie-legend">
              <span className="literie-legend-item">
                <span className="literie-legend-dot" />
                Plume
              </span>
              <span className="literie-legend-item">
                <span className="literie-legend-dot is-synthetic" />
                Synthétique
              </span>
            </div>
          </div>

          <BabyCotBoard />
        </>
      )}
    </div>
  )
}
