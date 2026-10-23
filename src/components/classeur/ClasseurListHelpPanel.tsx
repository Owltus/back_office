import type { ReactNode } from 'react'
import { Eye, EyeOff, Lock, Pencil, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { MouseGlyph } from '#/components/parking/MouseGlyph.tsx'

/*
 * Contenu du modal d'aide de la liste des classeurs (bouton « ? » de
 * l'en-tête, 2026-10-19, demande utilisateur). Même gabarit que
 * `BabyCotHelpPanel` : tutoriel factuel, aucune donnée, aucun état. Ce qui
 * ne concerne pas le compte (créer, ranger, accès donnés à tous) n'est pas
 * montré : l'aide décrit la page telle que la personne la voit.
 */

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

function Legende({
  icone: Icone,
  children,
}: {
  icone: LucideIcon
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icone className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}

const fort = (texte: string) => (
  <span className="font-medium text-foreground">{texte}</span>
)

export function ClasseurListHelpPanel({
  canWrite,
  canManage,
}: {
  /** Écriture sur la page : créer et importer. */
  canWrite: boolean
  /** Gestion de la page : ranger, accès donnés à tous, supprimer. */
  canManage: boolean
}) {
  return (
    <div className="space-y-6">
      <Section title="À quoi sert cette page">
        <p>
          Elle réunit les classeurs de l'hôtel : registre de sécurité, carnet
          sanitaire, procédures. Chaque classeur est découpé en chapitres et se
          prépare pour être imprimé et rangé dans un vrai classeur.
        </p>
        <p>Vous ne voyez que les classeurs auxquels vous avez accès.</p>
      </Section>

      <Section title="Ouvrir un classeur">
        <GestureRow side="left">
          {fort('Clic')} sur une ligne : le classeur s'ouvre, avec ses chapitres
          dans la colonne de gauche.
        </GestureRow>
        {canManage && (
          <GestureRow side="left">
            {fort('Clic maintenu')} sur une ligne, puis glisser : changer
            l'ordre des classeurs. Cet ordre est le même pour tout le monde. Au
            doigt, un appui long fait la même chose.
          </GestureRow>
        )}
      </Section>

      <Section title="Le menu d'un classeur">
        <GestureRow side="right">
          {fort('Clic droit')} sur une ligne : ouvrir, modifier le nom et
          l'icône, régler les accès, copier pour un LLM, exporter en JSON ou
          supprimer.
        </GestureRow>
        <p>
          Une action que vos droits ne permettent pas reste visible mais grisée,
          avec la raison à droite : lecture seule ou gestion seule.
        </p>
      </Section>

      <Section title="Les colonnes">
        <p>
          {fort('Modifié le')} : la dernière modification du classeur ou de son
          contenu.
        </p>
        {canManage ? (
          <>
            <p>{fort('Accès')} : ce que les autres peuvent faire.</p>
            <Legende icone={EyeOff}>
              Privé : seuls la gestion et les accès donnés un par un.
            </Legende>
            <Legende icone={Eye}>Tous le lisent.</Legende>
            <Legende icone={Users}>Tous peuvent le modifier.</Legende>
          </>
        ) : canWrite ? (
          <>
            <p>{fort('Accès')} : ce que vous pouvez faire.</p>
            <Legende icone={Pencil}>Vous pouvez le modifier.</Legende>
            <Legende icone={Lock}>Vous pouvez seulement le lire.</Legende>
          </>
        ) : null}
        {(canManage || canWrite) && (
          <p>Survolez une icône pour lire son sens.</p>
        )}
      </Section>

      <Section title="Travailler avec un LLM">
        <GestureRow side="right">
          {fort('Clic droit')} sur une ligne, puis {fort('Copier pour un LLM')}{' '}
          : tout le classeur est copié, avec un mode d'emploi pour le LLM. Dans
          un classeur, la ligne Exporter en JSON a le même bouton Copier.
        </GestureRow>
        <p>
          Collez dans la conversation avec le LLM. Il vous demande ce que vous
          voulez faire : poser une question, corriger, ajouter un chapitre ou
          une feuille. Avant une modification, il vous dit ce qu'il va
          supprimer, déplacer, modifier ou ajouter. Il rappelle ses limites dans
          la conversation, jamais dans le classeur.
        </p>
        {canWrite && (
          <>
            <p>
              Pour reprendre ses modifications : ouvrez le classeur, ligne{' '}
              {fort('Importer')}, puis collez sa réponse. Une réponse sur un
              chapitre ou un document ne change que lui.
            </p>
            <p>
              Le LLM ne renvoie que ce qui change : le reste ne bouge pas. Vous
              voyez chaque changement avant de valider, et vous pouvez en
              refuser un. Ce qui est supprimé va à la corbeille. Un point de
              restauration est pris avant la première modification.
            </p>
          </>
        )}
      </Section>

      {canWrite && (
        <Section title="Créer ou importer">
          <p>
            {fort('Nouveau classeur')} en crée un vide. Le bouton Importer crée
            un nouveau classeur à partir d'un fichier exporté. Vous pouvez aussi
            déposer le fichier directement sur le bouton. Si le fichier pose
            question, vous le voyez avant la création.
          </p>
        </Section>
      )}
    </div>
  )
}
