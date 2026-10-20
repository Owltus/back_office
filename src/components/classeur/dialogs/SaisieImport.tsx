import { useEffect, useId, useRef, useState } from 'react'
import { ClipboardCheck, ClipboardPaste, FileText, FileUp } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import { tailleLisible, tailleSource } from '#/lib/classeur/sourceImport.ts'
import type { SourceImport } from '#/lib/classeur/sourceImport.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Saisie d'un import, partagée par les deux dialogues. Depuis le 2026-10-20
 * (demande utilisateur), DEUX zones côte à côte, empilées sur écran étroit :
 *   - Coller : un vrai champ, toujours visible. Un collage y devient la
 *     source aussitôt, une frappe une fois finie (`ATTENTE_FRAPPE_MS`). Le
 *     bouton Coller lit le presse-papiers ; si le navigateur refuse, le champ
 *     prend le focus, sans message (rien n'a échoué pour la personne).
 *     Ctrl + V hors de tout champ est pris aussi (un fichier copié compris).
 *   - Déposer : zone pointillée ; un clic, Entrée ou Espace ouvre le choix
 *     d'un fichier. Un dépôt sur l'une ou l'autre zone est accepté.
 * Une fois la source donnée, la saisie se replie en une ligne (Réponse
 * collée ou nom du fichier, poids) avec Changer. Le dialogue décide du reste.
 */

export const LIBELLE_COLLER = 'Coller la réponse du LLM'
export const LIBELLE_DEPOSER = 'Déposer le fichier ici'
export const LIBELLE_CHOISIR = 'ou cliquer pour choisir'

/** Après la dernière frappe dans le champ, la source est donnée. */
const ATTENTE_FRAPPE_MS = 600

const ACCEPTE = '.json,.txt,application/json,text/plain'

/** Hauteur commune des deux zones. */
const HAUTEUR_ZONE = 'min-h-56'

function estChampSaisie(el: Element | null): boolean {
  if (el === null) return false
  if (el instanceof HTMLElement && el.isContentEditable) return true
  return (
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLInputElement &&
      !['button', 'checkbox', 'radio', 'submit', 'file'].includes(el.type))
  )
}

/** La source portée par un presse-papiers ou un dépôt, s'il y en a une. */
function sourceDepuis(
  donnees: Pick<DataTransfer, 'files' | 'getData'> | null,
): SourceImport | null {
  if (donnees === null) return null
  const file = donnees.files.length > 0 ? donnees.files[0] : undefined
  if (file !== undefined) return { type: 'fichier', file }
  const texte = donnees.getData('text/plain')
  return texte.trim() === '' ? null : { type: 'texte', texte }
}

