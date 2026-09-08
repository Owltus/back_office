import type { ReactNode } from 'react'

import { MouseGlyph } from '#/components/parking/MouseGlyph.tsx'
import {
  barRect,
  PmrGlyph,
  ReservationBar,
} from '#/components/parking/ReservationBar.tsx'
import { Kbd, KbdArrow, KbdPlus, Shortcut } from '#/components/shared/Kbd.tsx'
import { fmtPctInt } from '#/lib/format/index.ts'
import { FIRST_STAFF_SPOT, PMR_SPOT } from '#/lib/parking/model.ts'
import type { Reservation } from '#/lib/parking/model.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Contenu du modal d'aide du Parking (bouton « ? » de la barre d'actions).
 * Tutoriel FACTUEL pour un nouvel utilisateur : à quoi sert le planning, comment
 * le lire, le sens des couleurs, les gestes de création/modification, la
 * navigation et l'impression. Purement descriptif — aucune donnée, aucun état.
 * Même présentation que les mode d'emploi du rapprochement et de RepJour.
 *
 * Les exemples sont rendus par la VRAIE barre du planning (`ReservationBar`) sur
 * une grille reconstruite à l'identique : une légende dessinée à la main
 * finirait par mentir sur ce que le planning affiche.
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

/** Terme mis en avant dans une phrase. */
function Term({ children }: { children: ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>
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

/* --------------------------------------------------------------------------
 * Exemples ILLUSTRÉS : de vraies barres (`ReservationBar`, le composant du
 * planning) posées sur une grille reconstruite à l'identique — même fond rayé,
 * même colonne de places, même en-tête de jours. Données fictives, ensemble
 * inerte (`pointer-events-none` + `canEdit={false}`).
 *
 * La géométrie est fixe ici, alors que le planning calcule la largeur d'un jour
 * d'après la place disponible : ces valeurs sont choisies pour tenir dans le
 * modal (`sm:max-w-2xl`).
 * ------------------------------------------------------------------------ */

const D_DAY_W = 124
const D_SLOT_W = D_DAY_W / 2
const D_ROW_H = 38
const D_HEADER_H = 44
const D_LABEL_W = 44

const noop = () => {}

const fmtWeekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' })
const fmtDay = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
})
/** Quatre jours d'exemple (lundi à jeudi), formatés comme sur la page. */
const DEMO_DAYS = [7, 8, 9, 10].map((d) => new Date(2026, 8, d))

/** Une réservation d'exemple. `spot` est le rang DANS la vitrine (1 = première
 *  rangée montrée), pas le numéro de place : la colonne de gauche porte les
 *  vrais numéros, ce qui permet d'illustrer les places 12 à 14 sans dessiner
 *  les onze premières. */
function demoRes(over: Partial<Reservation> & { spot: number }): Reservation {
  return {
    id: `demo-${over.spot}-${over.startDay ?? 0}-${over.status ?? 'reserve'}`,
    client: '',
    startDay: 0,
    nights: 1,
    status: 'reserve',
    comment: '',
    ...over,
  }
}

/** Le fond rayé de la grille : séparation des jours, trait de midi (le modèle
 *  demi-journées), lignes de rangées. Recopié du planning. */
function DemoGrid() {
  return (
    <div
      className="absolute inset-0"
      style={{
        backgroundImage: [
          `repeating-linear-gradient(to right, rgba(148,163,184,0.18) 0 1px, transparent 1px ${D_DAY_W}px)`,
          `repeating-linear-gradient(to right, transparent 0 ${D_SLOT_W}px, rgba(148,163,184,0.08) ${D_SLOT_W}px ${D_SLOT_W + 1}px, transparent ${D_SLOT_W + 1}px ${D_DAY_W}px)`,
          `repeating-linear-gradient(to bottom, rgba(148,163,184,0.10) 0 1px, transparent 1px ${D_ROW_H}px)`,
        ].join(','),
      }}
    />
  )
}

/** Un extrait de planning : colonne des places, en-tête de jours (taux
 *  d'occupation, zone critique) et barres. */
function Demo({
  spots,
  occupancy,
  critical = [],
  reservations = [],
  locked = [],
  header = true,
  children,
}: {
  /** Les VRAIS numéros de place montrés à gauche, de haut en bas. */
  spots: number[]
  /** Taux affiché sous chaque jour ; omis = pas de chiffre. */
  occupancy?: number[]
  /** Index des jours en zone critique (colonne rouge). */
  critical?: number[]
  reservations?: Reservation[]
  /** Ids des réservations à rendre verrouillées (grisées). */
  locked?: string[]
  header?: boolean
  children?: ReactNode
}) {
  const height = spots.length * D_ROW_H
  const width = DEMO_DAYS.length * D_DAY_W
  return (
    <div
      className="pointer-events-none my-3 w-fit max-w-full select-none overflow-x-auto rounded-2xl border border-border bg-card"
      aria-hidden="true"
    >
      <div className="flex">
        {/* Colonne des places — recopie du planning. */}
        <div
          className="shrink-0 border-r border-border"
          style={{ width: D_LABEL_W }}
        >
          {header && (
            <div
              className="flex items-center justify-center text-xs font-medium text-muted-foreground"
              style={{ height: D_HEADER_H }}
            >
              Place
            </div>
          )}
          {spots.map((s) => (
            <div
              key={s}
              className={cn(
                'flex items-center justify-center border-t border-border text-sm',
                s >= FIRST_STAFF_SPOT && 'bg-primary/5',
              )}
              style={{ height: D_ROW_H }}
            >
              {s === PMR_SPOT ? (
                <PmrGlyph className="size-6" />
              ) : (
                <span className="font-medium tabular-nums">{s}</span>
              )}
            </div>
          ))}
        </div>
        <div>
          {/* En-tête des jours — recopie du planning (jour, date, taux). */}
          {header && (
            <div className="flex" style={{ height: D_HEADER_H }}>
              {DEMO_DAYS.map((d, i) => {
                const isCritical = critical.includes(i)
                const pct = occupancy?.[i]
                return (
                  <div
                    key={i}
                    className={cn(
                      'flex flex-col items-center justify-center border-l border-border first:border-l-0',
                      isCritical && 'bg-rose-500/10',
                    )}
                    style={{ width: D_DAY_W }}
                  >
                    <span
                      className={cn(
                        'text-xs font-medium capitalize',
                        isCritical && 'text-rose-600 dark:text-rose-300',
                      )}
                    >
                      {fmtWeekday.format(d)}
                    </span>
                    <span
                      className={cn(
                        'text-[11px] text-muted-foreground',
                        isCritical && 'text-rose-500/80 dark:text-rose-300/80',
                      )}
                    >
                      {fmtDay.format(d)}
                    </span>
                    {pct != null && (
                      <span
                        className={cn(
                          'text-[10px] font-medium tabular-nums',
                          isCritical
                            ? 'text-rose-500 dark:text-rose-400'
                            : 'text-sky-400',
                        )}
                      >
                        {fmtPctInt(pct)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <div className="relative overflow-hidden" style={{ width, height }}>
            <DemoGrid />
            {/* Bandes des places personnel, comme sur le planning. */}
            {spots.map((s, i) =>
              s >= FIRST_STAFF_SPOT ? (
                <div
                  key={s}
                  className="absolute right-0 left-0 bg-primary/5"
                  style={{ top: i * D_ROW_H, height: D_ROW_H }}
                />
              ) : null,
            )}
            {/* Colonnes en zone critique (rouge sur toute la hauteur). */}
            {critical.map((i) => (
              <div
                key={i}
                className="absolute top-0 bg-rose-500/10"
                style={{ left: i * D_DAY_W, width: D_DAY_W, height }}
              />
            ))}
            {reservations.map((r) => (
              <ReservationBar
                key={r.id}
                r={r}
                canEdit={false}
                locked={locked.includes(r.id)}
                offset={0}
                slotW={D_SLOT_W}
                rowH={D_ROW_H}
                editing={false}
                onStartInteraction={noop}
                onStartEdit={noop}
                onStopEdit={noop}
                onRename={noop}
                onStatus={noop}
                onComment={noop}
                onCopy={noop}
                onRemove={noop}
              />
            ))}
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Le fantôme de collage, tel que le planning le dessine — teinte du statut
 *  copié, ou rouge quand la place est déjà prise sur la période. */
function DemoGhost({
  spot,
  startDay,
  nights,
  invalid,
  label,
}: {
  spot: number
  startDay: number
  nights: number
  invalid?: boolean
  label: string
}) {
  return (
    <div
      className={cn(
        'absolute z-30 flex items-center rounded-md border px-1.5 text-xs shadow-lg',
        invalid
          ? 'border-rose-500 bg-rose-500/25 text-rose-700 dark:text-rose-50'
          : 'border-slate-400/50 bg-slate-400/15 text-slate-700 dark:text-slate-100',
      )}
      style={barRect(startDay, spot, nights, 0, D_SLOT_W, D_ROW_H)}
    >
      <span className="truncate font-medium">{label}</span>
    </div>
  )
}

/** Légende sous un exemple : la phrase qui dit quoi regarder. */
function Caption({ children }: { children: ReactNode }) {
  return <p className="text-xs italic">{children}</p>
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
        <Demo
          spots={[6, 7, 8, 9]}
          occupancy={[58, 75, 75, 42]}
          reservations={[
            demoRes({
              spot: 1,
              client: 'BESSONNEAU, Pierre-Louis',
              startDay: 0,
              nights: 2,
              status: 'paye',
            }),
            demoRes({
              spot: 3,
              client: 'HAMON, Albane',
              startDay: 1,
              nights: 2,
              status: 'reserve',
              comment: 'Arrivée tardive, badge à laisser à la réception.',
            }),
          ]}
        />
        <Caption>
          Deux séjours de deux nuits. Remarquez que chaque barre{' '}
          <Term>commence au milieu</Term> de sa colonne d'arrivée et se termine au
          milieu de la colonne de départ : le client arrive dans la journée et
          repart le matin. Le trait vertical léger au centre de chaque jour est ce
          repère de midi. La place 8 porte le pictogramme fauteuil roulant : c'est
          la place PMR.
        </Caption>
        <p>
          En tête de chaque colonne, le pourcentage bleu indique le taux
          d'occupation des 12 places clients ce jour-là. Le jour courant et les
          week-ends sont légèrement marqués pour se repérer, et un grand chiffre
          en filigrane rappelle le numéro de la semaine.
        </p>
        <p>
          La bulle sur la barre d'Albane Hamon signale un commentaire ;
          survolez-la sur la page pour le lire.
        </p>
      </Section>

      <Section title="Les couleurs des réservations">
        <Demo
          header={false}
          spots={[1, 2, 3, 4, 5]}
          reservations={[
            demoRes({
              spot: 1,
              client: 'Réservé',
              nights: 4,
              status: 'reserve',
            }),
            demoRes({ spot: 2, client: 'Payé', nights: 4, status: 'paye' }),
            demoRes({
              spot: 3,
              client: 'Non payé',
              nights: 4,
              status: 'checkout',
            }),
            demoRes({ spot: 4, client: 'Employé', nights: 4, status: 'employe' }),
            demoRes({
              spot: 5,
              client: 'Gratuité',
              nights: 4,
              status: 'gratuite',
            }),
          ]}
        />
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <Term>Gris, réservé</Term> : la place est retenue, le paiement n'est
            pas encore enregistré.
          </li>
          <li>
            <Term>Vert, payé</Term> : le séjour est réglé.
          </li>
          <li>
            <Term>Orange, non payé</Term> : le client est parti sans régler. Ce
            statut demande un motif écrit (voir plus bas).
          </li>
          <li>
            <Term>Violet, employé</Term> : la place est occupée par un véhicule du
            personnel. Elle occupe bien le planning, mais n'entre pas dans le
            chiffre d'affaires.
          </li>
          <li>
            <Term>Bleu, gratuité</Term> : place offerte. Elle compte dans
            l'occupation, jamais dans le chiffre d'affaires.
          </li>
        </ul>
      </Section>

      <Section title="Quand le parking déborde">
        <p>
          L'hôtel dispose de <Term>12 places clients</Term>, plus deux places
          tampon (13 et 14) normalement réservées au personnel. Le taux
          d'occupation se calcule toujours sur ces douze places : dès qu'on occupe
          plus de douze places au total, il passe au-dessus de 100 %.
        </p>
        <Demo
          spots={[11, 12, 13, 14]}
          occupancy={[75, 108, 108, 75]}
          critical={[1, 2]}
          reservations={[
            demoRes({
              spot: 1,
              client: 'LEBOUCHER, Teddy',
              startDay: 0,
              nights: 3,
              status: 'paye',
            }),
            demoRes({
              spot: 2,
              client: 'HAMON, Albane',
              startDay: 1,
              nights: 2,
              status: 'reserve',
            }),
            demoRes({
              spot: 3,
              client: 'BESSONNEAU, Pierre-Louis',
              startDay: 1,
              nights: 2,
              status: 'reserve',
            }),
          ]}
        />
        <Caption>
          Mardi et mercredi, les douze places clients sont pleines et un client a
          été posé sur la place 13 : la colonne entière passe en rouge et le taux
          affiche 108 %. C'est la <Term>zone critique</Term> — le parking déborde
          sur le personnel.
        </Caption>
      </Section>

      {/* `canEdit` (posé par ParkingBoard) vaut désormais toujours faux sur
          écran tactile — cette section, formulée en langage souris (clic
          droit, clic gauche maintenu, Ctrl+clic), ne s'affiche donc déjà plus
          en contexte tactile pur, sans media query dédiée à ajouter ici. */}
      {canEdit && (
        <Section title="Créer et modifier une réservation">
          <GestureRow side="right">
            <Term>Clic droit</Term> sur une case vide : créer une nouvelle
            réservation. Un clic droit sur une barre ouvre son menu (renommer,
            commentaire, copier, changer le statut, supprimer).
          </GestureRow>
          <GestureRow side="left">
            <Term>Clic gauche maintenu</Term> sur une barre : la déplacer (jour et
            place). En tirant ses bords gauche ou droit, on allonge ou raccourcit
            le séjour. Un double-clic renomme le client sur place.
          </GestureRow>
          <p>
            Une réservation nouvellement créée n'a pas encore de nom : elle
            affiche <Term>Sans nom</Term> en attendant que vous le saisissiez.
          </p>
          <p>
            Si vous amenez une barre au bord du planning pendant un déplacement,
            les jours défilent d'eux-mêmes : c'est ainsi qu'on étend un séjour
            au-delà de ce qui est affiché.
          </p>
          <p>
            Pour dupliquer : « Copier » (menu de la barre, ou Ctrl/Cmd + clic).
            Une copie s'accroche alors au curseur ; un clic la pose sur la case
            visée, la touche Échap ou un clic droit annule. Le nom, la durée, le
            statut et le commentaire sont copiés avec.
          </p>
          <Demo
            header={false}
            spots={[3, 4]}
            reservations={[
              demoRes({
                spot: 2,
                client: 'HAMON, Albane',
                startDay: 1,
                nights: 2,
                status: 'paye',
              }),
            ]}
          >
            <DemoGhost spot={1} startDay={0} nights={2} label="Copie" />
            <DemoGhost spot={2} startDay={1} nights={2} invalid label="Copie" />
          </Demo>
          <Caption>
            Une copie en cours de placement. En haut, la place est libre : le
            fantôme garde la couleur du statut copié. En bas, il chevauche une
            réservation existante et vire au rouge — le clic ne posera rien.
          </Caption>
          <p>
            Attention à la nuance : ce rouge n'apparaît que pour un{' '}
            <Term>collage</Term>. Quand vous <Term>déplacez</Term> une barre sur
            une place déjà prise, rien ne rougit : la barre refuse simplement de
            bouger et reste où elle est.
          </p>
          <p>
            Un geste malheureux se corrige avec <Term>Ctrl + Z</Term> (annuler) et{' '}
            <Term>Ctrl + Y</Term> (rétablir).
          </p>
          <p>
            Vous modifiez librement les réservations en cours, à venir et
            terminées depuis moins de sept jours. Au-delà, une réservation passée
            se verrouille : elle se grise, son menu disparaît, et seule la gestion
            peut encore la modifier. La copier reste possible.
          </p>
          <Demo
            header={false}
            spots={[9, 10]}
            reservations={[
              demoRes({
                spot: 1,
                client: 'LEBOUCHER, Teddy',
                nights: 2,
                status: 'paye',
              }),
              demoRes({
                spot: 2,
                client: 'BESSONNEAU, Pierre-Louis',
                nights: 2,
                status: 'paye',
              }),
            ]}
            locked={['demo-2-0-paye']}
          />
          <Caption>
            La même réservation, modifiable en haut, verrouillée en bas.
          </Caption>
        </Section>
      )}

      {/* Deux versions du même déplacement dans le temps, selon l'entrée
          RÉELLEMENT disponible — jamais les deux en même temps : sur écran
          tactile, il n'y a ni flèches de barre d'actions ni bouton calendrier
          (remplacés par la barre d'outils basse, cf. ParkingBoard), et le
          panoramique se fait au doigt plutôt qu'à la souris.
          `pointer-fine`/`pointer-coarse` (media feature `pointer`), PAS une
          largeur d'écran : une tablette tactile large affiche le même texte
          qu'un téléphone, un ordinateur en fenêtre étroite garde le texte
          souris. */}
      <div className="hidden pointer-fine:block">
        <Section title="Se déplacer dans le temps">
          <p>
            Les flèches en haut à droite avancent ou reculent de trois jours ;
            l'icône calendrier saute à une date précise, et « Aujourd'hui » y
            ramène. On peut aussi attraper une zone vide du planning et la
            faire glisser pour parcourir les jours.
          </p>
        </Section>
      </div>
      <div className="pointer-fine:hidden">
        <Section title="Se déplacer dans le temps">
          <p>
            Les boutons Préc. et Suiv. de la barre du bas avancent ou reculent
            de trois jours. On peut aussi glisser du doigt une zone vide du
            planning pour parcourir les jours.
          </p>
        </Section>
      </div>

      {/* Un clavier physique n'existe pas sur un écran tactile — section
          réservée à la souris/au clavier, même convention que ci-dessus. */}
      <div className="hidden pointer-fine:block">
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
                  Annuler la dernière action : création, déplacement,
                  renommage, statut, commentaire ou suppression (⌘ sur Mac).
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
      </div>

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
          impayés pour le suivi. Un bouton « À régler au checkout » propose le
          motif le plus courant en un clic.
        </p>
      </Section>

      <Section title="Regarder le mois : l'analytique">
        <p>
          Le bouton courbe ouvre l'analytique du parking. On y va pour les
          questions qui dépassent la journée : combien de réservations ce mois-ci,
          quel remplissage, quel chiffre d'affaires, combien de départs sans
          paiement.
        </p>
        <p>
          <Term>La vue annuelle</Term> résume l'année en six cartes —{' '}
          <Term>Réservations</Term>, <Term>TO moyen</Term>,{' '}
          <Term>Nuits totales</Term>, <Term>CA Parking</Term>,{' '}
          <Term>Impayés</Term> et <Term>Captage</Term> — puis un tableau mois par
          mois et une courbe d'occupation. Les flèches font défiler les années.
        </p>
        <p>
          <Term>Cliquez sur une ligne du tableau</Term> pour ouvrir le détail d'un
          mois, jour par jour ; puis <Term>cliquez sur un jour</Term> pour revenir
          au planning positionné dessus. C'est le chemin normal quand un chiffre
          vous étonne : descendez jusqu'à la journée qui l'explique.
        </p>
        <p>Trois points à connaître pour lire ces chiffres sans se tromper :</p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <Term>Le captage est plafonné à 100 %</Term>, contrairement au taux
            d'occupation. Il compare le remplissage du parking à celui de l'hôtel :
            100 % veut dire que le parking est au moins aussi rempli, en
            proportion, que l'hôtel. Il affiche un tiret tant que l'occupation de
            l'hôtel n'est pas connue.
          </li>
          <li>
            <Term>Les réservations employé et les gratuités sont hors chiffre
            d'affaires</Term>, alors qu'elles occupent bien une place. Un parking
            plein avec peu de recette n'est pas une anomalie.
          </li>
          <li>
            <Term>Un mois vide affiche des tirets, pas des zéros</Term>, et la
            courbe s'interrompt au lieu de retomber à zéro : rien n'a été mesuré,
            ce n'est pas un mois sans réservation.
          </li>
        </ul>
        <p>
          Une nuance de calcul, utile quand deux chiffres semblent se contredire :
          la vue annuelle rattache chaque réservation, nuits et recette comprises,
          au <Term>mois de son arrivée</Term>, tandis que le détail mensuel déplie
          vraiment chaque séjour nuit par nuit. Un séjour à cheval sur deux mois
          n'est donc pas compté au même endroit dans les deux vues.
        </p>
        <p>
          Les tarifs ne se règlent pas depuis cette page : les montants viennent
          d'une grille tarifaire datée, appliquée selon la date d'arrivée de chaque
          réservation.
        </p>
      </Section>
    </div>
  )
}
