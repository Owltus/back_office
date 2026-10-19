import { Fragment, useId, useMemo } from 'react'
import { ChevronRight, TriangleAlert } from 'lucide-react'

import {
  ChampsDiff,
  DiffTexte,
} from '#/components/classeur/detail/DiffTexte.tsx'
import { useImages } from '#/components/classeur/hooks/useImages.ts'
import { Button } from '#/components/ui/button.tsx'
import { bilan, comparerLignes } from '#/lib/classeur/diff.ts'
import type { ChapitreLigne, LigneImport } from '#/lib/classeur/merge/portee.ts'
import { relireLigneImport } from '#/lib/classeur/relecture.ts'
import type { Alerte, InfoImage } from '#/lib/classeur/relecture.ts'
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

/**
 * État de la médiathèque pour la relecture (étape 2) : tant qu'elle n'est
 * pas lue, AUCUNE alerte d'image (elles passeraient toutes pour inventées).
 */
export type EtatImages = 'pret' | 'en-cours' | 'indisponible'

/**
 * Médiathèque du classeur pour la relecture, lue à l'OUVERTURE du dialogue
 * seulement (`actif`) : les deux dialogues d'import (classeur complet,
 * chapitre ou document) la partagent.
 */
export function useImagesRelecture(
  classeurId: number | null,
  actif: boolean,
): {
  images: ReadonlyMap<string, InfoImage> | null
  etatImages: EtatImages
} {
  const imagesQ = useImages(classeurId ?? Number.NaN, actif)
  const images = useMemo(
    () =>
      imagesQ.data
        ? new Map(
            imagesQ.data.map((i) => [
              i.chemin.toLowerCase(),
              { largeur: i.largeur, hauteur: i.hauteur, nom: i.nom },
            ]),
          )
        : null,
    [imagesQ.data],
  )
  const etatImages: EtatImages = imagesQ.isPending
    ? 'en-cours'
    : images === null
      ? 'indisponible'
      : 'pret'
  return { images, etatImages }
}

/**
 * Version que prendra un document existant : « version prévue X.Y · raison »,
 * ou « version inchangée (X.Y) » quand le numéro ne bouge pas (une retouche
 * de forme garde le numéro : annoncer « prévue 3.1 » d'un document déjà en
 * 3.1 laissait croire à un changement).
 */
export function texteVersion(l: LigneImport): string | null {
  if (l.kind !== 'document') return null
  if (l.genre === 'creation') return 'version 1.0 · nouveau document'
  if (l.genre === 'suppression' || l.numero === null) return null
  const e = evolutionVersion(l.avant, l.apres, l.numero)
  if (
    e.suivante.majeure === l.numero.majeure &&
    e.suivante.mineure === l.numero.mineure
  )
    return `version inchangée (${libelleVersion(l.numero)})${e.raison === '' ? '' : ` · ${e.raison}`}`
  return `version prévue ${libelleVersion(e.suivante)}${e.raison === '' ? '' : ` · ${e.raison}`}`
}

function points(n: number): string {
  return `${String(n)} ${n > 1 ? 'points à vérifier' : 'point à vérifier'}`
}

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
      // D4 : le réglage changé se lit en clair (« Mensuel → Annuel »).
      return l.changement === 'ordre'
        ? 'déplacé'
        : l.changement === 'autre'
          ? (l.reglage ?? 'réglage modifié')
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
  images = null,
  etatImages = 'pret',
  chapitres,
  verrous,
}: {
  lignes: readonly LigneImport[]
  refuses: ReadonlySet<string>
  onBasculerRefus: (cle: string) => void
  ouvertes: ReadonlySet<string>
  onOuvertes: (ouvertes: ReadonlySet<string>) => void
  disabled: boolean
  /** Médiathèque par chemin en minuscules ; `null` tant qu'elle n'est pas lue. */
  images?: ReadonlyMap<string, InfoImage> | null
  etatImages?: EtatImages
  /**
   * Classeur complet : le chapitre de chaque ligne (même ordre que
   * `lignes`). Présent, l'aperçu est GROUPÉ par chapitre, dans l'ordre de
   * première apparition ; absent (chapitre ou document seul), une liste.
   */
  chapitres?: readonly ChapitreLigne[]
  /** Lignes qu'on ne peut pas refuser (clé → raison affichée). */
  verrous?: ReadonlyMap<string, string>
}) {
  const ids = lignes.map(idLigne)
  const toutOuvert = ids.length > 0 && ids.every((id) => ouvertes.has(id))
  // Relecture (étape 2) : une fois par ligne, recalculée seulement quand
  // l'aperçu ou la médiathèque change (pas à chaque case cochée).
  const alertes = useMemo(
    () =>
      lignes.map((l) =>
        relireLigneImport(l, etatImages === 'pret' ? images : null),
      ),
    [lignes, images, etatImages],
  )
  const signalees = lignes.filter(
    (l, i) =>
      (alertes[i]?.length ?? 0) > 0 && !(l.cle !== null && refuses.has(l.cle)),
  )
  const aVerifier = signalees.length
  // Étape 7 : toutes les natures sont relues ; « documents » seulement si
  // l'en-tête ne parle que de documents.
  const queDesDocuments = signalees.every((l) => l.kind === 'document')
  // Les images ne concernent que le texte d'un document.
  const relus = lignes.some(
    (l) =>
      l.kind === 'document' &&
      l.genre !== 'suppression' &&
      l.genre !== 'chapitre',
  )
  return (
    <div className="flex flex-col gap-1">
      {(aVerifier > 0 || (relus && etatImages !== 'pret')) && (
        <div className="flex flex-col gap-0.5 text-xs">
          {aVerifier > 0 && (
            <p className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <TriangleAlert className="size-3.5 shrink-0" />
              {aVerifier > 1
                ? `${String(aVerifier)} ${queDesDocuments ? 'documents' : 'éléments'} ont des points à vérifier`
                : `1 ${queDesDocuments ? 'document' : 'élément'} a des points à vérifier`}
              . L'import reste possible.
            </p>
          )}
          {relus && etatImages === 'en-cours' && (
            <p className="text-muted-foreground">
              Vérification des images en cours…
            </p>
          )}
          {relus && etatImages === 'indisponible' && (
            <p className="text-muted-foreground">
              Images non vérifiées : la médiathèque n'a pas pu être lue.
            </p>
          )}
        </div>
      )}
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
      {groupes(lignes.length, chapitres).map((g) => (
        <Fragment key={g.cle}>
          {g.libelle !== null && (
            <h4 className="mt-2 truncate text-xs font-semibold text-muted-foreground first:mt-0">
              {g.libelle}
            </h4>
          )}
          <ul
            aria-label={g.libelle ?? undefined}
            className="flex flex-col divide-y divide-border rounded-md border border-border"
          >
            {g.indices.map((i) => {
              const l = lignes[i]
              const id = ids[i]
              return (
                <LigneApercu
                  key={id}
                  ligne={l}
                  alertes={alertes[i]}
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
                  verrou={l.cle === null ? undefined : verrous?.get(l.cle)}
                />
              )
            })}
          </ul>
        </Fragment>
      ))}
    </div>
  )
}