export function SaisieImport({
  source,
  onSource,
  disabled = false,
}: {
  /** `null` : les deux zones ; sinon la ligne repliée. */
  source: SourceImport | null
  /** Une source donnée, ou `null` (Changer). */
  onSource: (source: SourceImport | null) => void
  disabled?: boolean
}) {
  const [survol, setSurvol] = useState(false)
  const [brouillon, setBrouillon] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const champRef = useRef<HTMLTextAreaElement>(null)
  const idChamp = useId()
  const actif = source === null && !disabled

  // Ctrl + V ailleurs que dans un champ : la réponse est prise telle quelle.
  // Un collage dans NOTRE champ est déjà traité par lui (`defaultPrevented`).
  useEffect(() => {
    if (!actif) return
    function surCollage(e: ClipboardEvent) {
      if (e.defaultPrevented) return
      const focus = document.activeElement
      if (focus !== champRef.current && estChampSaisie(focus)) return
      const s = sourceDepuis(e.clipboardData)
      if (s === null) return
      e.preventDefault()
      onSource(s)
    }
    document.addEventListener('paste', surCollage)
    return () => document.removeEventListener('paste', surCollage)
  }, [actif, onSource])

  // La frappe dans le champ devient la source une fois finie.
  useEffect(() => {
    if (brouillon.trim() === '') return
    const minuteur = window.setTimeout(() => {
      onSource({ type: 'texte', texte: brouillon })
    }, ATTENTE_FRAPPE_MS)
    return () => window.clearTimeout(minuteur)
  }, [brouillon, onSource])

  // Une source arrive (ou Changer) : les zones repartent propres.
  useEffect(() => {
    setBrouillon('')
    setSurvol(false)
  }, [source])

  async function coller() {
    try {
      const texte = await navigator.clipboard.readText()
      if (texte.trim() !== '') {
        onSource({ type: 'texte', texte })
        return
      }
    } catch {
      // Refus du navigateur : on passe au champ, sans message.
    }
    champRef.current?.focus()
  }

  const depot = {
    onDragEnter: (e: React.DragEvent) => {
      if (disabled) return
      e.preventDefault()
      setSurvol(true)
    },
    onDragOver: (e: React.DragEvent) => {
      if (disabled) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setSurvol(true)
    },
    onDragLeave: (e: React.DragEvent) => {
      const vers = e.relatedTarget
      if (vers instanceof Node && e.currentTarget.contains(vers)) return
      setSurvol(false)
    },
    onDrop: (e: React.DragEvent) => {
      if (disabled) return
      e.preventDefault()
      setSurvol(false)
      const s = sourceDepuis(e.dataTransfer)
      if (s !== null) onSource(s)
    },
  }

  if (source !== null) {
    const Icone = source.type === 'fichier' ? FileText : ClipboardCheck
    return (
      <div
        {...depot}
        className={cn(
          'flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2 transition-colors',
          survol && 'border-primary bg-primary/10',
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icone className="size-4" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">
            {source.type === 'fichier' ? source.file.name : 'Réponse collée'}
          </span>
          <span className="text-xs text-muted-foreground">
            {tailleLisible(tailleSource(source))}
          </span>
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 shrink-0"
          onClick={() => onSource(null)}
          disabled={disabled}
        >
          Changer
        </Button>
      </div>
    )
  }

  return (
    <div
      {...depot}
      data-saisie-import
      className={cn('grid gap-3 sm:grid-cols-2', disabled && 'opacity-60')}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTE}
        className="hidden"
        aria-label="Choisir un fichier"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onSource({ type: 'fichier', file: f })
        }}
      />

      <div
        data-zone="coller"
        className={cn(
          'flex flex-col gap-2 rounded-xl border bg-muted/30 p-3',
          HAUTEUR_ZONE,
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={idChamp} className="text-sm font-medium">
            {LIBELLE_COLLER}
          </label>
          <Button
            type="button"
            variant="outline"
            className="h-10 shrink-0"
            onClick={() => void coller()}
            disabled={disabled}
          >
            <ClipboardPaste />
            Coller
          </Button>
        </div>
        <Textarea
          ref={champRef}
          id={idChamp}
          value={brouillon}
          onChange={(e) => setBrouillon(e.target.value)}
          onPaste={(e) => {
            const s = sourceDepuis(e.clipboardData)
            if (s === null) return
            e.preventDefault()
            onSource(s)
          }}
          placeholder="Ctrl + V ici"
          spellCheck={false}
          disabled={disabled}
          className="min-h-32 flex-1 resize-none bg-background text-sm [field-sizing:fixed]"
        />
      </div>

      <button
        type="button"
        data-zone="deposer"
        data-survol={survol || undefined}
        aria-label={`${LIBELLE_DEPOSER}, ${LIBELLE_CHOISIR}`}
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className={cn(
          'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/30 px-4 py-6 text-center transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed',
          'hover:border-primary/60 hover:bg-muted/50',
          HAUTEUR_ZONE,
          survol &&
            'border-primary bg-primary/10 hover:border-primary hover:bg-primary/10',
        )}
      >
        <span
          className={cn(
            'flex size-12 items-center justify-center rounded-full bg-background text-muted-foreground shadow-xs',
            survol && 'text-primary',
          )}
        >
          <FileUp className="size-6" aria-hidden />
        </span>
        <span className="flex flex-col gap-1">
          <span className="text-sm font-medium">{LIBELLE_DEPOSER}</span>
          <span className="text-sm text-muted-foreground">
            {survol ? 'Relâchez pour importer' : LIBELLE_CHOISIR}
          </span>
        </span>
      </button>
    </div>
  )
}
