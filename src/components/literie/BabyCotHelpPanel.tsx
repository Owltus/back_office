import type { ReactNode } from 'react'

import { MouseGlyph } from '#/components/parking/MouseGlyph.tsx'
import { Kbd, KbdArrow, KbdPlus, Shortcut } from '#/components/shared/Kbd.tsx'

/*
 * Contenu du modal d'aide du planning lits bébé (bouton « ? » de la barre
 * d'actions). Même gabarit que `ParkingHelpPanel` (tutoriel factuel, aucune
 * donnée, aucun état) — adapté à un modèle plus simple : pas de statut, pas de
 * copier, pas d'impression, fenêtre de grâce à 2 jours au lieu de 7.
 */

/** Un bloc de section : titre + contenu. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  )
}

/** Une ligne de geste : glyphe souris + description. */
function GestureRow({
  side,
  children,
}: {
  side: 'left' | 'right'
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0">
        <MouseGlyph side={side} />
      </span>
      <span>{children}</span>
    </div>
  )
}

export function BabyCotHelpPanel({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="space-y-6">
      <Section title="À quoi sert cette page">
        <p>
          Le planning attribue les lits parapluie bébé, jour par jour. Chaque
          assignation est un bloc posé sur un lit, du jour d'arrivée jusqu'à
          la veille du départ. Les modifications sont partagées en temps réel :
          ce que vous changez apparaît aussitôt sur l'écran des collègues.
        </p>
      </Section>

      <Section title="Lire le planning">
        <p>
          Chaque colonne est un jour, chaque ligne un lit. Un bloc s'étend sur
          toute la durée du séjour. Le jour courant et les week-ends sont
          légèrement marqués pour se repérer.
        </p>
        <p>
          Une bulle sur un bloc signale qu'un commentaire y est attaché ;
          survolez-la pour le lire.
        </p>
      </Section>

      {canEdit && (
        <Section title="Créer et modifier une assignation">
          <GestureRow side="right">
            <span className="font-medium text-foreground">Clic droit</span> sur
            une case vide : créer une nouvelle assignation. Un clic droit sur
            un bloc ouvre son menu (renommer, commentaire, supprimer).
          </GestureRow>
          <GestureRow side="left">
            <span className="font-medium text-foreground">Clic gauche maintenu</span>{' '}
            sur un bloc : le déplacer (jour et lit). En tirant ses bords gauche
            ou droit, on allonge ou raccourcit le séjour. Un double-clic
            renomme sur place.
          </GestureRow>
          <p>
            Un lit déjà occupé à ce moment refuse le déplacement ou le
            redimensionnement : le bloc reste à sa dernière position valide.
          </p>
          <p>
            Un geste malheureux se corrige avec{' '}
            <span className="font-medium text-foreground">Ctrl + Z</span> (annuler)
            et <span className="font-medium text-foreground">Ctrl + Y</span>{' '}
            (rétablir).
          </p>
          <p>
            Vous modifiez librement les assignations en cours, à venir et
            terminées depuis moins de deux jours. Au-delà, une assignation
            passée se verrouille : seule la gestion peut encore la modifier.
          </p>
        </Section>
      )}

      <Section title="Se déplacer dans le temps">
        <p>
          Les flèches en haut à droite avancent ou reculent d'une semaine ;
          l'icône calendrier saute à une date précise, et « Aujourd'hui » y
          ramène.
        </p>
      </Section>

      <Section title="Raccourcis clavier">
        <div className="space-y-2.5">
          <Shortcut
            keys={
              <>
                <Kbd>
                  <KbdArrow dir="left" />
                </Kbd>
                <Kbd>
                  <KbdArrow dir="right" />
                </Kbd>
              </>
            }
          >
            Reculer ou avancer d'une semaine.
          </Shortcut>
          <Shortcut keys={<Kbd className="px-2">Alt</Kbd>}>
            Revenir à aujourd'hui.
          </Shortcut>
          {canEdit && (
            <>
              <Shortcut
                keys={
                  <>
                    <Kbd className="px-2">Ctrl</Kbd>
                    <KbdPlus />
                    <Kbd>Z</Kbd>
                  </>
                }
              >
                Annuler la dernière action : création, déplacement, renommage,
                commentaire ou suppression (⌘ sur Mac).
              </Shortcut>
              <Shortcut
                keys={
                  <>
                    <Kbd className="px-2">Ctrl</Kbd>
                    <KbdPlus />
                    <Kbd>Y</Kbd>
                  </>
                }
              >
                Rétablir l'action annulée (ou Ctrl + Maj + Z).
              </Shortcut>
            </>
          )}
        </div>
      </Section>
    </div>
  )
}
