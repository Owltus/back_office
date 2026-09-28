import { useCallback, useState } from 'react'
import type { KeyboardEvent, ReactNode, RefObject } from 'react'
import {
  Bold,
  ListIndentDecrease,
  ListIndentIncrease,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  ScissorsLineDashed,
  SeparatorHorizontal,
  Strikethrough,
  Table,
  TextQuote,
} from 'lucide-react'

import {
  appliquerDansEditeur,
  appliquerQuandLibre,
} from '#/components/classeur/detail/editionTextarea.ts'
import { TableauDialog } from '#/components/classeur/dialogs/TableauDialog.tsx'
import { IconAction } from '#/components/classeur/IconAction.tsx'
import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import {
  basculerEntourage,
  basculerPrefixe,
  continuerListe,
  indenterListe,
  insererBloc,
  insererLien,
  insererTexteEnBloc,
  prefixeActif,
} from '#/lib/classeur/markdownEdition.ts'
import type {
  Bloc,
  Edition,
  Entourage,
  Prefixe,
} from '#/lib/classeur/markdownEdition.ts'
import { grilleVide, trouverTableau } from '#/lib/classeur/tableauMarkdown.ts'
import type { Grille } from '#/lib/classeur/tableauMarkdown.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Barre de mise en forme de l'éditeur des documents (2026-09-27, demande
 * utilisateur : « plus poussé mais très léger, facile à utiliser, pour les
 * personnes qui n'y connaissent rien »). Chaque bouton ÉCRIT le Markdown à
 * la place de l'utilisateur ; la logique est pure, dans
 * `lib/classeur/markdownEdition.ts`.
 *
 * L'édition passe par `appliquerDansEditeur` (`execCommand('insertText')`) :
 * le navigateur l'inscrit dans son historique, donc Ctrl + Z annule un clic
 * de la barre comme une frappe.
 */

type Action =
  | { type: 'entourage'; valeur: Entourage }
  | { type: 'prefixe'; valeur: Prefixe }
  | { type: 'bloc'; valeur: Bloc }
  | { type: 'lien' }

function calculer(action: Action, v: string, d: number, f: number): Edition {
  switch (action.type) {
    case 'entourage':
      return basculerEntourage(v, d, f, action.valeur)
    case 'prefixe':
      return basculerPrefixe(v, d, f, action.valeur)
    case 'bloc':
      return insererBloc(v, d, f, action.valeur)
    case 'lien':
      return insererLien(v, d, f)
  }
}

/**
 * Mise en forme d'un `textarea` : actions de la barre, raccourcis clavier
 * (Ctrl + B / I / K), Entrée qui continue une liste, Tab qui la décale, et
 * la nature de la ligne du curseur (bouton de titre ou de liste « enfoncé »).
 */
export function useMiseEnForme(
  editeurRef: RefObject<HTMLTextAreaElement | null>,
  lectureSeule = false,
) {
  const [ligneActive, setLigneActive] = useState<Prefixe | null>(null)

  const relever = useCallback(() => {
    const ed = editeurRef.current
    if (ed) setLigneActive(prefixeActif(ed.value, ed.selectionStart))
  }, [editeurRef])

  const executer = useCallback(
    (action: Action) => {
      const ed = editeurRef.current
      if (!ed || lectureSeule) return
      appliquerDansEditeur(
        ed,
        calculer(action, ed.value, ed.selectionStart, ed.selectionEnd),
      )
      relever()
    },
    [editeurRef, lectureSeule, relever],
  )

  /**
   * Décaler / ramener une ligne de liste : Tab et Maj + Tab au clavier, ces
   * boutons au doigt (les claviers virtuels n'ont pas de Tab).
   */
  const decaler = useCallback(
    (sens: 1 | -1) => {
      const ed = editeurRef.current
      if (!ed || lectureSeule) return
      const edition = indenterListe(
        ed.value,
        ed.selectionStart,
        ed.selectionEnd,
        sens,
      )
      if (edition) appliquerDansEditeur(ed, edition)
    },
    [editeurRef, lectureSeule],
  )

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (lectureSeule || e.nativeEvent.isComposing) return
      const ed = e.currentTarget
      const mod = e.ctrlKey || e.metaKey
      if (mod && !e.altKey && !e.shiftKey) {
        const touche = e.key.toLowerCase()
        const action: Action | null =
          touche === 'b'
            ? { type: 'entourage', valeur: 'gras' }
            : touche === 'i'
              ? { type: 'entourage', valeur: 'italique' }
              : touche === 'k'
                ? { type: 'lien' }
                : null
        if (action) {
          e.preventDefault()
          executer(action)
        }
        return
      }
      if (e.key === 'Enter' && !mod && !e.shiftKey && !e.altKey) {
        const edition = continuerListe(
          ed.value,
          ed.selectionStart,
          ed.selectionEnd,
        )
        if (edition) {
          e.preventDefault()
          appliquerDansEditeur(ed, edition)
          relever()
        }
        return
      }
      if (e.key === 'Tab' && !mod && !e.altKey) {
        const edition = indenterListe(
          ed.value,
          ed.selectionStart,
          ed.selectionEnd,
          e.shiftKey ? -1 : 1,
        )
        if (edition) {
          e.preventDefault()
          appliquerDansEditeur(ed, edition)
        }
      }
    },
    [executer, lectureSeule, relever],
  )

  // ── Tableau (amélioration n° 7) : grille de saisie, Markdown en sortie ──
  const [tableau, setTableau] = useState<{
    grille: Grille
    /** Plage du tableau existant remplacé, ou de la sélection. */
    debut: number
    fin: number
    modification: boolean
  } | null>(null)

  /** Grille pré-remplie si le curseur est dans un tableau, vide sinon. */
  const ouvrirTableau = useCallback(() => {
    const ed = editeurRef.current
    if (!ed || lectureSeule) return
    const trouve = trouverTableau(ed.value, ed.selectionStart)
    setTableau(
      trouve
        ? {
            grille: trouve,
            debut: trouve.debut,
            fin: trouve.fin,
            modification: true,
          }
        : {
            grille: grilleVide(),
            debut: ed.selectionStart,
            fin: ed.selectionEnd,
            modification: false,
          },
    )
  }, [editeurRef, lectureSeule])

  /** Écrit le tableau Markdown, une fois la grille fermée (Ctrl + Z l'annule). */
  const validerTableau = useCallback(
    (markdown: string) => {
      if (!tableau) return
      const { debut, fin } = tableau
      setTableau(null)
      appliquerQuandLibre(
        () => editeurRef.current,
        (valeur) => insererTexteEnBloc(valeur, debut, fin, markdown),
        () => undefined,
      )
    },
    [tableau, editeurRef],
  )

  return {
    executer,
    decaler,
    ligneActive,
    tableau,
    ouvrirTableau,
    validerTableau,
    annulerTableau: () => {
      setTableau(null)
      editeurRef.current?.focus()
    },
    /** À poser sur le `textarea`. */
    editeurProps: { onKeyDown, onSelect: relever },
  }
}

