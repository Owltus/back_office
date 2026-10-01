import { useEffect, useMemo, useRef, useState } from 'react'
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop'
import type { PercentCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { Check, Crop, Info, Loader2, Undo2 } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Input } from '#/components/ui/input.tsx'
import type { Disposition } from '#/lib/classeur/disposition.ts'
import { dimensionsReduites, formaterOctets } from '#/lib/classeur/images.ts'
import type {
  AjustementImage,
  CadreImage,
  PreparationImage,
  TailleImage,
} from '#/lib/classeur/images.ts'
import { estLegendeGenerique } from '#/lib/classeur/legende.ts'
import { boiteSurPage, conseilsImage } from '#/lib/classeur/miseEnPageImage.ts'
import {
  CONTENT_WIDTH_MM,
  PAGE_WIDTH_MM,
} from '#/lib/classeur/print/constants.ts'
import { cn } from '#/lib/utils.ts'

/*
 * MISE EN PAGE D'UNE IMAGE (refonte du 2026-10-01, retour utilisateur :
 * « une belle interface n'est rien, regarde comment font les autres ») —
 * d'après Word (dispositions en vignettes dessinées), Google Docs et
 * WordPress (barre au clic + réglages complets), Medium (tailles en paliers
 * dessinés), Notion (masquer ce qui n'a pas de sens), Canva (remplir la
 * case). S'ouvre à l'AJOUT d'une image et par « Plus de réglages… » de la
 * barre flottante.
 *
 *   à gauche  l'APERÇU de la page, en direct (ou l'outil de recadrage) ;
 *   à droite  Disposition (3 vignettes) · Taille (paliers) · Recadrage
 *             (non destructif) · Légende · Dans la case (planche seulement).
 *
 * Le fichier n'est ni converti ni envoyé ici : le dialogue rend une
 * `PreparationImage` (disposition comprise).
 */

const FORMATS: {
  key: string
  label: string
  valeur: number | 'libre' | 'original'
}[] = [
  { key: 'libre', label: 'Libre', valeur: 'libre' },
  { key: 'original', label: 'Original', valeur: 'original' },
  { key: '1:1', label: 'Carré', valeur: 1 },
  { key: '4:3', label: '4:3', valeur: 4 / 3 },
  { key: '16:9', label: '16:9', valeur: 16 / 9 },
]

/** Paliers de taille ; la barre dessine la largeur relative (Medium). */
const TAILLES_CENTRE: { key: TailleImage; label: string; barre: number }[] = [
  { key: 'auto', label: 'Auto', barre: 0 },
  { key: 'petite', label: 'Petite', barre: 33 },
  { key: 'moyenne', label: 'Moyenne', barre: 50 },
  { key: 'grande', label: 'Grande', barre: 75 },
  { key: 'pleine', label: 'Pleine largeur', barre: 100 },
]
/** À côté du texte : largeur de la colonne photo. */
const TAILLES_COTE: { key: TailleImage; label: string; barre: number }[] = [
  { key: 'petite', label: 'Petite', barre: 25 },
  { key: 'moyenne', label: 'Moyenne', barre: 33 },
  { key: 'grande', label: 'Grande', barre: 45 },
]
const COLONNE: Record<string, { largeur: number; hmax: number }> = {
  petite: { largeur: 25, hmax: 45 },
  moyenne: { largeur: 33, hmax: 60 },
  grande: { largeur: 45, hmax: 90 },
}

const CADRE_ENTIER: PercentCrop = {
  unit: '%',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
}

function estEntier(c: PercentCrop): boolean {
  return c.width >= 99.5 && c.height >= 99.5
}

function versCrop(c: CadreImage | null): PercentCrop {
  return c
    ? { unit: '%', x: c.x, y: c.y, width: c.largeur, height: c.hauteur }
    : CADRE_ENTIER
}

