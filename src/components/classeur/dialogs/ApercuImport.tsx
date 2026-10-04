import { useId, useMemo } from 'react'
import { ChevronRight } from 'lucide-react'

import {
  ChampsDiff,
  DiffTexte,
} from '#/components/classeur/detail/DiffTexte.tsx'
import { Button } from '#/components/ui/button.tsx'
import { bilan, comparerLignes } from '#/lib/classeur/diff.ts'
import type { LigneImport } from '#/lib/classeur/merge/portee.ts'
import {
  evolutionVersion,
  libelleVersion,
} from '#/lib/classeur/versionDocument.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Aperçu d'un réimport JSON, document par document (étape 1 du plan
 * `classeur-fonctions-2026-10-04`) : ce qui change dans le texte, la version
 * que prendra le document, et une case pour le refuser. Les lignes viennent
 * de `lignesImport` (une par action du plan) ; les refus sont tenus par le
 * dialogue, qui les transmet à l'import par leur clé stable.
 *
 * La comparaison ligne à ligne (LCS) n'est calculée qu'au DÉPLIAGE, sauf
 * pour un petit texte (`CELLULES_EN_TETE`) dont le bilan « +n −m » s'affiche
 * replié : une table LCS peut peser plusieurs Mo pour un long document.
 */

/** Au-delà (lignes avant × lignes après), le bilan attend le dépliage. */
const CELLULES_EN_TETE = 250_000

const NATURES: Record<string, string> = {
  document: 'Document',
  tracking_sheet: 'Feuille de suivi',
  signature_sheet: 'Feuille de signature',
  intercalaire: 'Intercalaire',
  chapter: 'Chapitre',
}

function nombreLignes(texte: string): number {
  return texte === '' ? 0 : texte.split('\n').length
}

/** Libellé court de ce que fait la ligne. */
function etiquette(l: LigneImport): string {
  switch (l.genre) {
    case 'creation':
      return 'ajouté'
    case 'suppression':
      return 'supprimé'
    case 'restauration':
      return 'restauré'
    case 'chapitre':
      return 'modifié'
    case 'modification':
      return l.changement === 'ordre'
        ? 'déplacé'
        : l.changement === 'autre'
          ? 'réglage modifié'
          : 'modifié'
  }
}

/**
 * Ce que le bouton « Importer » va faire : les clés refusées ENCORE présentes
 * dans l'aperçu (`exclus`), le nombre d'éléments retenus, et s'il reste une
 * modification du chapitre (sans case, toujours appliquée). `nom` / `noms` :
 * « document » si l'aperçu n'en montre que, « élément » sinon.
 */
export function compterImport(
  lignes: readonly LigneImport[],
  refuses: ReadonlySet<string>,
): {
  retenus: number
  exclus: ReadonlySet<string>
  chapitre: boolean
  nom: string
  noms: string
} {
  const exclus = new Set<string>()
  let retenus = 0
  let chapitre = false
  let queDesDocuments = true
  for (const l of lignes) {
    if (l.cle === null) {
      chapitre = true
      continue
    }
    if (l.kind !== 'document') queDesDocuments = false
    if (refuses.has(l.cle)) exclus.add(l.cle)
    else retenus += 1
  }
  return {
    retenus,
    exclus,
    chapitre,
    nom: queDesDocuments ? 'document' : 'élément',
    noms: queDesDocuments ? 'documents' : 'éléments',
  }
}

/** Identifiant d'affichage d'une ligne : sa clé, ou son rang pour un chapitre. */
export function idLigne(l: LigneImport, i: number): string {
  return l.cle ?? `chapitre:${String(i)}`
}

export function ApercuImport({
  lignes,
  refuses,
  onBasculerRefus,
  ouvertes,
  onOuvertes,
  disabled,
}: {
  lignes: readonly LigneImport[]
  refuses: ReadonlySet<string>
  onBasculerRefus: (cle: string) => void
  ouvertes: ReadonlySet<string>
  onOuvertes: (ouvertes: ReadonlySet<string>) => void
  disabled: boolean
}) {
  const ids = lignes.map(idLigne)
  const toutOuvert = ids.length > 0 && ids.every((id) => ouvertes.has(id))
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Décochez un élément pour ne pas l'importer.
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="pointer-coarse:min-h-11"
          onClick={() => onOuvertes(toutOuvert ? new Set() : new Set(ids))}
        >
          {toutOuvert ? 'Tout replier' : 'Tout déplier'}
        </Button>
      </div>
      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {lignes.map((l, i) => {
          const id = ids[i]
          return (
            <LigneApercu
              key={id}
              ligne={l}
              refusee={l.cle !== null && refuses.has(l.cle)}
              onBasculerRefus={onBasculerRefus}
              ouverte={ouvertes.has(id)}
              onBasculer={() => {
                const s = new Set(ouvertes)
                if (s.has(id)) s.delete(id)
                else s.add(id)
                onOuvertes(s)
              }}
              disabled={disabled}
            />
          )
        })}
      </ul>
    </div>
  )
}