type MiseEnForme = ReturnType<typeof useMiseEnForme>

/** Un bouton de la barre : garde le focus (et la sélection) dans l'éditeur. */
function Outil({
  label,
  icon,
  onClick,
  actif,
}: {
  label: string
  icon: ReactNode
  onClick: () => void
  actif?: boolean
}) {
  return (
    <IconAction
      label={label}
      icon={icon}
      // Garde le focus (et le clavier virtuel) dans l'éditeur : souris ET
      // doigt (un toucher émet pointerdown avant tout événement souris).
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-pressed={actif === undefined ? undefined : actif}
      className={cn(actif && 'bg-accent text-accent-foreground')}
    />
  )
}

/**
 * La barre, en groupes : titres · style du texte · listes et encadré ·
 * éléments (lien, tableau, séparateur, saut de page) · `fin` (les boutons
 * d'image, fournis par l'éditeur).
 */
export function BarreMiseEnForme({
  miseEnForme,
  fin,
}: {
  miseEnForme: MiseEnForme
  fin?: ReactNode
}) {
  const { executer, ligneActive, tableau } = miseEnForme
  const prefixe = (valeur: Prefixe) => () =>
    executer({ type: 'prefixe', valeur })
  return (
    <div
      role="toolbar"
      aria-label="Mise en forme"
      className="flex flex-wrap items-center gap-2"
    >
      <TableauDialog
        grille={tableau?.grille ?? null}
        modification={tableau?.modification ?? false}
        onAnnuler={miseEnForme.annulerTableau}
        onValider={miseEnForme.validerTableau}
      />
      <ButtonGroup>
        <Outil
          label="Grand titre"
          icon={<Heading1 />}
          actif={ligneActive === 'titre1'}
          onClick={prefixe('titre1')}
        />
        <Outil
          label="Titre de partie"
          icon={<Heading2 />}
          actif={ligneActive === 'titre2'}
          onClick={prefixe('titre2')}
        />
        <Outil
          label="Sous-titre"
          icon={<Heading3 />}
          actif={ligneActive === 'titre3'}
          onClick={prefixe('titre3')}
        />
      </ButtonGroup>
      <ButtonGroup>
        <Outil
          label="Gras (Ctrl + B)"
          icon={<Bold />}
          onClick={() => executer({ type: 'entourage', valeur: 'gras' })}
        />
        <Outil
          label="Italique (Ctrl + I)"
          icon={<Italic />}
          onClick={() => executer({ type: 'entourage', valeur: 'italique' })}
        />
        <Outil
          label="Barré"
          icon={<Strikethrough />}
          onClick={() => executer({ type: 'entourage', valeur: 'barre' })}
        />
      </ButtonGroup>
      <ButtonGroup>
        <Outil
          label="Liste à puces"
          icon={<List />}
          actif={ligneActive === 'puces'}
          onClick={prefixe('puces')}
        />
        <Outil
          label="Liste numérotée"
          icon={<ListOrdered />}
          actif={ligneActive === 'numeros'}
          onClick={prefixe('numeros')}
        />
        <Outil
          label="Cases à cocher"
          icon={<ListTodo />}
          actif={ligneActive === 'cases'}
          onClick={prefixe('cases')}
        />
        <Outil
          label="Encadré (citation, remarque)"
          icon={<TextQuote />}
          actif={ligneActive === 'citation'}
          onClick={prefixe('citation')}
        />
      </ButtonGroup>
      {/* Au doigt seulement : pas de Tab sur un clavier virtuel. */}
      <ButtonGroup className="hidden pointer-coarse:inline-flex">
        <Outil
          label="Ramener (sous-liste)"
          icon={<ListIndentDecrease />}
          onClick={() => miseEnForme.decaler(-1)}
        />
        <Outil
          label="Décaler (sous-liste)"
          icon={<ListIndentIncrease />}
          onClick={() => miseEnForme.decaler(1)}
        />
      </ButtonGroup>
      <ButtonGroup>
        <Outil
          label="Lien (Ctrl + K)"
          icon={<Link />}
          onClick={() => executer({ type: 'lien' })}
        />
        <Outil
          label="Tableau (curseur dans un tableau : le modifier)"
          icon={<Table />}
          onClick={miseEnForme.ouvrirTableau}
        />
        <Outil
          label="Ligne de séparation"
          icon={<SeparatorHorizontal />}
          onClick={() => executer({ type: 'bloc', valeur: 'separateur' })}
        />
        <Outil
          label="Saut de page"
          icon={<ScissorsLineDashed />}
          onClick={() => executer({ type: 'bloc', valeur: 'saut' })}
        />
      </ButtonGroup>
      {fin}
    </div>
  )
}