export function ImagePreparationDialog({
  file = null,
  existante = null,
  tailleInitiale = 'auto',
  legendeInitiale = '',
  cadreInitial = null,
  estPhotoExistante = false,
  ajustementInitial = 'remplir',
  dispositionInitiale = 'centre',
  recadrerDOffice = false,
  contexte = 'page',
  envoi = false,
  onAnnuler,
  onValider,
}: {
  /** Nouvelle image à préparer (ajout). */
  file?: File | null
  /** Image déjà placée à retoucher : son URL locale et son nom. */
  existante?: { url: string; nom: string } | null
  tailleInitiale?: TailleImage
  /** Légende actuelle (une légende générique est vidée). */
  legendeInitiale?: string
  /** Cadre actuel (en % de l'image entière). */
  cadreInitial?: CadreImage | null
  /** Retouche : l'image est une photo (`data-genre`), pas une capture. */
  estPhotoExistante?: boolean
  /** Dans une planche : remplir la case (défaut) ou image entière. */
  ajustementInitial?: AjustementImage
  /** Centrée, ou à côté du texte (gauche / droite). */
  dispositionInitiale?: Disposition
  /** Ouvrir directement sur l'outil de recadrage (barre flottante). */
  recadrerDOffice?: boolean
  /** Dans une planche, ni disposition ni taille : la case décide. */
  contexte?: 'page' | 'planche'
  envoi?: boolean
  onAnnuler: () => void
  onValider: (
    preparation: PreparationImage & { disposition: Disposition },
  ) => void
}) {
  const urlFichier = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  )
  useEffect(() => {
    return () => {
      if (urlFichier) URL.revokeObjectURL(urlFichier)
    }
  }, [urlFichier])
  const url = urlFichier ?? existante?.url ?? null
  const ouvert = url !== null
  const retouche = file === null && existante !== null
  const photo =
    file !== null
      ? /jpe?g|hei[cf]/i.test(file.type || file.name)
      : estPhotoExistante

  const imgRef = useRef<HTMLImageElement>(null)
  const [naturel, setNaturel] = useState<{ w: number; h: number } | null>(null)
  const [format, setFormat] = useState('libre')
  const [cadre, setCadre] = useState<PercentCrop>(CADRE_ENTIER)
  const [cadreAvant, setCadreAvant] = useState<PercentCrop>(CADRE_ENTIER)
  const [recadrage, setRecadrage] = useState(false)
  const [taille, setTaille] = useState<TailleImage>(tailleInitiale)
  const [legende, setLegende] = useState('')
  const [ajustement, setAjustement] =
    useState<AjustementImage>(ajustementInitial)
  const [disposition, setDisposition] =
    useState<Disposition>(dispositionInitiale)

  // Remise à zéro à chaque ouverture : tout repart de l'état de l'image.
  useEffect(() => {
    setNaturel(null)
    setFormat('libre')
    setCadre(versCrop(cadreInitial))
    setCadreAvant(versCrop(cadreInitial))
    setRecadrage(recadrerDOffice)
    setTaille(tailleInitiale)
    setAjustement(ajustementInitial)
    setDisposition(dispositionInitiale)
    setLegende(estLegendeGenerique(legendeInitiale) ? '' : legendeInitiale)
  }, [
    url,
    tailleInitiale,
    legendeInitiale,
    cadreInitial,
    ajustementInitial,
    dispositionInitiale,
    recadrerDOffice,
  ])

  const aCote = disposition !== 'centre'
  // Les tailles proposées dépendent de la disposition (Notion : jamais un
  // choix sans effet) ; une taille hors de la liste est ramenée au plus près.
  const tailleEffective: TailleImage = aCote
    ? taille === 'petite' || taille === 'grande'
      ? taille
      : taille === 'pleine'
        ? 'grande'
        : 'moyenne'
    : taille

  const aspectFormat = (key: string, n = naturel): number | undefined => {
    const f = FORMATS.find((x) => x.key === key)?.valeur
    if (f === undefined || f === 'libre') return undefined
    if (f === 'original') return n ? n.w / n.h : undefined
    return f
  }

  function choisirFormat(key: string) {
    setFormat(key)
    const aspect = aspectFormat(key)
    const img = imgRef.current
    if (aspect === undefined || !img) return
    const { width, height } = img
    setCadre(
      centerCrop(
        makeAspectCrop({ unit: '%', width: 90 }, aspect, width, height),
        width,
        height,
      ),
    )
  }

  const recadree = !estEntier(cadre)

  // Zone cadrée de la copie d'AFFICHAGE (image entière réduite à 1600 px) :
  // c'est elle que la page montrera.
  const affichage = naturel ? dimensionsReduites(naturel.w, naturel.h) : null
  const finale = affichage
    ? {
        largeur: Math.max(
          1,
          Math.round((cadre.width / 100) * affichage.largeur),
        ),
        hauteur: Math.max(
          1,
          Math.round((cadre.height / 100) * affichage.hauteur),
        ),
      }
    : null
  const conseils = finale
    ? conseilsImage(finale.largeur, finale.hauteur, { photo })
    : []

  function valider() {
    if (!naturel) return
    onValider({
      taille: contexte === 'planche' ? 'auto' : tailleEffective,
      legende: legende.trim(),
      ajustement: contexte === 'planche' ? ajustement : 'remplir',
      disposition: contexte === 'planche' ? 'centre' : disposition,
      // Un RÉGLAGE (en % de l'image entière), jamais appliqué au fichier.
      cadre: recadree
        ? {
            x: cadre.x,
            y: cadre.y,
            largeur: cadre.width,
            hauteur: cadre.height,
          }
        : null,
    })
  }

  const nom = file?.name ?? existante?.nom ?? ''

  return (
    <Dialog
      open={ouvert}
      onOpenChange={(o) => {
        if (!o && !envoi) onAnnuler()
      }}
    >
      <DialogContent className="flex max-h-[94dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>Mise en page de l'image</DialogTitle>
          <DialogDescription className="truncate">
            {nom}
            {file ? ` · ${formaterOctets(file.size)}` : ''}
            {naturel ? ` · ${String(naturel.w)} × ${String(naturel.h)} px` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:overflow-hidden">
          {/* Aperçu (ou outil de recadrage) */}
          <div className="flex min-h-64 flex-col gap-3 border-b border-border bg-muted/30 p-4 md:border-r md:border-b-0">
            {recadrage ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Segments
                    valeur={format}
                    options={FORMATS.map((f) => ({
                      key: f.key,
                      label: f.label,
                    }))}
                    onChange={choisirFormat}
                  />
                  <span className="text-xs text-muted-foreground">
                    L'image d'origine est conservée
                  </span>
                </div>
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-black/80 p-2">
                  {url && (
                    <ReactCrop
                      crop={cadre}
                      onChange={(_, pourcent) => setCadre(pourcent)}
                      aspect={aspectFormat(format)}
                      keepSelection
                      ruleOfThirds
                      minWidth={24}
                      minHeight={24}
                      className="max-w-full"
                    >
                      <img
                        ref={imgRef}
                        src={url}
                        alt={nom}
                        onLoad={(e) =>
                          setNaturel({
                            w: e.currentTarget.naturalWidth,
                            h: e.currentTarget.naturalHeight,
                          })
                        }
                        className="block max-h-[52dvh] max-w-full object-contain"
                      />
                    </ReactCrop>
                  )}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFormat('libre')
                      setCadre(CADRE_ENTIER)
                    }}
                  >
                    <Undo2 />
                    Image entière
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCadre(cadreAvant)
                      setRecadrage(false)
                    }}
                  >
                    Annuler
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setCadreAvant(cadre)
                      setRecadrage(false)
                    }}
                  >
                    <Check />
                    Valider le recadrage
                  </Button>
                </div>
              </>
            ) : (
              <>
                <span className={TITRE_SECTION}>Aperçu de la page</span>
                <div className="flex flex-1 items-center justify-center">
                  {url && (
                    <ApercuPage
                      url={url}
                      cadre={cadre}
                      disposition={
                        contexte === 'planche' ? 'centre' : disposition
                      }
                      taille={tailleEffective}
                      boite={
                        finale
                          ? boiteSurPage(
                              finale.largeur,
                              finale.hauteur,
                              tailleEffective,
                              {
                                photo,
                              },
                            )
                          : null
                      }
                      ratio={finale ? finale.largeur / finale.hauteur : 4 / 3}
                      legende={legende.trim()}
                      onNaturel={setNaturel}
                    />
                  )}
                </div>
              </>
            )}
          </div>

          {/* Réglages */}
          <div className="flex flex-col gap-5 p-5 md:overflow-y-auto">
            {contexte === 'page' ? (
              <>
                <Section titre="Disposition">
                  <div
                    role="radiogroup"
                    aria-label="Disposition"
                    className="grid grid-cols-3 gap-2"
                  >
                    {(
                      [
                        ['centre', 'Au centre'],
                        ['gauche', 'À gauche, texte à droite'],
                        ['droite', 'À droite, texte à gauche'],
                      ] as const
                    ).map(([key, label]) => {
                      const impossible = key !== 'centre' && taille === 'pleine'
                      return (
                        <VignetteDisposition
                          key={key}
                          disposition={key}
                          label={label}
                          choisie={disposition === key}
                          desactivee={impossible}
                          raison="Pas de place pour le texte en pleine largeur"
                          onChoisir={() => setDisposition(key)}
                        />
                      )
                    })}
                  </div>
                </Section>

                <Section
                  titre={aCote ? 'Largeur de la colonne photo' : 'Taille'}
                >
                  <PaliersTaille
                    options={aCote ? TAILLES_COTE : TAILLES_CENTRE}
                    valeur={tailleEffective}
                    onChange={setTaille}
                  />
                  {!aCote && tailleEffective === 'auto' && (
                    <p className="text-xs text-muted-foreground">
                      S'adapte à l'image : une photo fait 9 cm de haut au plus,
                      une capture garde sa taille pour rester lisible.
                    </p>
                  )}
                </Section>
              </>
            ) : (
              <Section titre="Dans la case de la planche">
                <div
                  role="radiogroup"
                  aria-label="Dans la case"
                  className="grid grid-cols-2 gap-2"
                >
                  <VignetteCase
                    mode="remplir"
                    label="Remplir la case"
                    choisie={ajustement === 'remplir'}
                    onChoisir={() => setAjustement('remplir')}
                  />
                  <VignetteCase
                    mode="entiere"
                    label="Image entière"
                    choisie={ajustement === 'entiere'}
                    onChoisir={() => setAjustement('entiere')}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {ajustement === 'remplir'
                    ? 'Ce qui dépasse est masqué, jamais coupé. Recadrez au format 4:3 pour choisir la partie visible.'
                    : 'La photo est montrée entière ; des bandes restent si les formats diffèrent.'}
                </p>
              </Section>
            )}

            <Section titre="Recadrage">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">
                  {recadree ? 'Recadrée' : 'Image entière'}
                </span>
                <div className="flex gap-2">
                  {recadree && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCadre(CADRE_ENTIER)
                        setCadreAvant(CADRE_ENTIER)
                      }}
                    >
                      <Undo2 />
                      Image entière
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCadreAvant(cadre)
                      setRecadrage(true)
                    }}
                    disabled={recadrage}
                  >
                    <Crop />
                    Recadrer…
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Recadrer ne coupe jamais la photo : l'image d'origine est
                conservée en entier.
              </p>
            </Section>

            <Section titre="Légende">
              <Input
                value={legende}
                onChange={(e) => setLegende(e.target.value)}
                placeholder="Ex. : Boîte à clés, entrée de service"
                maxLength={160}
                aria-label="Légende, imprimée sous l'image"
              />
              <p className="text-xs text-muted-foreground">
                Imprimée sous l'image. Dites ce qu'elle montre.
              </p>
            </Section>

            {conseils.length > 0 && (
              <ul className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/40 p-3 text-xs">
                {conseils.map((c) => (
                  <li key={c} className="flex gap-1.5">
                    <Info className="mt-px size-3.5 shrink-0 text-muted-foreground" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onAnnuler}
            disabled={envoi}
          >
            Annuler
          </Button>
          <Button
            type="button"
            onClick={valider}
            disabled={envoi || !naturel || recadrage}
          >
            {envoi ? <Loader2 className="animate-spin" /> : <Check />}
            {retouche ? 'Appliquer' : 'Insérer'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const TITRE_SECTION =
  'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'

function Section({
  titre,
  children,
}: {
  titre: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className={TITRE_SECTION}>{titre}</h3>
      {children}
    </section>
  )
}

/** Carte sélectionnable : anneau, fond teinté, pastille ✓ (états clairs). */
function Carte({
  label,
  choisie,
  desactivee = false,
  raison,
  onChoisir,
  children,
}: {
  label: string
  choisie: boolean
  desactivee?: boolean
  raison?: string
  onChoisir: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={choisie}
      disabled={desactivee}
      title={desactivee ? raison : undefined}
      onClick={onChoisir}
      className={cn(
        'group relative flex flex-col items-center gap-1.5 rounded-lg border border-border p-2 text-center transition-colors',
        'hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        choisie && 'border-primary bg-primary/10 ring-1 ring-primary',
        desactivee && 'pointer-events-none opacity-40',
      )}
    >
      {choisie && (
        <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3" />
        </span>
      )}
      {children}
      <span className="text-[11px] leading-tight">{label}</span>
    </button>
  )
}

/** Vignette dessinée de disposition (Word) : traits = texte, bloc = image. */
function VignetteDisposition({
  disposition,
  ...props
}: {
  disposition: Disposition
  label: string
  choisie: boolean
  desactivee?: boolean
  raison?: string
  onChoisir: () => void
}) {
  const trait = 'fill-muted-foreground/35'
  const bloc = 'fill-primary/60'
  return (
    <Carte {...props}>
      <svg viewBox="0 0 64 48" className="h-12 w-16" aria-hidden="true">
        <rect
          x="0"
          y="0"
          width="64"
          height="48"
          rx="3"
          className="fill-background"
        />
        {disposition === 'centre' ? (
          <>
            {[5, 9].map((y) => (
              <rect
                key={y}
                x="6"
                y={y}
                width="52"
                height="2"
                rx="1"
                className={trait}
              />
            ))}
            <rect
              x="18"
              y="14"
              width="28"
              height="20"
              rx="1.5"
              className={bloc}
            />
            {[38, 42].map((y) => (
              <rect
                key={y}
                x="6"
                y={y}
                width={y === 42 ? 34 : 52}
                height="2"
                rx="1"
                className={trait}
              />
            ))}
          </>
        ) : (
          <>
            <rect
              x={disposition === 'gauche' ? 6 : 36}
              y="8"
              width="22"
              height="22"
              rx="1.5"
              className={bloc}
            />
            {[8, 13, 18, 23, 28].map((y) => (
              <rect
                key={y}
                x={disposition === 'gauche' ? 32 : 6}
                y={y}
                width={y === 28 ? 16 : 26}
                height="2"
                rx="1"
                className={trait}
              />
            ))}
            {[36, 41].map((y) => (
              <rect
                key={y}
                x="6"
                y={y}
                width={y === 41 ? 30 : 52}
                height="2"
                rx="1"
                className={trait}
              />
            ))}
          </>
        )}
      </svg>
    </Carte>
  )
}

/** Vignette « dans la case » (Canva) : remplir ou image entière. */
function VignetteCase({
  mode,
  ...props
}: {
  mode: AjustementImage
  label: string
  choisie: boolean
  onChoisir: () => void
}) {
  return (
    <Carte {...props}>
      <svg viewBox="0 0 64 48" className="h-12 w-16" aria-hidden="true">
        <rect
          x="8"
          y="6"
          width="48"
          height="36"
          rx="2"
          className="fill-muted-foreground/20"
        />
        {mode === 'remplir' ? (
          <rect
            x="8"
            y="6"
            width="48"
            height="36"
            rx="2"
            className="fill-primary/60"
          />
        ) : (
          <rect
            x="20"
            y="6"
            width="24"
            height="36"
            rx="1.5"
            className="fill-primary/60"
          />
        )}
      </svg>
    </Carte>
  )
}

/** Paliers de taille, chacun avec sa barre de largeur dessinée (Medium). */
function PaliersTaille({
  options,
  valeur,
  onChange,
}: {
  options: { key: TailleImage; label: string; barre: number }[]
  valeur: TailleImage
  onChange: (t: TailleImage) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Taille"
      className="grid gap-1 rounded-lg border border-border p-1"
      style={{
        gridTemplateColumns: `repeat(${String(options.length)}, minmax(0, 1fr))`,
      }}
    >
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={valeur === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            'flex min-h-11 flex-col items-center justify-center gap-1 rounded-md px-1 py-1.5 text-[11px] leading-tight transition-colors',
            valeur === o.key
              ? 'bg-primary/15 text-foreground ring-1 ring-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          <span className="flex h-1.5 w-full items-center rounded-full bg-muted-foreground/15">
            {o.barre > 0 ? (
              <span
                className="mx-auto h-1.5 rounded-full bg-primary/70"
                style={{ width: `${String(o.barre)}%` }}
              />
            ) : (
              <span className="mx-auto h-1.5 w-1/2 rounded-full border border-dashed border-primary/70" />
            )}
          </span>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Segments({
  valeur,
  options,
  onChange,
}: {
  valeur: string
  options: { key: string; label: string }[]
  onChange: (key: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-md border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={valeur === o.key}
          className={cn(
            'min-h-8 rounded px-2.5 py-1 text-xs transition-colors',
            valeur === o.key
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * La page A4 miniature, À L'ÉCHELLE, comme elle sera imprimée : l'image
 * centrée (boîte calculée comme `classeur.css`) ou dans sa colonne à côté
 * du texte, avec sa légende. Charge aussi l'image pour en lire la taille.
 */
function ApercuPage({
  url,
  cadre,
  disposition,
  taille,
  boite,
  ratio,
  legende,
  onNaturel,
}: {
  url: string
  cadre: PercentCrop
  disposition: Disposition
  taille: TailleImage
  boite: { largeur: number; hauteur: number } | null
  ratio: number
  legende: string
  onNaturel: (n: { w: number; h: number }) => void
}) {
  const marge = ((PAGE_WIDTH_MM - CONTENT_WIDTH_MM) / 2 / PAGE_WIDTH_MM) * 100
  const fond = {
    backgroundImage: `url("${url}")`,
    backgroundSize: `${String(10000 / Math.max(cadre.width, 1))}% ${String(10000 / Math.max(cadre.height, 1))}%`,
    backgroundPosition: `${decalage(cadre.x, cadre.width)} ${decalage(cadre.y, cadre.height)}`,
    backgroundRepeat: 'no-repeat',
  }
  const ligne = (w: number, k: string) => (
    <div
      key={k}
      className="h-1 rounded-full bg-neutral-200"
      style={{ width: `${String(w)}%` }}
    />
  )
  const col = COLONNE[taille] ?? COLONNE.moyenne
  // Largeur de l'image dans sa colonne, bornée par la hauteur max de l'étape.
  const largeurCol = Math.min(
    100,
    ((col.hmax * ratio) / ((CONTENT_WIDTH_MM * col.largeur) / 100)) * 100,
  )
  return (
    <div className="w-full max-w-64">
      {/* Image invisible : sert à lire la taille naturelle. */}
      <img
        src={url}
        alt=""
        className="hidden"
        onLoad={(e) =>
          onNaturel({
            w: e.currentTarget.naturalWidth,
            h: e.currentTarget.naturalHeight,
          })
        }
      />
      <div
        aria-hidden="true"
        className="rounded-sm bg-white shadow-md ring-1 ring-black/5"
        style={{ aspectRatio: '210 / 297', padding: `${String(marge)}%` }}
      >
        <div className="flex flex-col gap-[3px]">
          <div className="mb-1.5 h-1.5 w-1/2 self-center rounded-full bg-neutral-300" />
          {[92, 100, 76].map((w, i) => ligne(w, `a${String(i)}`))}
          <div className="h-1" />
          {disposition === 'centre' ? (
            <>
              {boite && (
                <div
                  className="self-center transition-all duration-150"
                  style={{
                    width: `${String((boite.largeur / CONTENT_WIDTH_MM) * 100)}%`,
                    aspectRatio: `${String(boite.largeur)} / ${String(boite.hauteur)}`,
                    ...fond,
                  }}
                />
              )}
              <Legende legende={legende} />
              <div className="h-1" />
              {[100, 64].map((w, i) => ligne(w, `b${String(i)}`))}
            </>
          ) : (
            <div
              className={cn(
                'flex items-start gap-1.5',
                disposition === 'gauche' && 'flex-row-reverse',
              )}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                {[100, 96, 100, 88, 100, 60].map((w, i) =>
                  ligne(w, `c${String(i)}`),
                )}
              </div>
              <div
                className="flex shrink-0 flex-col items-center transition-all duration-150"
                style={{ width: `${String(col.largeur)}%` }}
              >
                <div
                  style={{
                    width: `${String(largeurCol)}%`,
                    aspectRatio: String(ratio),
                    ...fond,
                  }}
                />
                <Legende legende={legende} />
              </div>
            </div>
          )}
          <div className="h-1" />
          {[100, 84].map((w, i) => ligne(w, `d${String(i)}`))}
        </div>
      </div>
    </div>
  )
}

function Legende({ legende }: { legende: string }) {
  return (
    <div
      className={cn(
        'mt-0.5 h-[3px] w-1/3 self-center rounded-full bg-neutral-300',
        legende === '' && 'invisible',
      )}
    />
  )
}

function decalage(debut: number, taille: number): string {
  return taille >= 99.9 ? '0%' : `${String((debut / (100 - taille)) * 100)}%`
}