function LigneApercu({
  ligne,
  refusee,
  onBasculerRefus,
  ouverte,
  onBasculer,
  disabled,
}: {
  ligne: LigneImport
  refusee: boolean
  onBasculerRefus: (cle: string) => void
  ouverte: boolean
  onBasculer: () => void
  disabled: boolean
}) {
  const idDetail = useId()
  const { avant, apres } = ligne
  const petit =
    Math.max(1, nombreLignes(avant.content)) *
      Math.max(1, nombreLignes(apres.content)) <=
    CELLULES_EN_TETE
  // Le diff : au dépliage, ou d'emblée pour un petit texte (bilan replié).
  const diff = useMemo(
    () =>
      ouverte || petit ? comparerLignes(avant.content, apres.content) : null,
    [ouverte, petit, avant.content, apres.content],
  )
  const b = diff === null ? null : bilan(diff)
  const version = useMemo(() => {
    if (ligne.kind !== 'document') return null
    if (ligne.genre === 'creation') return 'version 1.0 · nouveau document'
    if (ligne.numero === null) return null
    const e = evolutionVersion(avant, apres, ligne.numero)
    return `version prévue ${libelleVersion(e.suivante)}${e.raison === '' ? '' : ` · ${e.raison}`}`
  }, [ligne, avant, apres])

  const titre = ligne.titre.trim() === '' ? 'Sans titre' : ligne.titre
  const nature = NATURES[ligne.kind] ?? ligne.kind
  const cle = ligne.cle
  return (
    <li className={cn('flex flex-col', refusee && 'bg-muted/40')}>
      <div className="flex items-center gap-1 pr-2">
        {cle !== null ? (
          <label className="flex size-9 shrink-0 cursor-pointer items-center justify-center pointer-coarse:size-11">
            <input
              type="checkbox"
              checked={!refusee}
              onChange={() => onBasculerRefus(cle)}
              disabled={disabled}
              aria-label={`Importer « ${titre} »`}
              className="size-4 accent-primary"
            />
          </label>
        ) : (
          <span className="size-9 shrink-0 pointer-coarse:size-11" />
        )}
        <button
          type="button"
          onClick={onBasculer}
          aria-expanded={ouverte}
          aria-controls={idDetail}
          className="flex min-w-0 flex-1 items-center gap-2 rounded py-1.5 text-left text-sm hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
        >
          <ChevronRight
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              ouverte && 'rotate-90',
            )}
          />
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              className={cn(
                'truncate',
                refusee && 'text-muted-foreground line-through',
              )}
            >
              {ligne.kind === 'chapter' ? 'Chapitre : ' : ''}
              {titre}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {ligne.kind === 'chapter' ? 'Libellé ou description' : nature}
              {version !== null && ` · ${version}`}
            </span>
          </span>
          {b !== null && (b.ajouts > 0 || b.retraits > 0) && (
            <span className="shrink-0 font-mono text-xs tabular-nums">
              +{b.ajouts} −{b.retraits}
            </span>
          )}
          <span className="shrink-0 text-xs text-muted-foreground">
            {refusee ? 'ignoré' : etiquette(ligne)}
          </span>
        </button>
      </div>
      {refusee && ligne.ordreChange && (
        <p className="px-3 pb-2 text-xs text-muted-foreground">
          Il garde sa place actuelle : l'ordre du chapitre peut devenir ambigu.
        </p>
      )}
      {ouverte && (
        <div id={idDetail} className="flex flex-col gap-2 px-3 pb-3">
          <ChampsDiff avant={avant} apres={apres} />
          {ligne.changement === 'ordre' ? (
            <p className="text-xs text-muted-foreground">
              Seule sa place dans le chapitre change, pas son texte.
            </p>
          ) : ligne.changement === 'autre' &&
            avant.content === apres.content ? (
            <p className="text-xs text-muted-foreground">
              Le texte ne change pas (réglage, place ou identifiant).
            </p>
          ) : (
            diff !== null &&
            diff.length > 0 && (
              <DiffTexte
                lignes={diff}
                ouvertParDefaut={false}
                className="max-h-80 overflow-auto"
              />
            )
          )}
        </div>
      )}
    </li>
  )
}
