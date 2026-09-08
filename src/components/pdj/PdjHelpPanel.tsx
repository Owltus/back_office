import type { ReactNode } from 'react'

import { MouseGlyph } from '#/components/parking/MouseGlyph.tsx'
import { Kbd, KbdArrow, KbdPlus, Shortcut } from '#/components/shared/Kbd.tsx'
import { cn } from '#/lib/utils.ts'

/*
 * Contenu du modal d'aide du Petit-déjeuner (bouton « ? » de la barre d'actions).
 * Tutoriel FACTUEL pour un nouvel utilisateur : à quoi sert la page, d'où viennent
 * les données, comment lire une ligne, ce que fait chaque geste, le sens de chaque
 * couleur de case, comment les montants sont calculés, et ce qu'on va chercher
 * dans l'analytique. Purement descriptif — aucune donnée, aucun état : c'est de la
 * documentation intégrée, même forme que `RaproHelpPanel` et `ParkingHelpPanel`.
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

/** Terme mis en avant dans une phrase (même graisse que les autres panneaux). */
function Term({ children }: { children: ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>
}

/** Une ligne de légende : la VRAIE case du tableau (mêmes classes que
 *  `GuestRow`, pour que la légende ne puisse pas dériver du rendu) + son sens. */
function BoxRow({
  box,
  name,
  children,
}: {
  box: string
  name: string
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={cn('mt-1 size-3.5 shrink-0 rounded-[3px]', box)}
        aria-hidden="true"
      />
      <span>
        <Term>{name}</Term> {children}
      </span>
    </div>
  )
}

export function PdjHelpPanel() {
  return (
    <div className="space-y-6">
      <Section title="À quoi sert cette page">
        <p>
          Elle sert à pointer les petits-déjeuners, chambre par chambre. Le matin,
          vous cochez une case chaque fois qu'un client se présente. La page vous
          dit qui a droit à quoi, compte les couverts servis, et en déduit le
          chiffre d'affaires de la journée.
        </p>
        <p>
          Une seule journée est affichée à la fois. Les flèches en haut à droite
          permettent de revenir sur les jours précédents.
        </p>
      </Section>

      <Section title="D'où viennent les données">
        <p>
          Vous ne saisissez jamais la liste des clients : elle arrive
          automatiquement du PMS, vers 2 h 30 chaque nuit, sous forme de deux
          rapports.
        </p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <Term>In-House Guests</Term> : la liste des chambres occupées, avec le
            nom du client, le nombre de personnes et le tarif. C'est lui qui
            remplit le tableau et qui dit quelles chambres ont un petit-déjeuner
            inclus.
          </li>
          <li>
            <Term>Addon Production</Term> : le récapitulatif comptable des
            petits-déjeuners facturés, par code produit et en chiffre d'affaires.
            C'est lui qui donne les prix (voir plus bas).
          </li>
        </ul>
        <p>
          Une subtilité de date à connaître : ces rapports sont datés du{' '}
          <Term>jour de clôture</Term>, c'est-à-dire de la nuit. Le petit-déjeuner,
          lui, est servi le lendemain matin. La page range donc toujours la journée
          sous le jour où les clients mangent — le rapport de la nuit du 8 au 9
          s'affiche au 9.
        </p>
        <p>
          Si le PMS n'a rien transmis, un bandeau le signale et l'import manuel
          s'ouvre à partir de 3 h : le fichier peut alors être déposé à la main
          (glisser-déposer, ou le bouton d'import), pour ne pas rester sans
          feuille.
        </p>
      </Section>

      <Section title="Lire une ligne du tableau">
        <p>
          Il y a un tableau par étage, et une ligne par chambre — même les chambres
          vides, en gris pâle, pour garder le plan complet de l'hôtel.
        </p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <Term>Le fond vert</Term> signale une chambre dont le petit-déjeuner
            est <Term>inclus</Term> dans le tarif de la réservation. C'est le repère
            le plus utile : ces clients ne paient rien au comptoir.
          </li>
          <li>
            <Term>La flèche</Term> après le nom dit la suite du séjour : rouge vers
            le haut, le client part aujourd'hui ; bleue vers le bas, il reste une
            nuit de plus.
          </li>
          <li>
            <Term>L'étoile</Term> devant un nom signale un client VIP.
          </li>
          <li>
            <Term>Le chiffre</Term> de la colonne suivante est le nombre de séjours
            du client chez nous — il n'apparaît qu'à partir de la deuxième visite.
          </li>
        </ul>
        <p>
          Les noms ne sont conservés que pour aujourd'hui et la veille. Au-delà,
          ils sont automatiquement effacés : les chiffres restent, les personnes
          disparaissent. C'est une obligation de protection des données, pas un
          bug.
        </p>
      </Section>

      <Section title="Les cases à cocher">
        <p>
          Chaque ligne porte au minimum deux cases. Leur <Term>contour</Term> dit
          ce qu'on attend de la chambre, avant même d'avoir coché quoi que ce soit.
        </p>
        <BoxRow box="border-2 border-foreground/70" name="Contour plein et épais :">
          un couvert attendu. Pour une chambre à petit-déjeuner inclus, c'est le
          nombre de petits-déjeuners dus, tel que facturé. Pour une chambre sans
          petit-déjeuner inclus, ce sont les clients présents — à qui on peut
          toujours vendre un petit-déjeuner.
        </BoxRow>
        <BoxRow
          box="border border-dashed border-muted-foreground/40"
          name="Contour fin en pointillés :"
        >
          une place supplémentaire, au-delà de ce qui était attendu. Elle se coche
          à la main pour un couvert en plus, mais le double-clic ne la remplit
          jamais.
        </BoxRow>
        <p>
          Le nombre de cases attendues n'est jamais inventé : il vient du tarif de
          la réservation (le « 2 PAX » du plan tarifaire), borné au nombre réel
          d'occupants, et plafonné à deux. Un enfant payant compte ; deux cases ne
          peuvent pas apparaître pour une personne seule.
        </p>
      </Section>

      <Section title="Cocher, corriger, offrir">
        <div className="hidden pointer-fine:block">
          <div className="space-y-2">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0">
                <MouseGlyph side="left" />
              </span>
              <span>
                <Term>Clic gauche</Term> sur une case : le petit-déjeuner est
                servi. Un clic sur la dernière case cochée annule. Les cases se
                remplissent de gauche à droite, comme un curseur.
              </span>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0">
                <MouseGlyph side="right" />
              </span>
              <span>
                <Term>Clic droit</Term> sur une case : le petit-déjeuner est{' '}
                <Term>offert</Term> (geste commercial). Il compte comme servi, mais
                n'est pas facturé. Réservé aux chambres sans petit-déjeuner inclus
                — une chambre dont le petit-déjeuner est déjà dû n'a rien à
                offrir. Un second clic droit sur la même case retire la gratuité.
              </span>
            </div>
            <p>
              <Term>Double-clic sur la ligne</Term> : sert d'un coup tous les
              couverts attendus, ou les annule tous s'ils l'étaient déjà.
            </p>
          </div>
        </div>
        <div className="pointer-fine:hidden">
          <p>
            <Term>Appui sur une case</Term> : le petit-déjeuner est servi. Un appui
            sur la dernière case cochée annule. Les cases se remplissent de gauche
            à droite.
          </p>
          <p>
            <Term>Double appui sur la ligne</Term> : sert d'un coup tous les
            couverts attendus, ou les annule tous s'ils l'étaient déjà.
          </p>
          <p>
            Marquer <Term>offert</Term> un petit-déjeuner servi en chambre demande
            un clic droit : ce geste n'existe pas au doigt. Sur une chambre vide,
            en revanche, le sélecteur de la ligne manuelle propose « Offert » (voir
            plus bas).
          </p>
        </div>
        <p>
          Chaque coche est enregistrée immédiatement, et apparaît en direct sur les
          autres écrans ouverts sur la même journée. Rien n'est à valider.
        </p>
      </Section>

      <Section title="Les couleurs des cases cochées">
        <BoxRow
          box="border-2 border-emerald-500 bg-emerald-500"
          name="Verte, petit-déjeuner inclus."
        >
          Il était dû au titre de la réservation. Il est facturé de toute façon.
        </BoxRow>
        <BoxRow
          box="border-2 border-amber-400 bg-amber-400"
          name="Ambre, petit-déjeuner extra."
        >
          Servi au-delà de ce qui était inclus. Il est facturé en plus, au tarif
          normal.
        </BoxRow>
        <BoxRow
          box="border-2 border-purple-400 bg-purple-400"
          name="Violette, petit-déjeuner offert."
        >
          Servi, compté dans les couverts et dans le taux de captage, mais à 0 €.
        </BoxRow>
        <p>
          Ces trois mêmes couleurs se retrouvent sur la feuille imprimée et sur
          les compteurs récapitulatifs : vert pour le dû, ambre pour l'extra
          facturé, violet pour le gratuit.
        </p>
      </Section>

      <Section title="Servir une chambre qui n'est pas dans la liste">
        <p>
          Une chambre vide peut quand même recevoir un petit-déjeuner : un
          day-use, un client attendu que le rapport n'a pas encore vu, un arrangement
          particulier. Cochez simplement une case sur sa ligne : une ligne de saisie
          manuelle est créée.
        </p>
        <p>
          En survolant cette ligne, un petit sélecteur apparaît pour dire de quoi il
          s'agit :
        </p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <Term>Extra</Term> : un petit-déjeuner vendu (le choix par défaut).
          </li>
          <li>
            <Term>Inclus</Term> : il était compris dans la prestation, donc compté
            comme un dû facturé.
          </li>
          <li>
            <Term>Offert</Term> : gratuit, toute la ligne passe en violet.
          </li>
        </ul>
        <p>
          Décochez toutes ses cases et la ligne manuelle disparaît, la chambre
          redevient vide.
        </p>
      </Section>

      <Section title="Les clients qui ne dorment pas à l'hôtel">
        <p>
          Le bouton <Term>Externe</Term> ouvre un compteur simple pour les
          personnes venues manger sans être logées. Elles n'ont pas de chambre,
          donc pas de ligne dans le tableau : seul ce compteur les recense.
        </p>
        <p>
          Elles sont comptées comme des petits-déjeuners extra, au tarif normal, et
          se retrouvent dans la carte <Term>PDJ Extra + Externe</Term> ainsi que
          dans le chiffre d'affaires du jour.
        </p>
      </Section>

      <Section title="Les compteurs de la journée">
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <Term>Chambres occupées</Term> : les chambres présentes dans le rapport
            du jour, qu'elles aient un petit-déjeuner ou non.
          </li>
          <li>
            <Term>Clients</Term> : le nombre de personnes logées, toutes chambres
            confondues.
          </li>
          <li>
            <Term>PDJ inclus</Term> : les petits-déjeuners dus, compris dans les
            tarifs. Ils sont facturés même si personne ne descend, donc ce chiffre
            ne bouge pas quand vous cochez.
          </li>
          <li>
            <Term>PDJ Extra</Term> : les couverts servis au-delà des inclus. Dès
            qu'un externe est saisi, la carte se lit{' '}
            <Term>PDJ Extra + Externe</Term> et détaille les deux (par exemple
            « 3 + 1 »).
          </li>
          <li>
            <Term>CA PDJ</Term> : le chiffre d'affaires hors taxes de la journée
            (voir le calcul juste en dessous).
          </li>
          <li>
            <Term>Taux de captage</Term> : la part des clients logés qui ont
            effectivement pris un petit-déjeuner — les inclus dus plus les extras,
            divisés par le nombre de clients. Un tiret s'affiche tant qu'il n'y a
            pas de client à comparer.
          </li>
        </ul>
        <p>
          Sous chaque compteur, la petite ligne grise donne la{' '}
          <Term>moyenne par jour</Term> sur tout l'historique : elle sert de repère
          pour savoir si la journée est ordinaire ou non.
        </p>
      </Section>

      <Section title="Comment les prix sont calculés">
        <p>
          Aucun prix n'est écrit en dur dans l'application. Le tarif unitaire est{' '}
          <Term>déduit de l'Addon Production</Term> : le chiffre d'affaires d'un
          code est toujours un multiple de son prix unitaire, il suffit donc de
          chercher le plus grand montant qui explique la majorité des recettes. Si
          le prix du petit-déjeuner change demain, la page suit toute seule.
        </p>
        <p>
          Chaque chambre porte un <Term>code</Term> lu dans son tarif :{' '}
          <Term>PDJ</Term> (le petit-déjeuner normal), <Term>PDJBB</Term> (le
          tarif chambre et petit-déjeuner) ou <Term>PDJGROUP10</Term> (les
          groupes). Chaque code a son prix.
        </p>
        <p>Le chiffre d'affaires de la journée s'obtient alors ainsi :</p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            les <Term>inclus</Term> comptent au tarif de leur propre code, dès
            qu'ils sont dus — cochés ou non, ils sont facturés ;
          </li>
          <li>
            les <Term>extras</Term> et les <Term>externes</Term> comptent au tarif
            du petit-déjeuner normal ;
          </li>
          <li>
            les <Term>offerts</Term> sont retirés du calcul : ils restent des
            couverts servis, mais valent 0 € ;
          </li>
          <li>
            chaque montant est converti hors taxes en divisant par 1,10 (la TVA de
            la restauration est à 10 %).
          </li>
        </ul>
        <p>
          Un groupe facturé en bloc par le PMS, sans être rattaché à une chambre,
          n'entre pas dans ce chiffre d'affaires : la page ne compte que ce qui est
          réellement posé sur une chambre, plus les externes.
        </p>
        <p>
          Si un écart apparaît entre les chambres et la facturation comptable, ou si
          un tarif n'a pas pu être détecté, la page le signale : c'est en général le
          signe d'un décalage de date entre les deux rapports.
        </p>
      </Section>

      <Section title="La vue « détail financier »">
        <p>
          La bascule en haut à droite du tableau remplace, pour chaque ligne, le nom
          du client par l'origine de la réservation, la flèche par le code
          petit-déjeuner, et le nombre de visites par le montant hors taxes facturé
          à la chambre.
        </p>
        <p>
          Une chambre sans petit-déjeuner affiche un tiret. Une chambre dont le
          petit-déjeuner est offert affiche bien « 0,00 € » : c'est un
          petit-déjeuner, il vaut zéro, ce n'est pas la même chose que rien.
        </p>
        <p>
          Cette vue reste à l'écran : la feuille imprimée garde toujours les noms,
          puisqu'elle sert à accueillir les clients.
        </p>
      </Section>

      <Section title="Imprimer la feuille du service">
        <p>
          Le bouton d'impression produit la feuille A4 du matin : un tableau par
          étage, avec les cases à cocher au stylo et les compteurs en pied de page.
          Les cases déjà cochées à l'écran sont pré-remplies, les autres restent à
          faire à la main.
        </p>
        <p>
          Le pied de page comporte aussi trois cases « € » à remplir : elles
          reprennent les montants du jour quand ils sont connus.
        </p>
      </Section>

      <Section title="Regarder le mois : l'analytique">
        <p>
          Le bouton graphique ouvre l'analytique du petit-déjeuner. On y va pour
          répondre aux questions qui dépassent la journée : combien de
          couverts ce mois-ci, quel chiffre d'affaires, quels jours ont décroché.
        </p>
        <p>
          <Term>La vue annuelle</Term> résume l'année en six cartes —{' '}
          <Term>Inclus</Term>, <Term>Servis</Term>, <Term>Extra</Term>,{' '}
          <Term>Non servis</Term>, <Term>CA</Term> et <Term>Captage</Term> — chacune
          avec sa moyenne par jour. En dessous, un tableau donne les mêmes chiffres
          mois par mois, et un histogramme les met en image. Les flèches font
          défiler les années.
        </p>
        <p>
          <Term>Cliquez sur un mois</Term>, dans le tableau ou dans le graphique,
          et vous obtenez le détail jour par jour. De là,{' '}
          <Term>cliquez sur un jour</Term> pour revenir directement à la feuille de
          service de ce matin-là. C'est le chemin normal quand un chiffre du mois
          vous étonne : descendez jusqu'à la journée qui l'explique.
        </p>
        <p>
          Quatre points à connaître pour lire ces tableaux sans se tromper :
        </p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <Term>Un tiret n'est pas un zéro.</Term> Il signale une journée dont la
            consommation n'a jamais été saisie. Impossible de dire si personne n'est
            descendu ou si personne n'a coché : la page refuse donc d'inventer un
            zéro, et ce jour ne pèse pas dans les moyennes.
          </li>
          <li>
            <Term>Dans le tableau, la colonne « Servis » ne compte pas les
            extras</Term> — ils ont leur propre colonne juste à côté. La carte
            « Servis » du haut, elle, donne le total complet, extras compris. Ne les
            additionnez pas.
          </li>
          <li>
            <Term>Une barre verte « Inclus (non saisi) »</Term> dans le graphique
            n'est pas un service réussi : c'est ce qui était attendu ce jour-là,
            affiché faute de pointage.
          </li>
          <li>
            <Term>Les petits-déjeuners offerts</Term> comptent dans les extras mais
            pas dans le chiffre d'affaires : beaucoup d'extras pour peu de recette,
            c'est normal si la journée a été généreuse.
          </li>
        </ul>
        <p>
          Sur le graphique du mois, une fine ligne rouge horizontale marque le
          volume à partir duquel, historiquement, la proportion de clients qui ne
          descendent pas change nettement. C'est un repère de charge, calculé sur
          tout l'historique : les jours qui la dépassent ont leur numéro en rouge.
        </p>
        <p>
          Enfin, l'analytique est l'endroit où la gestion dépose un{' '}
          <Term>Addon Production</Term> couvrant plusieurs jours d'un coup, quand
          il faut rattraper l'historique des montants.
        </p>
      </Section>

      <Section title="Jusqu'à quand peut-on saisir">
        <p>
          La saisie reste ouverte sur les quatre derniers jours : aujourd'hui et les
          trois jours précédents. Au-delà, la journée passe en lecture seule — les
          chiffres sont consultables, les cases ne bougent plus. Seule la gestion
          peut corriger un jour plus ancien.
        </p>
        <p>
          Si une case refuse de rester cochée, c'est cette règle qui s'applique : un
          message le dit explicitement plutôt que de laisser la case rebondir sans
          raison.
        </p>
      </Section>

      {/* Un clavier physique n'existe pas sur un écran tactile — section
          réservée au bureau, comme sur les autres panneaux d'aide. */}
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
              Imprimer la feuille du jour affiché.
            </Shortcut>
          </div>
        </Section>
      </div>
    </div>
  )
}
