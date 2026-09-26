import { useCallback, useEffect, useMemo, useState } from 'react'
import Cropper from 'react-easy-crop'
import type { Area, Point } from 'react-easy-crop'
import {
  Check,
  Crop,
  ImageUp,
  Loader2,
  RotateCcw,
  RotateCw,
} from 'lucide-react'

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
  LARGEURS_IMAGE,
  formaterOctets,
  libelleLargeur,
} from '#/lib/classeur/images.ts'
import type { PreparationImage } from '#/lib/classeur/images.ts'
import { cn } from '#/lib/utils.ts'

/*
 * PRÉPARATION d'une image avant son envoi (demande utilisateur du
 * 2026-09-26 : « option de crop avant de la pousser dans le bucket, travail
 * sur l'UX et la mise en page »).
 *
 * Trois réglages, tous facultatifs :
 *   - le CADRE : un ratio (celui de l'image, 1:1, 4:3, 3:2, 16:9, A4) que
 *     l'on déplace et zoome sur l'image (`react-easy-crop`, tactile et
 *     molette compris) ;
 *   - la ROTATION : quarts de tour, plus un redressement fin ±15° ;
 *   - la LARGEUR dans la page : pleine, trois quarts, moitié, tiers —
 *     l'image est toujours CENTRÉE (`styles/classeur.css`).
 * « Utiliser telle quelle » saute le cadre et la rotation ; la largeur
 * choisie s'applique quand même.
 *
 * Le fichier n'est ni converti ni envoyé ici : le dialogue rend une
 * `PreparationImage` que `televerserImage` applique (`lib/classeur/images.ts`).
 */

const RATIOS: { key: string; label: string; valeur: number | 'original' }[] = [
  { key: 'original', label: 'Original', valeur: 'original' },
  { key: '1:1', label: 'Carré', valeur: 1 },
  { key: '4:3', label: '4:3', valeur: 4 / 3 },
  { key: '3:2', label: '3:2', valeur: 3 / 2 },
  { key: '16:9', label: '16:9', valeur: 16 / 9 },
  { key: 'a4', label: 'A4', valeur: 210 / 297 },
]

export function ImagePreparationDialog({
  file,
  envoi = false,
  onAnnuler,
  onValider,
}: {
  /** Le fichier à préparer ; `null` = dialogue fermé. */
  file: File | null
  /** Envoi en cours (boutons figés, loader). */
  envoi?: boolean
  onAnnuler: () => void
  onValider: (preparation: PreparationImage) => void
}) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [url])

  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [ratio, setRatio] = useState<string>('original')
  const [largeur, setLargeur] = useState<number>(100)
  const [naturel, setNaturel] = useState<{ w: number; h: number } | null>(null)
  const [zone, setZone] = useState<Area | null>(null)

  // Remise à zéro à chaque nouveau fichier.
  useEffect(() => {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setRotation(0)
    setRatio('original')
    setLargeur(100)
    setNaturel(null)
    setZone(null)
  }, [file])

  const aspect =
    ratio === 'original'
      ? naturel
        ? naturel.w / naturel.h
        : 4 / 3
      : (RATIOS.find((r) => r.key === ratio)?.valeur as number)

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setZone(pixels)
  }, [])

  const tourner = (delta: number) =>
    setRotation(
      (r) => ((((r + delta) % 360) + 360) % 360) - (r + delta > 180 ? 360 : 0),
    )

  const recadrageActif =
    zone !== null &&
    naturel !== null &&
    (rotation !== 0 ||
      Math.round(zone.width) < naturel.w - 1 ||
      Math.round(zone.height) < naturel.h - 1)

  function valider(telleQuelle: boolean) {
    if (!file) return
    if (telleQuelle || !zone) {
      onValider({ largeur })
      return
    }
    onValider({
      largeur,
      rotation,
      recadrage: {
        x: Math.round(zone.x),
        y: Math.round(zone.y),
        largeur: Math.round(zone.width),
        hauteur: Math.round(zone.height),
      },
    })
  }

  return (
    <Dialog
      open={file !== null}
      onOpenChange={(o) => {
        if (!o && !envoi) onAnnuler()
      }}
    >
      <DialogContent className="flex max-h-[92vh] flex-col gap-4 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Préparer l'image</DialogTitle>
          <DialogDescription>
            {file
              ? `${file.name} · ${formaterOctets(file.size)}${naturel ? ` · ${String(naturel.w)} × ${String(naturel.h)}` : ''}. Déplacez et zoomez l'image dans le cadre ; elle sera convertie en WebP et centrée dans la page.`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="relative h-[52vh] min-h-64 w-full overflow-hidden rounded-lg bg-black/80">
          {url && (
            <Cropper
              image={url}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect}
              minZoom={1}
              maxZoom={5}
              showGrid
              objectFit="contain"
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onCropComplete}
              onMediaLoaded={(media) =>
                setNaturel({ w: media.naturalWidth, h: media.naturalHeight })
              }
            />
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Reglage label="Cadre">
            <Segments
              valeur={ratio}
              options={RATIOS.map((r) => ({ key: r.key, label: r.label }))}
              onChange={setRatio}
            />
          </Reglage>
          <Reglage label="Largeur dans la page">
            <Segments
              valeur={String(largeur)}
              options={LARGEURS_IMAGE.map((l) => ({
                key: String(l),
                label: libelleLargeur(l),
              }))}
              onChange={(v) => setLargeur(Number(v))}
            />
          </Reglage>
          <Reglage label={`Zoom × ${zoom.toFixed(1)}`}>
            <Slider
              value={[zoom]}
              min={1}
              max={5}
              step={0.05}
              onValueChange={([v]) => setZoom(v)}
              aria-label="Zoom"
            />
          </Reglage>
          <Reglage label={`Rotation ${String(Math.round(rotation))}°`}>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Quart de tour à gauche"
                onClick={() => tourner(-90)}
              >
                <RotateCcw />
              </Button>
              <Slider
                value={[redressement(rotation)]}
                min={-15}
                max={15}
                step={0.5}
                onValueChange={([v]) => setRotation(quart(rotation) + v)}
                aria-label="Redressement fin"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Quart de tour à droite"
                onClick={() => tourner(90)}
              >
                <RotateCw />
              </Button>
            </div>
          </Reglage>
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
          <Button
            type="button"
            variant="outline"
            onClick={() => valider(true)}
            disabled={envoi || !naturel}
          >
            <ImageUp />
            Utiliser telle quelle
          </Button>
          <Button
            type="button"
            onClick={() => valider(false)}
            disabled={envoi || !naturel || !zone}
          >
            {envoi ? (
              <Loader2 className="animate-spin" />
            ) : recadrageActif ? (
              <Crop />
            ) : (
              <Check />
            )}
            {recadrageActif ? 'Recadrer et ajouter' : 'Ajouter'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Le multiple de 90° le plus proche en dessous (le « quart »). */
function quart(rotation: number): number {
  return Math.round(rotation / 90) * 90
}
/** L'écart au quart de tour (redressement fin). */
function redressement(rotation: number): number {
  return rotation - quart(rotation)
}

function Reglage({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
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
            'rounded px-2.5 py-1 text-xs transition-colors',
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