/** Indices des lignes par chapitre, dans l'ordre de première apparition. */
function groupes(
  n: number,
  chapitres: readonly ChapitreLigne[] | undefined,
): Array<{ cle: string; libelle: string | null; indices: number[] }> {
  const tous = Array.from({ length: n }, (_, i) => i)
  if (chapitres === undefined)
    return [{ cle: 'tout', libelle: null, indices: tous }]
  const m = new Map<
    string,
    { cle: string; libelle: string | null; indices: number[] }
  >()
  for (const i of tous) {
    const c = chapitres.at(i) ?? { cle: '?', libelle: 'Sans chapitre' }
    let g = m.get(c.cle)
    if (!g) {
      g = { cle: c.cle, libelle: c.libelle, indices: [] }
      m.set(c.cle, g)
    }
    g.indices.push(i)
  }
  return [...m.values()]
}

function LigneApercu({
  ligne,
  alertes,
  refusee,
  onBasculerRefus,
  ouverte,
  onBasculer,
  disabled,
  verrou,
}: {
  ligne: LigneImport
  /** Relecture du nouveau texte ; `null` = ligne non relue. */
  alertes: readonly Alerte[] | null
  refusee: boolean
  onBasculerRefus: (cle: string) => void
  ouverte: boolean
  onBasculer: () => void
  disabled: boolean
  /** Raison pour laquelle la ligne ne peut pas être refusée. */
  verrou?: string
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
  const version = useMemo(() => texteVersion(ligne), [ligne])

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
              disabled={disabled || verrou !== undefined}
              aria-label={`Importer ${titre}`}
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
              {ligne.reglage !== undefined &&
                !(
                  ligne.genre === 'modification' && ligne.changement === 'autre'
                ) &&
                ` · ${ligne.reglage}`}
            </span>
          </span>
          {b !== null && (b.ajouts > 0 || b.retraits > 0) && (
            <span className="shrink-0 font-mono text-xs tabular-nums">
              +{b.ajouts} −{b.retraits}
            </span>
          )}
          {alertes !== null && alertes.length > 0 && (
            <span className="flex shrink-0 items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-300">
              <TriangleAlert className="size-3" aria-hidden />
              {points(alertes.length)}
            </span>
          )}
          <span className="shrink-0 text-xs text-muted-foreground">
            {refusee ? 'ignoré' : etiquette(ligne)}
          </span>
        </button>
      </div>
      {verrou !== undefined && (
        <p className="px-3 pb-2 text-xs text-muted-foreground">{verrou}</p>
      )}
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
              {ligne.reglage !== undefined && ligne.genre !== 'creation'
                ? `Le texte ne change pas. ${ligne.kind === 'tracking_sheet' ? 'Périodicité' : 'Lignes à signer'} : ${ligne.reglage}.`
                : 'Le texte ne change pas (réglage, place ou identifiant).'}
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
          {alertes !== null && (
            <div className="flex flex-col gap-1 text-xs">
              {alertes.length > 0 && (
                <ul
                  aria-label={points(alertes.length)}
                  className="flex flex-col gap-0.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5"
                >
                  {alertes.map((a, k) => (
                    <li
                      key={`${String(a.ligne)}-${String(k)}`}
                      className="text-muted-foreground"
                    >
                      <span className="tabular-nums text-foreground">
                        {a.champ === 'titre'
                          ? 'Titre'
                          : a.champ === 'description'
                            ? 'Description'
                            : `Ligne ${String(a.ligne)}`}
                      </span>{' '}
                      · {a.message}
                    </li>
                  ))}
                </ul>
              )}
              {ligne.kind === 'document' && ligne.genre !== 'chapitre' && (
                <p className="text-muted-foreground">
                  La mise en page (pages, schémas) sera vérifiée dans l'éditeur.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  )
}
