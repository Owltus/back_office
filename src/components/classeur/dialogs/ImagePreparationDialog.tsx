import { useEffect, useMemo, useRef, useState } from 'react'
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop'
import type { PercentCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { Check, Crop, Loader2, RotateCcw } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Slider } from '#/components/ui/slider.tsx'
import {
  LARGEUR_MIN,
  LARGEUR_PAS,
  formaterOctets,
} from '#/lib/classeur/images.ts'
import type { PositionImage, PreparationImage } from '#/lib/classeur/images.ts'
import {
  CONTENT_WIDTH_MM,
  PAGE_WIDTH_MM,
} from '#/lib/classeur/print/constants.ts'
import { cn } from '#/lib/utils.ts'

/*
 * PRÉPARATION / RETOUCHE d'une image (refonte du 2026-09-30, demande
 * utilisateur : « redimensionner en gardant le ratio, une image prend vite
 * toute la place ; recadrer plus simplement, pouvoir la toucher pour la
 * mettre en forme »).
 *
 * Deux réglages, visibles d'un coup d'œil :
 *   - le CADRE : un rectangle que l'on tire par ses coins et ses bords
 *     (`react-image-crop`, souris et doigt), libre ou à un format donné ;
 *   - la TAILLE SUR LA PAGE : Petite / Moyenne / Grande / Pleine largeur, ou
 *     au curseur. Les proportions sont toujours gardées (seule la largeur est
 *     choisie ; la hauteur suit). Une page A4 miniature montre le résultat.
 *
 * Sert à l'AJOUT (`file`) comme à la RETOUCHE d'une image déjà placée
 * (`existante`, cliquée dans l'aperçu). Le fichier n'est ni converti ni
 * envoyé ici : le dialogue rend une `PreparationImage`.
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

const TAILLES: { valeur: number; label: string }[] = [
  { valeur: 33, label: 'Petite' },
  { valeur: 50, label: 'Moyenne' },
  { valeur: 75, label: 'Grande' },
  { valeur: 100, label: 'Pleine largeur' },
]

const POSITIONS: { key: PositionImage; label: string }[] = [
  { key: 'gauche', label: 'À gauche' },
  { key: 'centre', label: 'Au centre' },
  { key: 'droite', label: 'À droite' },
]

const CADRE_ENTIER: PercentCrop = {
  unit: '%',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
}

/** Le cadre couvre-t-il (presque) toute l'image ? */
function estEntier(c: PercentCrop): boolean {
  return c.width >= 99.5 && c.height >= 99.5
}

