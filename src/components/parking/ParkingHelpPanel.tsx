import type { ReactNode } from 'react'

import { MouseGlyph } from '#/components/parking/MouseGlyph.tsx'
import { Kbd, KbdArrow, KbdPlus, Shortcut } from '#/components/shared/Kbd.tsx'
import { cn } from '#/lib/utils.ts'

/*
 * Contenu du modal d'aide du Parking (bouton « ? » de la barre d'actions).
 * Tutoriel FACTUEL pour un nouvel utilisateur : à quoi sert le planning, comment
 * le lire, le sens des couleurs, les gestes de création/modification, la
 * navigation et l'impression. Purement descriptif — aucune donnée, aucun état.
 * Même présentation que les mode d'emploi du rapprochement et de RepJour.
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

/** Une ligne de statut : pastille de couleur + nom + description. */
function StatusRow({
  dot,
  name,
  children,
}: {
  dot: string
  name: string
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={cn('mt-1 size-2.5 shrink-0 rounded-full', dot)}
        aria-hidden="true"
      />
      <span>
        <span className="font-medium text-foreground">{name}</span> {children}
      </span>
    </div>
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

export function ParkingHelpPanel({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="space-y-6">
      <Section title="À quoi sert cette page">
        <p>
          Le planning attribue les places de parking, jour par jour. Chaque
          réservation est une barre posée sur une place, du jour d'arrivée
          jusqu'à la veille du départ. Les modifications sont partagées en temps
          réel : ce que vous changez apparaît aussitôt sur l'écran des collègues.
        </p>
      </Section>

      <Section title="Lire le planning">
        <p>
          Chaque colonne est un jour, chaque ligne une place. Les places du haut
          sont pour les clients ; celles du bas, en surbrillance, sont réservées
          au personnel. Une barre s'étend sur toute la durée du séjour.
        </p>
        <p>
          En tête de chaque colonne, le pourcentage bleu indique le taux
          d'occupation des places clients ce jour-là. Le jour courant et les
          week-ends sont légèrement marqués pour se repérer.
        </p>
      </Section>

      <Section title="Les couleurs des réservations">
        <StatusRow dot="bg-slate-400" name="Gris, réservé.">
          La place est retenue, le paiement n'est pas encore enregistré.
        </StatusRow>
        <StatusRow dot="bg-emerald-500" name="Vert, payé.">
          Le séjour est réglé.
        </StatusRow>
        <StatusRow dot="bg-orange-500" name="Orange, non payé.">
          Le client est parti sans régler. Ce statut demande un motif écrit (voir
          plus bas).
        </StatusRow>
        <p>
          Une bulle sur une barre signale qu'un commentaire y est attaché ;
          survolez-la pour le lire.
        </p>
      </Section>

      {canEdit && (
        <Section title="Créer et modifier une réservation">
          <GestureRow side="right">
            <span className="font-medium text-foreground">Clic droit</span> sur une
            case vide : créer une nouvelle réservation. Un clic droit sur une barre
            ouvre son menu (renommer, commentaire, copier, changer le statut,
            supprimer).
          </GestureRow>
          <GestureRow side="left">
            <span className="font-medium text-foreground">Clic gauche maintenu</span>{' '}
            sur une barre : la déplacer (jour et place). En tirant ses bords
            gauche ou droit, on allonge ou raccourcit le séjour. Un double-clic
            renomme le client sur place.
          </GestureRow>
          <p>
            Pour dupliquer : « Copier » (menu de la barre, ou Ctrl/Cmd + clic).
            Une copie s'accroche alors au curseur ; un clic la pose sur la case
            visée, la touche Échap annule. Le nom, la durée, le statut et le
            commentaire sont copiés avec.
          </p>
          <p>
            Une place déjà occupée à ce moment refuse le dépôt (la barre devient
            rouge) : deux réservations ne peuvent pas se chevaucher.
          </p>
          <p>
            Un geste malheureux se corrige avec{' '}
            <span className="font-medium text-foreground">Ctrl + Z</span> (annuler)
            et <span className="font-medium text-foreground">Ctrl + Y</span>{' '}
            (rétablir).
          </p>
          <p>
            Vous modifiez librement les réservations en cours, à venir et
            terminées depuis moins de sept jours. Au-delà, une réservation passée
            se verrouille : seule la gestion peut encore la modifier.
          </p>
        </Section>
      )}

      <Section title="Se déplacer dans le temps">
        <p>
          Les flèches en haut à droite avancent ou reculent de trois jours ;
          l'icône calendrier saute à une date précise, et « Aujourd'hui » y
          ramène. On peut aussi attraper une zone vide du planning et la faire
          glisser pour parcourir les jours.
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
            Reculer ou avancer de trois jours.
          </Shortcut>
          <Shortcut keys={<Kbd className="px-2">Alt</Kbd>}>
            Revenir à aujourd'hui.
          </Shortcut>
          <Shortcut
            keys={
              <>
                <Kbd className="px-2">Ctrl</Kbd>
                <KbdPlus />
                <MouseGlyph side="left" />
              </>
            }
          >
            Copier une réservation, puis un clic la pose sur la case visée
            (⌘ sur Mac).
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
                statut, commentaire ou suppression (⌘ sur Mac).
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
          <Shortcut
            keys={
              <>
                <Kbd className="px-2">Ctrl</Kbd>
                <KbdPlus />
                <Kbd>P</Kbd>
              </>
            }
          >
            Imprimer les feuilles de suivi.
          </Shortcut>
        </div>
      </Section>

      <Section title="Imprimer les feuilles de suivi">
        <p>
          Le bouton d'impression génère quatre feuilles — d'hier à après-demain —
          pré-remplies avec les clients présents chaque jour. Quand c'est
          possible, le numéro de chambre est rapproché automatiquement du rooming
          du jour ; sinon la case reste à compléter à la main.
        </p>
      </Section>

      <Section title="Le motif du « non payé »">
        <p>
          Passer une réservation en « non payé » demande d'écrire pourquoi. Sans
          motif, le statut n'est pas enregistré. Cela garde une trace claire des
          impayés pour le suivi.
        </p>
      </Section>
    </div>
  )
}
