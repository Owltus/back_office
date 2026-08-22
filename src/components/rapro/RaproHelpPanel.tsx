import type { ReactNode } from 'react'

import { MouseGlyph } from '#/components/rapro/MouseGlyph.tsx'
import { Kbd, KbdArrow, KbdPlus, Shortcut } from '#/components/shared/Kbd.tsx'

/*
 * Contenu du modal d'aide du Rapprochement (bouton « ? » de la barre d'actions).
 * Tutoriel FACTUEL pour un nouvel utilisateur : à quoi sert la page, comment lire
 * la grille, ce que font les deux gestes de la souris, le sens de chaque couleur
 * et de chaque compteur, la clôture. Purement descriptif — aucune donnée, aucun
 * état : c'est de la documentation intégrée, l'équivalent du « Détail des calculs »
 * de RepJour (`KPIDetailPanel`).
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

/** Une ligne de légende : pastille de couleur (+ liseré optionnel) et texte. */
function ColorRow({
  mod,
  carried,
  name,
  children,
}: {
  mod?: string
  carried?: boolean
  name: string
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={
          carried
            ? 'rapro-legend-carried mt-0.5 shrink-0'
            : `rapro-legend-dot ${mod} mt-0.5 shrink-0`
        }
        aria-hidden="true"
      />
      <span>
        <span className="font-medium text-foreground">{name}</span> {children}
      </span>
    </div>
  )
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
      </Section>

      <Section title="Les couleurs">
        <ColorRow mod="is-clean" name="Verte, nettoyée.">
          La chambre a été faite. Elle est facturée à ELIOR. C'est aussi l'état par
          défaut d'une chambre vendue, même sans clic.
        </ColorRow>
        <ColorRow mod="is-empty" name="Grise, non vendue.">
          Personne n'a dormi dans la chambre cette nuit. Il n'y a rien à y faire.
        </ColorRow>
        <ColorRow mod="is-todo" name="Rouge, bloquée du jour.">
          La chambre a été occupée mais pas nettoyée aujourd'hui. Elle reste due et
          réapparaîtra demain (report).
        </ColorRow>
        <ColorRow mod="is-refus" name="Ambre, refus.">
          Le client en séjour a refusé le ménage. Rien à faire, et ce n'est pas
          facturé.
        </ColorRow>
        <ColorRow carried name="Contour rouge, bloquée de la veille.">
          Un liseré rouge autour de la case signale une chambre bloquée un jour
          précédent, pas encore soldée. Il s'ajoute par-dessus la couleur du jour
          et reste tant que la chambre n'a pas été traitée.
        </ColorRow>
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
              <span className="font-medium text-foreground">Clic gauche</span> : fait
              défiler le statut de la chambre. Les états proposés s'adaptent à la
              situation. Une chambre vendue tourne entre nettoyée, refus, bloquée et{' '}
              <span className="font-medium text-foreground">non vendue</span> (si le
              rooming l'a comptée vendue à tort, un dernier clic la grise et la sort
              des vendues) ; une chambre non vendue peut à l'inverse être marquée
              vendue à la main si besoin.
            </span>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0">
              <MouseGlyph side="right" />
            </span>
            <span>
              <span className="font-medium text-foreground">Clic droit</span> : pose
              ou retire à la main le liseré « bloquée de la veille ». Utile pour un
              report tardif repéré après coup. Le liseré calculé automatiquement à
              partir des jours passés, lui, ne se retire pas au clic droit.
            </span>
          </div>
          <p>
            La flèche de retour en haut de chaque étage remet toutes les chambres de
            l'étage à leur état d'origine, d'un seul geste, pour corriger une saisie.
          </p>
        </Section>
      </div>
      <div className="pointer-fine:hidden">
        <Section title="Les deux gestes tactiles">
          <p>
            <span className="font-medium text-foreground">Appui simple</span> : fait
            défiler le statut de la chambre. Les états proposés s'adaptent à la
            situation. Une chambre vendue tourne entre nettoyée, refus, bloquée et{' '}
            <span className="font-medium text-foreground">non vendue</span> (si le
            rooming l'a comptée vendue à tort, un dernier appui la grise et la sort
            des vendues) ; une chambre non vendue peut à l'inverse être marquée
            vendue à la main si besoin.
          </p>
          <p>
            <span className="font-medium text-foreground">Appui long</span> : pose ou
            retire à la main le liseré « bloquée de la veille ». Utile pour un report
            tardif repéré après coup. Le liseré calculé automatiquement à partir des
            jours passés, lui, ne se retire pas à l'appui long.
          </p>
          <p>
            La flèche de retour en haut de chaque étage remet toutes les chambres de
            l'étage à leur état d'origine, d'un seul geste, pour corriger une saisie.
          </p>
        </Section>
      </div>

      <Section title="Le cas d'une chambre bloquée la veille et non vendue">
        <p>
          C'est le cas le plus délicat. Une chambre bloquée hier revient aujourd'hui
          avec son contour rouge. Si elle n'est pas revendue aujourd'hui, elle
          apparaît <span className="font-medium text-foreground">grise avec le
          contour rouge</span> : vide, mais son ménage reste dû.
        </p>
        <p>
          Quand vous la nettoyez enfin, un clic gauche la passe au{' '}
          <span className="font-medium text-foreground">vert avec le contour rouge</span>{' '}
          : le ménage est fait. Elle compte alors dans les
          <span className="font-medium text-foreground"> nettoyées</span> (donc
          facturée à ELIOR, puisque le ménage a bien eu lieu) mais{' '}
          <span className="font-medium text-foreground">jamais dans les vendues</span>{' '}
          : elle avait été vendue la veille, pas aujourd'hui. Elle cesse aussi de
          revenir les jours suivants.
        </p>
        <p>
          Sur ce type de chambre, le clic ne propose pas « refus » : sans client
          présent, refuser un ménage n'aurait pas de sens.
        </p>
      </Section>

      <Section title="Les compteurs du haut">
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <span className="font-medium text-foreground">Vendues</span> : chambres
            occupées ce jour, d'après In-House. Base de tout le suivi.
          </li>
          <li>
            <span className="font-medium text-foreground">Nettoyées</span> :
            ménages faits et facturés aujourd'hui, y compris les rattrapages de
            chambres bloquées les jours précédents.
          </li>
          <li>
            <span className="font-medium text-foreground">Refus</span> : clients qui
            ont décliné le ménage.
          </li>
          <li>
            <span className="font-medium text-foreground">Bloquées du jour</span> :
            chambres vendues aujourd'hui mais pas nettoyées, reportées à demain.
          </li>
          <li>
            <span className="font-medium text-foreground">Bloquées de la veille</span>{' '}
            : chambres reportées d'un jour précédent, encore à traiter. Ce compteur
            n'apparaît que s'il y en a.
          </li>
        </ul>
      </Section>

      <Section title="Clôturer la journée">
        <p>
          Une fois toutes les chambres traitées, le bouton en bas de page clôture le
          rapprochement. Vous saisissez le nom de l'hôtelier, puis la grille et le
          commentaire sont figés. La clôture enregistre définitivement les ménages
          faits pour le récap facturé à ELIOR.
        </p>
        <p>
          Un jour clôturé peut être rouvert si une correction s'impose. Les chambres
          restées bloquées à la clôture ne sont pas perdues : elles réapparaissent
          le lendemain avec leur contour rouge.
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
          Si le nombre de chambres occupées d'après In-House ne correspond pas au
          rapport comptable (Comparison), une alerte s'affiche sur un jour clôturé.
          C'est souvent une arrivée ou une annulation de dernière minute présente
          dans un seul des deux rapports, à vérifier.
        </p>
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
