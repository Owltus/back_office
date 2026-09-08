import type { ReactNode } from 'react'

import {
  AmountRow,
  AmountsThead,
  CautionRow,
  DenomCell,
  EcartsRow,
} from '#/components/caisse/CaisseSheetParts.tsx'
import { MouseGlyph } from '#/components/parking/MouseGlyph.tsx'
import { Kbd, KbdArrow, KbdPlus, Shortcut } from '#/components/shared/Kbd.tsx'
import { LockBadge } from '#/components/shared/LockBadge.tsx'
import { DENOMINATIONS } from '#/lib/caisse/constants.ts'
import type { Caution, EcartKey } from '#/lib/caisse/types.ts'

/*
 * Contenu du modal d'aide de la Caisse (bouton « ? » de la barre d'actions).
 * Tutoriel FACTUEL pour un nouvel utilisateur : à quoi sert la feuille, comment
 * elle se remplit, comment se lisent les écarts, ce que sont les cautions, ce
 * que clôturer veut dire. Purement descriptif — aucune donnée, aucun état.
 * Même présentation que les modes d'emploi du petit-déjeuner, du parking et du
 * rapprochement.
 *
 * Les exemples sont rendus par les VRAIS composants de la feuille
 * (`CaisseSheetParts`, ceux de la page) : une capture redessinée à la main
 * finirait par mentir sur ce que la page affiche.
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

/** Légende sous un exemple : la phrase qui dit quoi regarder. */
function Caption({ children }: { children: ReactNode }) {
  return <p className="text-xs italic">{children}</p>
}

/* --------------------------------------------------------------------------
 * Exemples ILLUSTRÉS. Les composants sont rendus avec `disabled={false}` et
 * l'ensemble est neutralisé par `pointer-events-none` : passer `disabled`
 * appliquerait `opacity-50` aux champs et `opacity-30` aux boutons ±, ce qui
 * ternirait la vitrine et fausserait la légende. La seule exception est la
 * démonstration voulue de l'état figé, où les deux sont montrés côte à côte.
 * ------------------------------------------------------------------------ */

/** Enveloppe inerte commune aux vitrines. */
function Demo({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none my-3 select-none" aria-hidden="true">
      {children}
    </div>
  )
}

/** Le tableau des montants de la page, avec les valeurs qu'on lui passe. */
function DemoAmounts({
  cols,
  snt,
  ls,
  depot,
}: {
  cols: EcartKey[]
  snt: Record<string, number>
  ls: Record<string, number>
  depot: Record<string, number>
}) {
  const expectedOf = (c: EcartKey) =>
    c === 'web' ? (snt[c] ?? 0) : (snt[c] ?? 0) + (ls[c] ?? 0)
  const ecarts = Object.fromEntries(
    cols.map((c) => [c, expectedOf(c) - (depot[c] ?? 0)]),
  ) as Record<EcartKey, number>
  return (
    <Demo>
      <div className="caisse-table overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <AmountsThead cols={cols} />
          </thead>
          <tbody>
            <AmountRow
              label="STAY N' TOUCH"
              rowIndex={0}
              cols={cols}
              disabled={false}
              allowNegative
              value={(c) => snt[c] ?? 0}
              onChange={() => {}}
            />
            <AmountRow
              label="LIGHTSPEED"
              rowIndex={1}
              cols={cols}
              disabled={false}
              value={(c) => (c === 'web' ? null : (ls[c] ?? 0))}
              onChange={() => {}}
            />
            <AmountRow
              label="DÉPÔT"
              rowIndex={2}
              cols={cols}
              disabled={false}
              value={(c) => depot[c] ?? 0}
              onChange={() => {}}
            />
            <EcartsRow cols={cols} ecarts={ecarts} expectedOf={expectedOf} />
          </tbody>
        </table>
      </div>
    </Demo>
  )
}

/** Une caution d'exemple. */
function demoCaution(over: Partial<Caution> & { room: number }): Caution {
  return {
    id: `demo-${over.room}`,
    amount: 150,
    comment: '',
    takenDate: '2026-09-06',
    status: 'active',
    refundedDate: null,
    createdBy: '',
    createdAt: '',
    ...over,
  }
}

const DENOM = Object.fromEntries(DENOMINATIONS.map((d) => [d.key, d]))

