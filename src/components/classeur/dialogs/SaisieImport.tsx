import { useEffect, useId, useRef, useState } from 'react'
import { ClipboardCheck, ClipboardPaste, FileText, FileUp } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import { tailleLisible, tailleSource } from '#/lib/classeur/sourceImport.ts'
import type { SourceImport } from '#/lib/classeur/sourceImport.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Saisie d'un import (refonte du 2026-10-20, « zéro friction ») : UNE zone
 * qui reçoit la réponse de l'IA de toutes les façons naturelles.
 *   - Ctrl + V n'importe où dans le dialogue quand aucun champ n'a le focus
 *     (un fichier copié dans l'explorateur est pris aussi) ;
 *   - le bouton Coller lit le presse-papiers ; si le navigateur refuse, un
 *     champ apparaît, déjà sélectionné, où coller soi-même (sans message :
 *     rien n'a échoué du point de vue de la personne) ;
 *   - un fichier déposé sur la zone, ou choisi par le bouton.
 * Une fois la source donnée, la zone se replie en une ligne (Réponse collée
 * ou nom du fichier, poids) avec Changer. Le dialogue décide du reste.
 */

export const LIBELLE_ZONE = "Collez la réponse de l'IA ou déposez le fichier"

/** Après la dernière frappe dans le champ de secours, la source est donnée. */
const ATTENTE_FRAPPE_MS = 600

const ACCEPTE = '.json,.txt,application/json,text/plain'

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
  /** `null` : la grande zone ; sinon la ligne repliée. */
  source: SourceImport | null
  /** Une source donnée, ou `null` (Changer). */
  onSource: (source: SourceImport | null) => void
  disabled?: boolean
}) {
  const [survol, setSurvol] = useState(false)
  // Champ de secours, affiché quand le presse-papiers est refusé.
  const [champ, setChamp] = useState(false)
  const [brouillon, setBrouillon] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const champRef = useRef<HTMLTextAreaElement>(null)
  const idConsigne = useId()
  const actif = source === null && !disabled

  // Ctrl + V ailleurs que dans un champ : la réponse est prise telle quelle.
  useEffect(() => {
    if (!actif) return
    function surCollage(e: ClipboardEvent) {
      if (estChampSaisie(document.activeElement)) return
      const s = sourceDepuis(e.clipboardData)
      if (s === null) return
      e.preventDefault()
      onSource(s)
    }
    document.addEventListener('paste', surCollage)
    return () => document.removeEventListener('paste', surCollage)
  }, [actif, onSource])

  // Champ de secours : la frappe devient la source une fois finie.
  useEffect(() => {
    if (brouillon.trim() === '') return
    const minuteur = window.setTimeout(() => {
      onSource({ type: 'texte', texte: brouillon })
    }, ATTENTE_FRAPPE_MS)
    return () => window.clearTimeout(minuteur)
  }, [brouillon, onSource])

  // Une source arrive (ou Changer) : la zone repart propre.
  useEffect(() => {
    setChamp(false)
    setBrouillon('')
    setSurvol(false)
  }, [source])

  useEffect(() => {
    if (champ) champRef.current?.focus()
  }, [champ])

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
    setChamp(true)
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

  const choixFichier = (
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
  )

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
      data-survol={survol || undefined}
      className={cn(
        'flex min-h-56 flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border bg-muted/30 px-4 py-6 text-center transition-colors',
        survol && 'border-primary bg-primary/10',
        disabled && 'opacity-60',
      )}
    >
      {choixFichier}
      <span
        className={cn(
          'flex size-12 items-center justify-center rounded-full bg-background text-muted-foreground shadow-xs',
          survol && 'text-primary',
        )}
      >
        <FileUp className="size-6" aria-hidden />
      </span>
      <p id={idConsigne} className="max-w-xs text-sm font-medium">
        {survol ? 'Déposez le fichier ici' : LIBELLE_ZONE}
      </p>
      {champ ? (
        <Textarea
          ref={champRef}
          value={brouillon}
          onChange={(e) => setBrouillon(e.target.value)}
          onPaste={(e) => {
            const s = sourceDepuis(e.clipboardData)
            if (s === null) return
            e.preventDefault()
            onSource(s)
          }}
          placeholder="Ctrl + V pour coller ici"
          aria-label="Réponse de l'IA"
          aria-describedby={idConsigne}
          spellCheck={false}
          disabled={disabled}
          className="h-28 w-full max-w-md resize-none bg-background text-sm [field-sizing:fixed]"
        />
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            className="h-10"
            onClick={() => void coller()}
            disabled={disabled}
          >
            <ClipboardPaste />
            Coller
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
          >
            <FileUp />
            Choisir un fichier
          </Button>
        </div>
      )}
    </div>
  )
}
