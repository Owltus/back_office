import type { ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'

import { MouseGlyph } from '#/components/rapro/MouseGlyph.tsx'
import { RoomCell } from '#/components/rapro/RoomCell.tsx'
import { Kbd, KbdArrow, KbdPlus, Shortcut } from '#/components/shared/Kbd.tsx'
import { StatTile } from '#/components/shared/StatTile.tsx'
import { ACCENT } from '#/components/analytique/accents.ts'
import { CATEGORY_COLOR } from '#/lib/rapro/constants.ts'
import type { RoomStatus } from '#/lib/rapro/types.ts'

/*
 * Contenu du modal d'aide du Rapprochement (bouton « ? » de la barre d'actions).
 * Tutoriel FACTUEL pour un nouvel utilisateur : à quoi sert la page, comment lire
 * la grille, ce que font les deux gestes de la souris, le sens de chaque couleur
 * et de chaque compteur, la clôture. Purement descriptif — aucune donnée, aucun
 * état : c'est de la documentation intégrée, l'équivalent du « Détail des calculs »
 * de RepJour (`KPIDetailPanel`).
 *
 * Les exemples sont rendus par le VRAI composant de case (`RoomCell`, celui de la
 * grille) dans les vraies classes de la page : une légende dessinée à la main
 * finirait par mentir sur ce que la grille montre.
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

/* --------------------------------------------------------------------------
 * Exemples ILLUSTRÉS : de vraies cases de la grille (`RoomCell`), dans le
 * conteneur de la page. `is-locked` est la classe que le board pose déjà sur un
 * jour clôturé : elle rend la grille inerte SANS la griser (à la différence de
 * l'attribut `disabled`, qui ternirait les couleurs et fausserait la légende).
 * Les colonnes sont imposées en ligne : `.rapro-floors` se règle sur la largeur
 * du VIEWPORT (3 puis 6 colonnes), pas sur celle du modal.
 * ------------------------------------------------------------------------ */

/** Une case seule, à sa taille de grille, pour illustrer une phrase. */
function DemoCell({
  room,
  status,
  sold,
  carried,
}: {
  room: number
  status: RoomStatus | null
  sold: boolean
  carried?: boolean
}) {
  return (
    // `.rapro-floors` est une grille : `display: block` n'en garde qu'UNE case,
    // à sa largeur naturelle. La classe reste nécessaire — c'est elle qui porte
    // `is-locked` (case inerte, couleurs intactes).
    <span
      className="rapro-floors is-locked block w-14 shrink-0 select-none"
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      <RoomCell room={room} status={status} sold={sold} carried={carried} />
    </span>
  )
}

/** Une rangée de cases légendée : la case, puis ce qu'elle veut dire. */
function CellRow({
  room,
  status,
  sold,
  carried,
  name,
  children,
}: {
  room: number
  status: RoomStatus | null
  sold: boolean
  carried?: boolean
  name: string
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <DemoCell room={room} status={status} sold={sold} carried={carried} />
      <span className="min-w-0">
        <Term>{name}</Term> {children}
      </span>
    </div>
  )
}

/** Une colonne d'étage complète, comme sur la page (en-tête + cases). */
function DemoFloor({
  floor,
  children,
}: {
  floor: number
  children: ReactNode
}) {
  return (
    <div className="rapro-floor">
      <div className="rapro-floor-head">
        <span className="rapro-floor-title">Étage {floor}</span>
        {/* La flèche de réinitialisation de l'étage, comme sur la page (elle
            n'apparaît que pour qui peut saisir). Sans `disabled` : l'attribut
            l'estomperait et fausserait l'illustration. */}
        <span className="rapro-floor-action" aria-hidden="true">
          <RotateCcw className="size-4" />
        </span>
      </div>
      <div className="rapro-rooms">{children}</div>
    </div>
  )
}

/** Une ou deux colonnes d'étage côte à côte, inertes. */
function Demo({ columns = 2, children }: { columns?: number; children: ReactNode }) {
  return (
    <div
      className="rapro-floors is-locked pointer-events-none my-3 select-none"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      aria-hidden="true"
    >
      {children}
    </div>
  )
}

/** Légende sous un exemple : la phrase qui dit quoi regarder. */
function Caption({ children }: { children: ReactNode }) {
  return <p className="text-xs italic">{children}</p>
}

export function RaproHelpPanel() {
  return (
    <div className="space-y-6">
      <Section title="À quoi sert cette page">
        <p>
          Le rapprochement suit le ménage des chambres, chambre par chambre et
          jour par jour. Chaque matin, vous indiquez pour chaque chambre ce qui
          s'est passé : nettoyée, laissée bloquée, refusée par le client. C'est ce
          suivi qui sert de base à la facturation du prestataire de ménage (ELIOR)
          et qui garde la trace des chambres restées à faire.
        </p>
        <p>
          L'occupation (quelles chambres ont été vendues) vient automatiquement du
          rapport In-House. Vous n'avez donc qu'à traiter les exceptions : par
          défaut, une chambre vendue est considérée comme nettoyée.
        </p>
      </Section>

      <Section title="La grille des chambres">
        <p>
          Chaque colonne est un étage, chaque case une chambre. La couleur de la
          case dit son état du jour. Un simple coup d'œil suffit : tant qu'il reste
          du rouge, il reste du travail.
        </p>
        <Demo>
          <DemoFloor floor={1}>
            <RoomCell room={102} status={null} sold />
            <RoomCell room={103} status={null} sold />
            <RoomCell room={104} status="refus" sold />
            <RoomCell room={105} status={null} sold={false} />
            <RoomCell room={106} status="non_nettoyee" sold />
          </DemoFloor>
          <DemoFloor floor={2}>
            <RoomCell room={201} status={null} sold />
            <RoomCell room={202} status={null} sold={false} carried />
            <RoomCell room={203} status={null} sold={false} />
            <RoomCell room={204} status="rattrapage" sold={false} carried />
            <RoomCell room={205} status={null} sold />
          </DemoFloor>
        </Demo>
        <Caption>
          Deux étages en cours de traitement. Les chambres 106 (rouge) et 202
          (grise cerclée de rouge) sont les seules où il reste du travail.
        </Caption>
        <p>
          La flèche en haut d'un étage remet toutes ses chambres à leur état
          d'origine, d'un seul geste, pour repartir d'une saisie propre.
        </p>
      </Section>

      <Section title="Les couleurs">
        <CellRow room={102} status={null} sold name="Verte, nettoyée.">
          La chambre a été faite. Elle est facturée à ELIOR. C'est aussi l'état par
          défaut d'une chambre vendue, même sans clic.
        </CellRow>
        <CellRow room={105} status={null} sold={false} name="Grise, non vendue.">
          Personne n'a dormi dans la chambre cette nuit. Il n'y a rien à y faire —
          sauf si elle porte un liseré rouge, voir plus bas.
        </CellRow>
        <CellRow room={106} status="non_nettoyee" sold name="Rouge, bloquée.">
          La chambre n'a pas été nettoyée. Elle reste due et réapparaîtra demain.
          Le rouge s'affiche même sur une chambre non vendue : le ménage reste dû
          quoi qu'il arrive.
        </CellRow>
        <CellRow room={104} status="refus" sold name="Ambre, refus.">
          Le client en séjour a refusé le ménage. Rien à faire, et ce n'est pas
          facturé.
        </CellRow>
        <CellRow
          room={202}
          status={null}
          sold={false}
          carried
          name="Liseré rouge, bloquée de la veille."
        >
          Un contour rouge signale une chambre bloquée un jour précédent, pas encore
          soldée. Il s'ajoute par-dessus la couleur du jour, sans jamais la
          remplacer, et reste tant que la chambre n'a pas été traitée.
        </CellRow>
      </Section>

      {/* Deux versions du même geste, selon l'entrée RÉELLEMENT disponible —
          jamais les deux en même temps : la souris n'existe pas au doigt, et
          décrire « clic droit » sur un écran tactile n'aiderait personne.
          `pointer-fine`/`pointer-coarse` (media feature `pointer`), PAS une
          largeur d'écran : une tablette tactile large affiche le même texte
          qu'un téléphone, un ordinateur en fenêtre étroite garde le texte
          souris — la largeur ne dit rien sur la présence d'une souris. */}
      <div className="hidden pointer-fine:block">
        <Section title="Les deux gestes de la souris">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0">
              <MouseGlyph side="left" />
            </span>
            <span>
              <Term>Clic gauche</Term> : fait défiler le statut de la chambre. Les
              états proposés s'adaptent à la situation (voir juste en dessous).
            </span>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0">
              <MouseGlyph side="right" />
            </span>
            <span>
              <Term>Clic droit</Term> : pose ou retire à la main le liseré
              « bloquée de la veille ». Utile pour un report tardif repéré après
              coup. Le liseré calculé automatiquement à partir des jours passés,
              lui, ne se retire pas au clic droit. Ce geste ne change jamais la
              couleur de la case.
            </span>
          </div>
        </Section>
      </div>
      <div className="pointer-fine:hidden">
        <Section title="Les deux gestes tactiles">
          <p>
            <Term>Appui simple</Term> : fait défiler le statut de la chambre. Les
            états proposés s'adaptent à la situation (voir juste en dessous).
          </p>
          <p>
            <Term>Appui long</Term> : pose ou retire à la main le liseré « bloquée
            de la veille ». Utile pour un report tardif repéré après coup. Le
            liseré calculé automatiquement à partir des jours passés, lui, ne se
            retire pas à l'appui long, et ce geste ne change jamais la couleur.
          </p>
        </Section>
      </div>

      <Section title="Ce que propose le clic, selon la chambre">
        <p>
          Le cycle des couleurs n'est pas le même partout : la page ne propose que
          ce qui a un sens pour cette chambre-là, ce jour-là.
        </p>
        <p>
          <Term>Chambre vendue</Term> — quatre états, dans cet ordre :
        </p>
        <Demo columns={1}>
          <DemoFloor floor={1}>
            <RoomCell room={102} status={null} sold />
            <RoomCell room={102} status="refus" sold />
            <RoomCell room={102} status="non_nettoyee" sold />
            <RoomCell room={102} status="non_vendue" sold />
          </DemoFloor>
        </Demo>
        <Caption>
          Nettoyée (l'état de départ, sans avoir rien fait) → refus → bloquée →
          non vendue. Ce dernier état corrige une vente que le rooming a comptée à
          tort : la chambre sort alors des vendues. Un clic de plus revient au
          vert.
        </Caption>
        <p>
          <Term>Chambre non vendue et bloquée la veille</Term> — le clic ne sert
          qu'à solder le ménage en retard :
        </p>
        <Demo columns={1}>
          <DemoFloor floor={2}>
            <RoomCell room={202} status={null} sold={false} carried />
            <RoomCell room={202} status="rattrapage" sold={false} carried />
            <RoomCell room={202} status="non_nettoyee" sold={false} carried />
          </DemoFloor>
        </Demo>
        <Caption>
          Encore due → rattrapée (le ménage a été fait) → toujours bloquée. Pas de
          « refus » ici : sans client dans la chambre, il n'y a personne pour
          refuser.
        </Caption>
        <p>
          <Term>Chambre non vendue ordinaire</Term> : le clic sert à corriger dans
          l'autre sens, quand le rooming a raté une vente. Grise → nettoyée →
          refus → bloquée. Poser une couleur affirme que la chambre était bien
          occupée : elle compte alors dans les vendues.
        </p>
        <p>
          Attention à un cas qui trompe : une chambre <Term>revendue</Term> le jour
          même, alors qu'elle était bloquée la veille, suit le cycle des chambres
          vendues — refus compris. Le liseré ne change pas le cycle, il ne fait que
          rappeler la dette.
        </p>
      </Section>

      <Section title="Le cas d'une chambre bloquée la veille et non vendue">
        <p>
          C'est le cas le plus délicat, et le seul qui demande de savoir lire deux
          signes à la fois.
        </p>
        <Demo columns={1}>
          <DemoFloor floor={2}>
            <RoomCell room={202} status={null} sold={false} carried />
            <RoomCell room={202} status="rattrapage" sold={false} carried />
          </DemoFloor>
        </Demo>
        <Caption>
          Avant, puis après le ménage. La couleur change, le liseré reste : il dit
          d'où vient la chambre.
        </Caption>
        <p>
          Une chambre bloquée hier revient aujourd'hui avec son contour rouge. Si
          elle n'est pas revendue, elle apparaît{' '}
          <Term>grise avec le contour rouge</Term> : vide, mais son ménage reste
          dû. C'est le piège du gris — ici, il ne veut pas dire « rien à faire ».
        </p>
        <p>
          Quand vous la nettoyez enfin, un clic la passe au{' '}
          <Term>vert avec le contour rouge</Term>. Elle compte alors dans les{' '}
          <Term>nettoyées</Term> — donc facturée à ELIOR, puisque le ménage a bien
          eu lieu — mais <Term>jamais dans les vendues</Term> : elle avait été
          vendue la veille, pas aujourd'hui. Elle cesse aussi de revenir les jours
          suivants.
        </p>
        <p>
          Une chambre ne roule pas indéfiniment : au-delà de sept jours, elle cesse
          d'être reportée automatiquement. Si un retard remonte à plus loin, il faut
          reposer le liseré à la main.
        </p>
      </Section>

      <Section title="Les compteurs du haut">
        <div
          className="pointer-events-none my-3 grid grid-cols-2 gap-2 select-none sm:grid-cols-3"
          aria-hidden="true"
        >
          {/* Balance : liseré gris neutre, valeur VERTE quand le compte est
              juste — exactement comme le board (la valeur n'est pas colorée par
              l'accent, cf. RaproBoard). */}
          <StatTile
            value={
              <span style={{ color: CATEGORY_COLOR.nettoyee }}>0</span>
            }
            label="Balance"
            accent={ACCENT.slate}
          />
          <StatTile value={38} label="Vendues" accent="#818cf8" />
          <StatTile
            value={35}
            label="Nettoyées"
            accent={CATEGORY_COLOR.nettoyee}
          />
        </div>
        <Caption>Exemple de chiffres, sur les six tuiles de la page.</Caption>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <Term>Balance</Term> : le contrôle de cohérence de la journée.
            Nettoyées + refus + bloquées du jour − bloquées de la veille doit
            retomber sur les vendues. Un <Term>0</Term> vert veut dire que le
            compte est juste ; sinon l'écart s'affiche en rouge, et il faut
            chercher la chambre oubliée.
          </li>
          <li>
            <Term>Vendues</Term> : chambres occupées ce jour, d'après le rooming.
            Base de tout le suivi.
          </li>
          <li>
            <Term>Nettoyées</Term> : ménages faits et facturés aujourd'hui, y
            compris les rattrapages de chambres bloquées les jours précédents.
            C'est ce total qui part en facturation.
          </li>
          <li>
            <Term>Refus</Term> : clients qui ont décliné le ménage.
          </li>
          <li>
            <Term>Bloquées du jour</Term> : chambres non nettoyées aujourd'hui,
            reportées à demain.
          </li>
          <li>
            <Term>Bloquées de la veille</Term> : chambres reportées d'un jour
            précédent, encore à traiter.
          </li>
        </ul>
      </Section>

      <Section title="Quand une source manque">
        <p>
          Deux bandeaux ambrés peuvent apparaître au-dessus de la grille. Ils ne
          bloquent pas la saisie, ils expliquent ce qui manque.
        </p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <Term>Rooming non importé</Term> : la page bascule en grille de
            secours, toutes les chambres sont considérées comme non vendues. Vous
            pouvez saisir les statuts à la main ; l'affichage normal revient dès
            l'import.
          </li>
          <li>
            <Term>Rapport comptable non importé</Term> : seul le contrôle
            d'occupation est indisponible, le reste fonctionne normalement.
          </li>
        </ul>
      </Section>

      <Section title="Clôturer la journée">
        <p>
          Une fois toutes les chambres traitées, le bouton en bas de page clôture le
          rapprochement. Vous saisissez le nom de l'hôtelier, puis la grille et le
          commentaire sont figés. La clôture enregistre définitivement les ménages
          faits pour le récap facturé à ELIOR : c'est à ce moment que les chambres
          nettoyées par défaut, celles que personne n'a touchées, sont réellement
          inscrites.
        </p>
        <p>
          Tant qu'un jour n'est pas clôturé, il <Term>n'apparaît pas</Term> dans
          l'analytique. Un mois qui semble vide est souvent un mois non clôturé.
        </p>
        <p>
          Un jour clôturé peut être rouvert si une correction s'impose. Les chambres
          restées bloquées à la clôture ne sont pas perdues : elles réapparaissent
          le lendemain avec leur contour rouge. L'impression de la feuille, elle,
          n'est possible qu'une fois le jour clôturé.
        </p>
        <p>
          La saisie et la clôture ne restent ouvertes que sur les trois derniers
          jours (aujourd'hui, la veille et l'avant-veille). Passé ce délai, un jour
          n'est plus modifiable, même s'il n'a pas été clôturé : sa correction est
          réservée à la gestion.
        </p>
      </Section>

      <Section title="Le contrôle d'occupation">
        <p>
          Si le nombre de chambres occupées d'après le rooming ne correspond pas au
          rapport comptable, un bandeau signale l'écart. C'est souvent une arrivée
          ou une annulation de dernière minute présente dans un seul des deux
          rapports, à vérifier.
        </p>
        <p>
          Les chambres gratuites sont retirées du calcul avant comparaison : si un
          écart s'affiche quand même, ce n'est pas une gratuité. L'écart est aussi
          rappelé dans la fenêtre de clôture, avant de figer la journée.
        </p>
      </Section>

      <Section title="Regarder le mois : l'analytique">
        <p>
          Le bouton courbe ouvre l'analytique du rapprochement. On y va pour suivre
          la charge de ménage sur la durée : combien de chambres vendues, combien
          réellement nettoyées et facturées, combien sont restées bloquées.
        </p>
        <p>
          <Term>La vue annuelle</Term> donne quatre cartes — <Term>Vendues</Term>,{' '}
          <Term>Nettoyées</Term>, <Term>Bloquées</Term> et <Term>Refus</Term> — un
          tableau mois par mois, et un histogramme empilé qui montre d'un coup
          d'œil la part de chaque situation. Les flèches font défiler les années ;
          dans le détail d'un mois, elles font défiler les mois.
        </p>
        <p>
          <Term>Cliquez sur un mois</Term>, dans le tableau ou sur une colonne du
          graphique, pour obtenir le détail jour par jour ; puis{' '}
          <Term>cliquez sur un jour</Term> pour revenir à la grille de ce matin-là.
        </p>
        <p>Trois points à connaître pour lire ces tableaux sans se tromper :</p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <Term>Seuls les jours clôturés comptent.</Term> Un jour laissé ouvert
            n'apparaît nulle part — ni dans les totaux, ni dans les moyennes. Comme
            la page affiche des zéros et jamais de tirets, un zéro peut vouloir
            dire « rien à nettoyer » aussi bien que « jour pas encore clôturé ».
            Dans le doute, ouvrez la journée.
          </li>
          <li>
            <Term>Nettoyées peut dépasser Vendues.</Term> Ce n'est pas une erreur :
            les rattrapages sont des ménages faits, donc facturés, sur des chambres
            qui n'ont pas été vendues ce jour-là. Ils comptent dans les nettoyées,
            jamais dans les vendues, sinon l'occupation serait comptée deux fois.
          </li>
          <li>
            <Term>Nettoyées, c'est ce qui part en facturation</Term> chez le
            prestataire : les ménages faits du jour plus les rattrapages. Les
            bloquées ne sont pas facturées, les refus non plus.
          </li>
        </ul>
      </Section>

      {/* Un clavier physique n'existe pas sur un écran tactile — section
          réservée au bureau (même seuil que le reste des contenus liés à la
          souris ci-dessus). */}
      <div className="hidden sm:block">
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
              Jour précédent ou suivant.
            </Shortcut>
            <Shortcut keys={<Kbd className="px-2">Alt</Kbd>}>
              Revenir à aujourd'hui.
            </Shortcut>
            <Shortcut
              keys={
                <>
                  <Kbd className="px-2">Ctrl</Kbd>
                  <KbdPlus />
                  <Kbd>P</Kbd>
                </>
              }
            >
              Imprimer la feuille, une fois le rapprochement clôturé.
            </Shortcut>
          </div>
        </Section>
      </div>
    </div>
  )
}