export function CaisseHelpPanel() {
  return (
    <div className="space-y-6">
      <Section title="À quoi sert cette page">
        <p>
          La feuille de caisse compare, pour un service, ce que le logiciel dit
          avoir encaissé et ce que vous comptez réellement dans le tiroir. Elle
          sert à repérer tout de suite un écart, à en garder la trace écrite, et à
          transmettre une caisse juste au service suivant.
        </p>
        <p>
          Une feuille par <Term>date</Term> et par <Term>service</Term>. Il y en a
          trois par jour : <Term>matin</Term> (12 h → 21 h), <Term>soir</Term>{' '}
          (21 h → 2 h) et <Term>nuit</Term> (2 h → 12 h). La feuille appartient à
          la journée du service, pas à l'heure où vous la remplissez : la nuit du
          lundi se saisit le mardi matin mais reste datée du lundi.
        </p>
        <p>
          En arrivant, la page ouvre d'elle-même le service en cours, ou le
          suivant s'il est déjà clôturé. Elle ne revient jamais en arrière toute
          seule : un service oublié se retrouve avec les flèches.
        </p>
      </Section>

      <Section title="Le tableau des montants">
        <p>
          Trois lignes, une colonne par moyen de paiement. Les deux premières
          disent ce qui <Term>devrait</Term> être là, la troisième ce que vous{' '}
          <Term>comptez</Term>.
        </p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <Term>Stay N' Touch</Term> : les encaissements de la réception. Seule
            ligne où un montant négatif est accepté, pour un remboursement ou une
            correction.
          </li>
          <li>
            <Term>Lightspeed</Term> : ceux du club. Cette ligne n'a pas de colonne
            web, d'où le tiret.
          </li>
          <li>
            <Term>Dépôt</Term> : ce que vous avez réellement compté et déposé.
            C'est la seule ligne que vous remplissez d'après le tiroir.
          </li>
        </ul>
        <DemoAmounts
          cols={['cash', 'cb', 'cvac', 'web']}
          snt={{ cash: 320, cb: 1240.5, cvac: 60, web: 180 }}
          ls={{ cash: 45, cb: 210, cvac: 0 }}
          depot={{ cash: 365, cb: 1450.5, cvac: 60, web: 180 }}
        />
        <Caption>
          Ici tout tombe juste : la ligne <Term>ÉCARTS</Term> affiche 0,00 € en
          vert dans chaque colonne. La colonne « Carte web / Adyen » n'apparaît
          que le matin et le soir — la nuit, il n'y a pas de paiement web à
          rapprocher.
        </Caption>
        <p>
          Un <Term>double-clic</Term> sur une case de la ligne Dépôt y recopie la
          somme attendue de la colonne : pratique quand le compte tombe juste, et
          ça évite une faute de frappe.
        </p>
      </Section>

      <Section title="Lire un écart">
        <p>
          L'écart, c'est l'attendu moins le compté. Il vise zéro. La ligne se
          colore en vert quand c'est le cas, en rouge sinon.
        </p>
        <DemoAmounts
          cols={['cash', 'cb', 'cvac', 'web']}
          snt={{ cash: 320, cb: 1240.5, cvac: 60, web: 180 }}
          ls={{ cash: 45, cb: 210, cvac: 0 }}
          depot={{ cash: 345, cb: 1465.5, cvac: 60, web: 180 }}
        />
        <Caption>
          Deux anomalies ici. En espèces, <Term>+20,00 €</Term> : il{' '}
          <Term>manque</Term> vingt euros dans le tiroir. En carte bancaire,{' '}
          <Term>−15,00 €</Term> : il y en a quinze <Term>de trop</Term>.
        </Caption>
        <p>
          Attention à ce point, c'est le plus contre-intuitif de la page : un
          manque et un excédent ont <Term>exactement la même couleur</Term>. Seul
          le signe les distingue. Un écart positif veut dire qu'il manque de
          l'argent ; un écart négatif, qu'il y en a plus que prévu.
        </p>
        <p>
          Survolez une case de la ligne ÉCARTS sur la page : l'infobulle rappelle
          le montant attendu de la colonne.
        </p>
      </Section>

      <Section title="Compter le fond de caisse">
        <p>
          En dessous, une grille reprend chaque coupure, du billet de 500 € à la
          pièce d'un centime. Saisissez le nombre d'exemplaires, ou utilisez les
          boutons − et + de part et d'autre. La case s'éclaire dès qu'elle porte
          un compte, et affiche son sous-total.
        </p>
        <Demo>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <DenomCell
              denom={DENOM.cnt_50}
              count={3}
              disabled={false}
              onChange={() => {}}
              onBump={() => {}}
            />
            <DenomCell
              denom={DENOM.cnt_20}
              count={5}
              disabled={false}
              onChange={() => {}}
              onBump={() => {}}
            />
            <DenomCell
              denom={DENOM.cnt_2}
              count={0}
              disabled={false}
              onChange={() => {}}
              onBump={() => {}}
            />
          </div>
        </Demo>
        <Caption>
          Trois coupures sur les quinze de la page : trois billets de 50 € et cinq
          de 20 € comptés, les pièces de 2 € encore à zéro — leur visuel reste
          estompé tant que rien n'est saisi.
        </Caption>
        <p>
          Sous la grille, le total compté est comparé au fond attendu :{' '}
          <Term>150 €</Term>, plus le montant des cautions en cours. Là encore,
          vert si le compte tombe juste, rouge sinon.
        </p>
        <p>
          Une feuille neuve reprend le comptage du dernier service qui a
          réellement compté : vous n'avez qu'à corriger ce qui a changé. Un
          service sauté est ignoré, pas recopié.
        </p>
      </Section>

      <Section title="Les cautions">
        <p>
          Une caution est un dépôt en espèces pris à un client, gardé en enveloppe
          scellée et rendu plus tard. Elle dort dans le tiroir sans appartenir à
          la recette : elle est donc ajoutée <Term>à la fois</Term> au total
          compté et au fond attendu, faute de quoi la caisse semblerait
          excédentaire tous les jours.
        </p>
        <Demo>
          <ul className="space-y-2">
            <CautionRow
              caution={demoCaution({
                room: 114,
                amount: 200,
                comment: 'Séminaire, restitution au départ',
              })}
            />
            <CautionRow
              caution={demoCaution({
                room: 112,
                amount: 150,
                comment: '',
                status: 'refunded',
                refundedDate: '2026-09-09',
              })}
            />
          </ul>
        </Demo>
        <Caption>
          Une caution en cours et une rendue le jour même. Le montant est mis en
          évidence, le commentaire affiche un tiret quand il n'y en a pas.
        </Caption>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            Le bouton <Term>Caution</Term>, en haut, ouvre la prise d'une nouvelle
            caution : chambre, montant, commentaire facultatif. Elle est datée du
            jour affiché, jamais d'un jour à venir.
          </li>
          <li>
            <Term>Clic droit sur la ligne</Term>, ou le bouton à trois points,
            pour agir : rembourser, modifier, remettre en cours, supprimer.
          </li>
          <li>
            Une caution rendue <Term>cesse de compter le jour même</Term> du
            remboursement. Elle reste visible ce jour-là, pour pouvoir corriger une
            erreur, puis disparaît de la liste.
          </li>
          <li>
            Remettre en cours n'est proposé que le jour du remboursement, et la
            supprimer n'est possible que le jour où elle a été prise — au-delà,
            c'est réservé à la gestion.
          </li>
        </ul>
        <p>
          Une caution ajoutée après coup corrige d'elle-même le fond attendu des
          feuilles concernées, même déjà clôturées : rien n'est à réécrire.
        </p>
      </Section>

      <Section title="Enregistrer, clôturer, rouvrir">
        <p>
          Il n'y a <Term>pas de bouton Enregistrer</Term> : chaque saisie part
          toute seule, une fraction de seconde après la dernière frappe. Seul un
          échec vous est signalé.
        </p>
        <div
          className="pointer-events-none my-3 flex flex-wrap gap-2 select-none"
          aria-hidden="true"
        >
          <LockBadge
            locked={false}
            label="Ouverte"
            hint="Saisie en cours, enregistrée automatiquement."
          />
          <LockBadge
            locked
            label="Clôturée"
            hint="Montants figés. Réouvrez la feuille pour les modifier."
          />
        </div>
        <Caption>
          Le badge en haut de page dit dans quel état se trouve la feuille
          affichée.
        </Caption>
        <p>
          Le bouton en bas de page clôture le service. Une fenêtre récapitule
          d'abord les anomalies — chaque écart, et le fond s'il ne tombe pas
          juste — puis demande le nom de l'hôtelier. Un écart{' '}
          <Term>n'empêche jamais</Term> de clôturer : il demande seulement d'être
          justifié dans le commentaire.
        </p>
        <p>
          Une feuille clôturée est figée pour tout le monde. La rouvrir est
          possible le jour même et la veille ; au-delà, le bouton affiche{' '}
          <Term>Verrouillé</Term> et seule la gestion peut intervenir. C'est la
          même règle pour la saisie : dès l'avant-veille, plus rien ne se modifie,
          même sur une feuille restée ouverte.
        </p>
      </Section>

      <Section title="Imprimer et faire contresigner">
        <p>
          L'impression n'est possible qu'une fois la feuille clôturée. Le document
          reprend le tableau des montants, les écarts, le détail du fond avec les
          visuels des billets et des pièces, les cautions en cours et le
          commentaire.
        </p>
        <p>
          Il porte deux cadres de signature. La contre-signature se fait{' '}
          <Term>au stylo sur le papier</Term> : l'application n'en conserve rien.
        </p>
      </Section>

      <div className="hidden pointer-fine:block">
        <Section title="Deux gestes utiles à la souris">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0">
              <MouseGlyph side="left" />
            </span>
            <span>
              <Term>Double-clic</Term> sur une case de la ligne Dépôt : y recopie
              la somme attendue de la colonne.
            </span>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0">
              <MouseGlyph side="right" />
            </span>
            <span>
              <Term>Clic droit</Term> sur une caution : ouvre son menu
              (rembourser, modifier, supprimer).
            </span>
          </div>
        </Section>
      </div>

      {/* Un clavier physique n'existe pas sur un écran tactile — section
          réservée au bureau, même convention que les autres panneaux. */}
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
              Service précédent ou suivant.
            </Shortcut>
            <Shortcut keys={<Kbd className="px-2">Alt</Kbd>}>
              Revenir au service en cours.
            </Shortcut>
            <Shortcut keys={<Kbd className="px-3">Tab</Kbd>}>
              Passer au champ suivant. La tabulation boucle dans la carte où vous
              êtes : colonne par colonne dans le tableau des montants, coupure
              après coupure dans le fond.
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
              Imprimer la feuille, une fois la caisse clôturée.
            </Shortcut>
          </div>
        </Section>
      </div>

      <Section title="Regarder le mois : l'analytique">
        <p>
          Le bouton courbe ouvre l'analytique de la caisse. On y suit les
          encaissements sur la durée, et la fréquence des écarts.
        </p>
        <p>
          <Term>La vue annuelle</Term> donne quatre cartes —{' '}
          <Term>Total encaissé</Term>, <Term>Espèces</Term>, <Term>Carte</Term> et{' '}
          <Term>Écarts</Term> — un tableau mois par mois et une courbe des
          encaissements. <Term>Cliquez sur un mois</Term> pour le détail jour par
          jour, puis <Term>sur un jour</Term> pour revenir à la feuille
          correspondante.
        </p>
        <p>Quatre points à connaître pour lire ces chiffres sans se tromper :</p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <Term>La carte « Écarts » compte des feuilles, pas des euros.</Term>{' '}
            Elle dit combien de feuilles présentaient une anomalie, jamais le
            montant en jeu. Pour savoir ce qui a divergé, il faut ouvrir la
            journée.
          </li>
          <li>
            <Term>Seules les feuilles clôturées sont comptées.</Term> Une feuille
            laissée ouverte est invisible dans l'analytique : un mois qui semble
            vide est souvent un mois mal clôturé, et un tiret n'est pas un zéro.
          </li>
          <li>
            <Term>Une ligne agrège jusqu'à trois services.</Term> Le chiffre d'un
            jour n'est pas celui d'un service.
          </li>
          <li>
            <Term>La carte « Carte » cumule le TPE et Adyen</Term>, alors que le
            tableau les sépare. N'additionnez pas les deux lectures.
          </li>
        </ul>
        <p>
          Les montants affichés sont ceux que vous avez <Term>comptés</Term>, pas
          les attendus. Le fond de caisse et le détail des écarts, eux, ne
          remontent pas dans l'analytique : ils se lisent sur la feuille du jour.
        </p>
      </Section>
    </div>
  )
}
