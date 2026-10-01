import { useEffect, useMemo, useRef, useState } from 'react'
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop'
import type { PercentCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { Check, Crop, Info, Loader2, RotateCcw } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Input } from '#/components/ui/input.tsx'
import { dimensionsReduites, formaterOctets } from '#/lib/classeur/images.ts'
import { boiteSurPage, conseilsImage } from '#/lib/classeur/miseEnPageImage.ts'
import type { PreparationImage, TailleImage } from '#/lib/classeur/images.ts'
import { estLegendeGenerique } from '#/lib/classeur/legende.ts'
import {
  CONTENT_WIDTH_MM,
  PAGE_WIDTH_MM,
} from '#/lib/classeur/print/constants.ts'
import { cn } from '#/lib/utils.ts'

/*
 * PRÉPARATION / RETOUCHE d'une image (refonte du 2026-10-01, plan
 * `classeur-images-blocs` — retour utilisateur : « la mise en place des
 * images, une vraie catastrophe ; c'est l'humain qui pose souci, il faut le
 * guider »).
 *
 * Trois réglages, dans l'ordre où on les pense :
 *   - la LÉGENDE, imprimée sous l'image (vide par défaut : un nom de fichier
 *     n'en est pas une) ;
 *   - le CADRE, que l'on tire par ses coins (`react-image-crop`, souris et
 *     doigt), libre ou à un format donné ;
 *   - la TAILLE : Automatique (l'app borne largeur ET hauteur), Petite,
 *     Moyenne, Pleine largeur. Plus de curseur ni de position gauche/droite.
 * Des CONSEILS tirés de l'image elle-même (capture trop large pour être lue,
 * bandeau, image haute) et une page A4 miniature À L'ÉCHELLE montrent le
 * résultat avant de valider.
 *
 * Dans une planche de photos (`contexte="planche"`), la taille ne s'applique
 * pas (toutes les cases ont le même cadre) : le réglage est masqué.
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

const TAILLES: { key: TailleImage; label: string }[] = [
  { key: 'auto', label: 'Automatique' },
  { key: 'petite', label: 'Petite' },
  { key: 'moyenne', label: 'Moyenne' },
  { key: 'pleine', label: 'Pleine largeur' },
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
  tailleInitiale = 'auto',
  legendeInitiale = '',
  contexte = 'page',
  envoi = false,
  onAnnuler,
  onValider,
}: {
  /** Nouvelle image à préparer (ajout). */
  file?: File | null
  /** Image déjà placée à retoucher : son URL locale et son nom. */
  existante?: { url: string; nom: string } | null
  /** Taille actuelle, pour une retouche. */
  tailleInitiale?: TailleImage
  /** Légende actuelle, pour une retouche (une légende générique est vidée). */
  legendeInitiale?: string
  /** Dans une planche de photos, la taille ne s'applique pas. */
  contexte?: 'page' | 'planche'
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
  // Photo d'appareil (JPEG, HEIC) : jamais « capture trop large ».
  const photo = file !== null && /jpe?g|hei[cf]/i.test(file.type || file.name)

  const imgRef = useRef<HTMLImageElement>(null)
  const [naturel, setNaturel] = useState<{ w: number; h: number } | null>(null)
  const [format, setFormat] = useState('libre')
  const [cadre, setCadre] = useState<PercentCrop>(CADRE_ENTIER)
  const [taille, setTaille] = useState<TailleImage>(tailleInitiale)
  const [legende, setLegende] = useState('')

  // Remise à zéro à chaque ouverture sur une nouvelle image.
  useEffect(() => {
    setNaturel(null)
    setFormat('libre')
    setCadre(CADRE_ENTIER)
    setTaille(tailleInitiale)
    setLegende(estLegendeGenerique(legendeInitiale) ? '' : legendeInitiale)
  }, [url, tailleInitiale, legendeInitiale])

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

  // Dimensions de l'image telle qu'elle sera ENVOYÉE (cadrée puis réduite à
  // 1600 px de côté, `convertirEnWebp`) : c'est elle que la page affichera.
  const finale = naturel
    ? dimensionsReduites(
        Math.max(1, Math.round((cadre.width / 100) * naturel.w)),
        Math.max(1, Math.round((cadre.height / 100) * naturel.h)),
      )
    : null
  const conseils = finale
    ? conseilsImage(finale.largeur, finale.hauteur, { photo })
    : []

  function valider() {
    if (!naturel) return
    const preparation: PreparationImage = {
      taille: contexte === 'planche' ? 'auto' : taille,
      legende: legende.trim(),
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
            {naturel ? ` · ${String(naturel.w)} × ${String(naturel.h)}` : ''}
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
            <Reglage label="Légende · imprimée sous l'image">
              <Input
                value={legende}
                onChange={(e) => setLegende(e.target.value)}
                placeholder="Ex. : Vanne du by-pass, en haut à gauche"
                maxLength={160}
                aria-label="Légende"
                autoFocus={!retouche}
              />
            </Reglage>

            <Reglage
              label="Cadre · tirez les coins pour recadrer"
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

            {contexte === 'page' ? (
              <Reglage label="Taille sur la page">
                <Segments
                  valeur={taille}
                  options={TAILLES}
                  onChange={(k) => setTaille(k as TailleImage)}
                />
              </Reglage>
            ) : (
              <p className="text-xs text-muted-foreground">
                Dans une planche, toutes les photos ont le même cadre : la
                taille se règle toute seule.
              </p>
            )}

            {conseils.length > 0 && (
              <ul className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/40 p-2.5 text-xs">
                {conseils.map((c) => (
                  <li key={c} className="flex gap-1.5">
                    <Info className="mt-px size-3.5 shrink-0 text-muted-foreground" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            )}

            {url && contexte === 'page' && finale && (
              <ApercuPage
                url={url}
                cadre={cadre}
                boite={boiteSurPage(finale.largeur, finale.hauteur, taille)}
                legende={legende.trim()}
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
 * Page A4 miniature À L'ÉCHELLE : du texte figuré, puis l'image centrée telle
 * qu'elle sera imprimée (boîte calculée comme `classeur.css`) et sa légende.
 */
function ApercuPage({
  url,
  cadre,
  boite,
  legende,
}: {
  url: string
  cadre: PercentCrop
  boite: { largeur: number; hauteur: number }
  legende: string
}) {
  const marge = ((PAGE_WIDTH_MM - CONTENT_WIDTH_MM) / 2 / PAGE_WIDTH_MM) * 100
  const tailleFond = `${String(10000 / Math.max(cadre.width, 1))}% ${String(10000 / Math.max(cadre.height, 1))}%`
  const decalage = (debut: number, taille: number) =>
    taille >= 99.9 ? '0%' : `${String((debut / (100 - taille)) * 100)}%`
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        Sur la page · environ {cm(boite.largeur)} × {cm(boite.hauteur)} cm
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
            className="mt-1 self-center"
            style={{
              width: `${String((boite.largeur / CONTENT_WIDTH_MM) * 100)}%`,
              aspectRatio: `${String(boite.largeur)} / ${String(boite.hauteur)}`,
              backgroundImage: `url("${url}")`,
              backgroundSize: tailleFond,
              backgroundPosition: `${decalage(cadre.x, cadre.width)} ${decalage(cadre.y, cadre.height)}`,
              backgroundRepeat: 'no-repeat',
            }}
          />
          <div
            className={cn(
              'mb-1 h-[3px] w-1/3 self-center rounded-full bg-neutral-300',
              legende === '' && 'invisible',
            )}
          />
          {[100, 70].map((w, i) => (
            <div
              key={i}
              className="h-1 rounded-full bg-neutral-200"
              style={{ width: `${String(w)}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function cm(mm: number): string {
  return (mm / 10).toLocaleString('fr-FR', { maximumFractionDigits: 1 })
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