export function ImagePreparationDialog({
  file = null,
  existante = null,
  largeurInitiale = 100,
  positionInitiale = 'centre',
  envoi = false,
  onAnnuler,
  onValider,
}: {
  /** Nouvelle image à préparer (ajout). */
  file?: File | null
  /** Image déjà placée à retoucher : son URL locale et son nom. */
  existante?: { url: string; nom: string } | null
  /** Largeur actuelle sur la page (%), pour une retouche. */
  largeurInitiale?: number
  /** Position actuelle sur la page, pour une retouche. */
  positionInitiale?: PositionImage
  /** Envoi en cours (boutons figés, loader). */
  envoi?: boolean
  onAnnuler: () => void
  onValider: (preparation: PreparationImage) => void
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

  const imgRef = useRef<HTMLImageElement>(null)
  const [naturel, setNaturel] = useState<{ w: number; h: number } | null>(null)
  const [format, setFormat] = useState('libre')
  const [cadre, setCadre] = useState<PercentCrop>(CADRE_ENTIER)
  const [largeur, setLargeur] = useState(largeurInitiale)
  const [position, setPosition] = useState<PositionImage>(positionInitiale)
  // En pleine largeur, pas de place pour du texte à côté : centrée.
  const positionEffective: PositionImage = largeur >= 100 ? 'centre' : position

  // Remise à zéro à chaque ouverture sur une nouvelle image.
  useEffect(() => {
    setNaturel(null)
    setFormat('libre')
    setCadre(CADRE_ENTIER)
    setLargeur(largeurInitiale)
    setPosition(positionInitiale)
  }, [url, largeurInitiale, positionInitiale])

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

  function reinitialiser() {
    setFormat('libre')
    setCadre(CADRE_ENTIER)
  }

  const recadrageActif = !estEntier(cadre)

  function valider() {
    if (!naturel) return
    const preparation: PreparationImage = {
      largeur,
      position: positionEffective,
    }
    if (recadrageActif) {
      preparation.recadrage = {
        x: Math.round((cadre.x / 100) * naturel.w),
        y: Math.round((cadre.y / 100) * naturel.h),
        largeur: Math.round((cadre.width / 100) * naturel.w),
        hauteur: Math.round((cadre.height / 100) * naturel.h),
      }
    }
    onValider(preparation)
  }

  const nom = file?.name ?? existante?.nom ?? ''
  const largeurCm = ((CONTENT_WIDTH_MM * largeur) / 100 / 10)
    .toFixed(1)
    .replace('.', ',')

  return (
    <Dialog
      open={ouvert}
      onOpenChange={(o) => {
        if (!o && !envoi) onAnnuler()
      }}
    >
      <DialogContent className="flex max-h-[92dvh] flex-col gap-4 overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {retouche ? "Modifier l'image" : "Ajouter l'image"}
          </DialogTitle>
          <DialogDescription>
            {nom}
            {file ? ` · ${formaterOctets(file.size)}` : ''}
            {naturel ? ` · ${String(naturel.w)} × ${String(naturel.h)}` : ''}.
            Tirez les coins du cadre pour recadrer, puis choisissez la taille
            sur la page.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[1fr_19rem]">
          {/* Cadre de recadrage */}
          <div className="flex min-h-44 items-center justify-center overflow-hidden rounded-lg bg-black/80 p-2">
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
                  className="block max-h-[42dvh] max-w-full object-contain md:max-h-[56vh]"
                />
              </ReactCrop>
            )}
          </div>

          {/* Réglages et aperçu de la page */}
          <div className="flex flex-col gap-4">
            <Reglage
              label="Cadre"
              action={
                recadrageActif ? (
                  <button
                    type="button"
                    onClick={reinitialiser}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <RotateCcw className="size-3" />
                    Image entière
                  </button>
                ) : null
              }
            >
              <Segments
                valeur={format}
                options={FORMATS.map((f) => ({ key: f.key, label: f.label }))}
                onChange={choisirFormat}
              />
            </Reglage>

            <Reglage
              label={`Taille sur la page · ${String(largeur)} % (≈ ${largeurCm} cm)`}
            >
              <Segments
                valeur={String(largeur)}
                options={TAILLES.map((t) => ({
                  key: String(t.valeur),
                  label: t.label,
                }))}
                onChange={(k) => setLargeur(Number(k))}
              />
              <Slider
                value={[largeur]}
                min={LARGEUR_MIN}
                max={100}
                step={LARGEUR_PAS}
                onValueChange={([v]) => setLargeur(v)}
                aria-label="Taille sur la page"
                className="mt-2"
              />
            </Reglage>

            <Reglage
              label={
                largeur >= 100
                  ? 'Position · réduisez la taille pour mettre du texte à côté'
                  : 'Position · à gauche ou à droite, le texte l’entoure'
              }
            >
              <Segments
                valeur={positionEffective}
                options={POSITIONS}
                onChange={(k) => setPosition(k as PositionImage)}
                desactive={largeur >= 100}
              />
            </Reglage>

            {url && (
              <ApercuPage
                url={url}
                cadre={cadre}
                naturel={naturel}
                largeur={largeur}
                position={positionEffective}
              />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onAnnuler}
            disabled={envoi}
          >
            Annuler
          </Button>
          <Button type="button" onClick={valider} disabled={envoi || !naturel}>
            {envoi ? (
              <Loader2 className="animate-spin" />
            ) : recadrageActif ? (
              <Crop />
            ) : (
              <Check />
            )}
            {retouche ? 'Appliquer' : 'Ajouter'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Page A4 miniature : du texte figuré, puis l'image telle qu'elle sera
 * placée (recadrée, à la largeur choisie, proportions gardées) — centrée, ou
 * à gauche / à droite avec le texte qui l'entoure.
 */
function ApercuPage({
  url,
  cadre,
  naturel,
  largeur,
  position,
}: {
  url: string
  cadre: PercentCrop
  naturel: { w: number; h: number } | null
  largeur: number
  position: PositionImage
}) {
  const marge = ((PAGE_WIDTH_MM - CONTENT_WIDTH_MM) / 2 / PAGE_WIDTH_MM) * 100
  const ratio = naturel
    ? (cadre.width * naturel.w) / Math.max(1, cadre.height * naturel.h)
    : 4 / 3
  const tailleFond = `${String(10000 / Math.max(cadre.width, 1))}% ${String(10000 / Math.max(cadre.height, 1))}%`
  const decalage = (debut: number, taille: number) =>
    taille >= 99.9 ? '0%' : `${String((debut / (100 - taille)) * 100)}%`
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        Sur la page
      </span>
      <div
        aria-hidden="true"
        className="mx-auto w-40 rounded-sm bg-white shadow-sm ring-1 ring-border"
        style={{ aspectRatio: '210 / 297', padding: `${String(marge)}%` }}
      >
        <div className="flex flex-col gap-[3px]">
          <div className="mb-1 h-1.5 w-1/2 self-center rounded-full bg-neutral-300" />
          {[90, 100, 80].map((w, i) => (
            <div
              key={i}
              className="h-1 rounded-full bg-neutral-200"
              style={{ width: `${String(w)}%` }}
            />
          ))}
          <div
            className={cn(
              'my-1 self-center',
              position !== 'centre' && 'hidden',
            )}
            style={{
              width: `${String(largeur)}%`,
              aspectRatio: String(ratio),
              backgroundImage: `url("${url}")`,
              backgroundSize: tailleFond,
              backgroundPosition: `${decalage(cadre.x, cadre.width)} ${decalage(cadre.y, cadre.height)}`,
              backgroundRepeat: 'no-repeat',
            }}
          />
          {/* Texte qui suit : à côté de l'image si elle est à gauche ou à
              droite (lignes plus courtes), dessous si elle est centrée. */}
          {position === 'centre' ? (
            [100, 70].map((w, i) => (
              <div
                key={i}
                className="h-1 rounded-full bg-neutral-200"
                style={{ width: `${String(w)}%` }}
              />
            ))
          ) : (
            <div
              className={cn(
                'flex items-start gap-1.5',
                position === 'droite' && 'flex-row-reverse',
              )}
            >
              <div
                className="shrink-0"
                style={{
                  width: `${String(largeur)}%`,
                  aspectRatio: String(ratio),
                  backgroundImage: `url("${url}")`,
                  backgroundSize: tailleFond,
                  backgroundPosition: `${decalage(cadre.x, cadre.width)} ${decalage(cadre.y, cadre.height)}`,
                  backgroundRepeat: 'no-repeat',
                }}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                {[100, 95, 100, 85, 100, 60].map((w, i) => (
                  <div
                    key={i}
                    className="h-1 rounded-full bg-neutral-200"
                    style={{ width: `${String(w)}%` }}
                  />
                ))}
              </div>
            </div>
          )}
          {position !== 'centre' &&
            [100, 75].map((w, i) => (
              <div
                key={`fin-${String(i)}`}
                className="h-1 rounded-full bg-neutral-200"
                style={{ width: `${String(w)}%` }}
              />
            ))}
        </div>
      </div>
    </div>
  )
}

function Reglage({
  label,
  action,
  children,
}: {
  label: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        {action}
      </div>
      {children}
    </div>
  )
}

function Segments({
  valeur,
  options,
  onChange,
  desactive = false,
}: {
  valeur: string
  options: { key: string; label: string }[]
  onChange: (key: string) => void
  desactive?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap gap-1 rounded-md border border-border p-0.5',
        desactive && 'opacity-50',
      )}
    >
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={valeur === o.key}
          disabled={desactive}
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
