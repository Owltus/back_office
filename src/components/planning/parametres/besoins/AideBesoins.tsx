/*
 * Bouton « ? » de la page Besoins (demande utilisateur du 2026-11-11 :
 * « crée un petit bouton point d'interrogation comme sur les autres pages,
 * et explique comment cette page fonctionne »). Il remplace le repli « Dans
 * quel ordre le planning décide » qui était en bas de la page.
 *
 * Écrit en texte suivi, sans liste à puces ni nom de poste (décisions du
 * même jour). Les règles des moments sont le miroir de `momentFixe`
 * (moment.ts) ; l'ordre de décision, celui du calcul par niveaux
 * (`generateur.ts`).
 */
import { useState } from 'react'
import type { ReactNode } from 'react'

import { HelpDialogHeader } from '#/components/shared/HelpDialogHeader.tsx'
import { HelpGlyph } from '#/components/shared/HelpGlyph.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Dialog, DialogContent } from '#/components/ui/dialog.tsx'

function Partie({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-sm font-semibold text-foreground">{titre}</h3>
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        {children}
      </div>
    </section>
  )
}

/** Le texte de l'aide (exporté pour les tests de rendu). */
export function AideBesoinsContenu() {
  return (
    <div className="flex flex-col gap-5">
      <Partie titre="À quoi sert cette page">
        <p>
          Elle dit combien de personnes doivent être présentes au minimum,
          chaque jour de la semaine, le matin, le soir et la nuit. Le planning
          s’en sert pour placer l’équipe quand vous cliquez sur Compléter.
        </p>
      </Partie>

      <Partie titre="Le tableau du personnel">
        <p>
          Chaque case donne le nombre de personnes pour un jour et un moment.
          Cliquez sur une case, puis réglez le nombre avec les boutons plus et
          moins. Le changement est enregistré tout de suite. Un tiret orange
          veut dire que personne n’est demandé à ce moment-là.
        </p>
        <p>
          Le matin et le soir, le nombre est un minimum : le planning peut
          ajouter une personne à qui il manque des heures, sans en abuser. La
          nuit, il place exactement le nombre demandé. Un veilleur de plus, par
          exemple pour une formation, se pose à la main.
        </p>
        <p>
          Les boutons Annuler et Rétablir, en haut à droite, défont et refont
          vos dernières modifications. Les raccourcis Ctrl + Z et Ctrl + Y font
          la même chose.
        </p>
      </Partie>

      <Partie titre="Qui compte dans le tableau">
        <p>
          Les postes cochés Indispensable au fonctionnement, dans la page
          Postes. Cocher ou décocher cette case suffit pour qu’un poste entre
          dans le tableau ou en sorte. Le tableau est tenu sans interruption,
          jour et nuit : l’équipe suivante arrive au plus tard quand la
          précédente part, et le planning préfère qu’elles se croisent un moment
          pour se passer les consignes.
        </p>
        <p>
          Les apprentis et les stagiaires comptent dans le nombre, mais ils ne
          sont jamais seuls : un salarié titulaire ou en dépannage est avec eux
          pendant tout leur shift.
        </p>
      </Partie>

      <Partie titre="Les autres postes">
        <p>
          Les postes qui ne sont pas indispensables n’ont pas de tableau. Le
          planning les remplit au mieux d’après la fiche de chaque personne : sa
          semaine type, ses jours de repos et les heures de son contrat. Ils ne
          laissent jamais de place à pourvoir.
        </p>
      </Partie>

      <Partie titre="Matin, middle, soir et nuit">
        <p>
          Chaque horaire est rangé tout seul d’après ses heures, sans réglage.
          Un horaire qui contient 2 h du matin est de nuit. Sinon, un horaire
          qui finit après 21 h, ou après minuit, est du soir. Sinon, un horaire
          qui commence à 8 h ou avant est du matin. Tous les autres, à cheval au
          milieu de la journée, sont des middles : ils ne comptent pas dans le
          tableau et servent de coup de main quand il reste des heures à faire.
        </p>
      </Partie>

      <Partie titre="Dans quel ordre le planning décide">
        <p>
          D’abord la loi et les règles de l’hôtel, qui ne se discutent jamais :
          le repos entre deux services, le rythme de cinq jours de travail puis
          deux jours de repos de suite, et jamais un apprenti ou un stagiaire
          seul.
        </p>
        <p>
          Ensuite, à égalité, les heures prévues au contrat de chacun et le
          personnel minimum du tableau. Quand l’équipe ne suffit pas, le
          planning laisse la case en manque et vous le dit.
        </p>
        <p>
          Puis il évite de déplacer les jours de repos habituels, équilibre le
          matin et le soir, et remplit les autres postes. Un titulaire passe
          avant un dépannage. Enfin vient le confort : le partage des week-ends,
          des soirs et des matins tôt sur quatre semaines, et les mêmes horaires
          d’un jour à l’autre.
        </p>
        <p>
          Les extras ne sont jamais placés par le calcul. On les appelle
          d’abord, puis on les pose à la main.
        </p>
      </Partie>
    </div>
  )
}

export function AideBesoins() {
  const [ouvert, setOuvert] = useState(false)
  return (
    <>
      <Tip label="Comment ça marche">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setOuvert(true)}
          aria-label="Comment ça marche"
        >
          <HelpGlyph />
        </Button>
      </Tip>
      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
          <HelpDialogHeader
            icon={<HelpGlyph />}
            title="Comment fonctionne la page Besoins"
            description="Le personnel minimum, qui compte, et comment le planning décide."
          />
          {/* Seul le corps défile : l'en-tête reste en haut. */}
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <AideBesoinsContenu />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
