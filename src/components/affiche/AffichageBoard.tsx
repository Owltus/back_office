import { useMemo, useState } from 'react'
import { useStore } from '@tanstack/react-store'
import { ChevronDown } from 'lucide-react'

import { PrintButton } from '#/components/shared/PrintButton.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { Separator } from '#/components/ui/separator.tsx'
import { Switch } from '#/components/ui/switch.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import {
  DateField,
  Field,
  SizeSlider,
  TimeField,
} from '#/components/form/fields.tsx'
import { PosterPreview } from '#/components/affiche/Poster.tsx'
import { COLORS } from '#/lib/poster/config.ts'
import type { ColorKey } from '#/lib/poster/config.ts'
import {
  getAvailableIcons,
  getIconName,
  getIconSvg,
} from '#/lib/poster/icons.ts'
import {
  calculateAutoSizes,
  calculateIconSize,
} from '#/lib/poster/sizeCalculator.ts'
import { getTemplatesList } from '#/lib/poster/templates.ts'
import { hasEnglishContent } from '#/lib/poster/types.ts'
import {
  afficheStore,
  applyAfficheTemplate,
  setAffiche,
} from '#/lib/afficheStore.ts'
import { cn } from '#/lib/utils.ts'
import { printWithTitle } from '#/lib/print.ts'

/* --------------------------------------------------------------------------
 * AffichageBoard — panneau de contrôle + orchestration du générateur d'affiches A3.
 *
 * Équivalent React de `Controls` + `app.js` du fork JS vanilla, dans le thème
 * sombre Tailwind/shadcn de l'app. L'état complet vit dans un store module-level
 * (afficheStore) : panneau de saisie à gauche (thème sombre, `print:hidden`),
 * aperçu de l'affiche à droite (PosterPreview, qui gère l'échelle).
 *
 * Portage fidèle :
 *   - sélection d'un template → remplace les 4 textes + icône + couleur, puis
 *     recalcul auto des tailles ;
 *   - mode « Taille automatique » → les 4 tailles sont dérivées du contenu ;
 *   - mode manuel → 4 sliders pilotent les tailles, chacun masqué si l'élément
 *     associé est absent (updateVisibleControls du fork).
 * ------------------------------------------------------------------------ */

const TEMPLATES = getTemplatesList()
const ICON_KEYS = getAvailableIcons()
// Le thème « OKKO » (défaut) est affiché en premier dans le dropdown.
const COLOR_KEYS = (Object.keys(COLORS) as ColorKey[]).sort((a, b) =>
  a === 'okko' ? -1 : b === 'okko' ? 1 : 0,
)

// Pastille de thème : cercle divisé en deux à 45° — fond du thème en haut à
// gauche, couleur d'accent en bas à droite. La transition de 1px entre les
// deux moitiés lisse la frontière (le stop dur du fork crénelait), et le
// background est clippé au padding-box pour ne pas baver sous le liseré
// semi-transparent (effet de « zoom » du contenu).
function colorSwatch(colorKey: ColorKey): React.CSSProperties {
  const c = COLORS[colorKey]
  return {
    background: `linear-gradient(135deg, ${c.bg} calc(50% - 0.5px), ${c.border} calc(50% + 0.5px))`,
    backgroundClip: 'padding-box',
  }
}

export function AffichageBoard() {
  // État persisté dans le store module-level : il survit à la navigation.
  const state = useStore(afficheStore)
  const {
    titleFr,
    messageFr,
    titleEn,
    messageEn,
    selectedIcon,
    colorKey,
    selectedTemplate,
    dateStart,
    dateEnd,
    timeStart,
    timeEnd,
    isAutoSizeMode,
    fontSizeIcon,
    fontSizeTitle,
    fontSizeMessage,
    fontSizeInfo,
  } = state

  // Popovers icône / couleur (état d'UI local, non persisté).
  const [iconOpen, setIconOpen] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)

  // --- Tailles auto DÉRIVÉES au render (portage de updateSizeMode + adjustIconSize) --
  // Calcul pur (useMemo), plus d'écriture dans le store via effet : chaque frappe
  // ne provoque qu'un seul render, sans frame intermédiaire aux anciennes tailles,
  // et les réglages manuels stockés ne sont jamais écrasés. showDates/showHours
  // sont TOUJOURS true (fidélité au fork controls.js l.240-241).
  const showIcon = selectedIcon !== 'none'
  const showEnglish = hasEnglishContent({ titleEn, messageEn })

  const autoSizes = useMemo(() => {
    const sizes = calculateAutoSizes(
      titleFr,
      messageFr,
      titleEn,
      messageEn,
      showIcon,
      true, // showDates forcé à true (fork)
      true, // showHours forcé à true (fork)
      showEnglish,
    )
    return {
      ...sizes,
      // adjustIconSize du fork retourne tôt si aucune icône : null → on garde
      // la valeur du slider telle quelle.
      fontSizeIcon: showIcon
        ? calculateIconSize(titleFr, messageFr, titleEn, messageEn, showEnglish)
        : null,
    }
  }, [titleFr, messageFr, titleEn, messageEn, showIcon, showEnglish])

  // Tailles effectivement rendues : dérivées en auto, celles du store en manuel.
  const effectiveSizes = isAutoSizeMode
    ? {
        fontSizeTitle: autoSizes.fontSizeTitle,
        fontSizeMessage: autoSizes.fontSizeMessage,
        fontSizeInfo: autoSizes.fontSizeInfo,
        fontSizeIcon: autoSizes.fontSizeIcon ?? fontSizeIcon,
      }
    : { fontSizeTitle, fontSizeMessage, fontSizeInfo, fontSizeIcon }

  // Bascule auto/manuel : au passage en manuel, on amorce les sliders avec les
  // valeurs auto courantes (comportement du fork : updateSizeMode écrit toujours
  // les sliders au moment de la bascule).
  function onAutoModeChange(checked: boolean) {
    if (checked) {
      setAffiche({ isAutoSizeMode: true })
    } else {
      setAffiche({ isAutoSizeMode: false, ...effectiveSizes })
    }
  }

  // --- Visibilité des sliders en mode manuel (portage de updateVisibleControls) --
  const showIconSlider = showIcon
  const showTitleSlider = titleFr.trim() !== '' || titleEn.trim() !== ''
  const showMessageSlider = messageFr.trim() !== '' || messageEn.trim() !== ''
  // Le fork ne testait que les dates ; on inclut aussi les heures, sinon un
  // horaire seul est affiché sur l'affiche sans slider pour régler sa taille.
  const showInfoSlider =
    dateStart !== '' || dateEnd !== '' || timeStart !== '' || timeEnd !== ''

  // --- Impression (portage du pattern PDJ handlePrint) -----------------------
  function handlePrint() {
    let stamp: string
    if (dateStart) {
      // dateStart au format 'YYYY-MM-DD' → 'JJ-MM-AAAA'.
      const [y, m, d] = dateStart.split('-')
      stamp = `${d}-${m}-${y}`
    } else {
      const now = new Date()
      const dd = String(now.getDate()).padStart(2, '0')
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      stamp = `${dd}-${mm}-${now.getFullYear()}`
    }
    printWithTitle(`Affiche_${stamp}`)
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-6">
      {/* PANNEAU TEXTES (gauche, écran uniquement) : titres + messages FR/EN */}
      <aside className="flex min-h-0 w-full shrink-0 flex-col gap-5 rounded-xl border border-border bg-card p-5 print:hidden lg:max-h-full lg:w-80 lg:overflow-y-auto">
        {/* Textes français — toute édition du contenu vide selectedTemplate :
            le label du Select redevient le placeholder (le contenu a divergé du
            modèle), et re-choisir le même modèle le ré-applique vraiment. */}
        <Field label="Titre (français)">
          <Input
            value={titleFr}
            onChange={(e) =>
              setAffiche({ titleFr: e.target.value, selectedTemplate: '' })
            }
            placeholder="Titre en français"
          />
        </Field>
        {/* Les deux messages absorbent la hauteur libre du panneau (flex-1) :
            field-sizing-fixed neutralise l'auto-dimensionnement au contenu. */}
        <Field label="Message (français)" className="min-h-0 flex-1">
          <Textarea
            value={messageFr}
            onChange={(e) =>
              setAffiche({ messageFr: e.target.value, selectedTemplate: '' })
            }
            placeholder="Message en français"
            rows={4}
            className="min-h-16 flex-1 resize-none field-sizing-fixed"
          />
        </Field>

        <Separator />

        {/* Textes anglais */}
        <Field label="Titre (anglais)">
          <Input
            value={titleEn}
            onChange={(e) =>
              setAffiche({ titleEn: e.target.value, selectedTemplate: '' })
            }
            placeholder="Titre en anglais"
          />
        </Field>
        <Field label="Message (anglais)" className="min-h-0 flex-1">
          <Textarea
            value={messageEn}
            onChange={(e) =>
              setAffiche({ messageEn: e.target.value, selectedTemplate: '' })
            }
            placeholder="Message en anglais"
            rows={4}
            className="min-h-16 flex-1 resize-none field-sizing-fixed"
          />
        </Field>
      </aside>

      {/* APERÇU DE L'AFFICHE (au centre sur desktop ; en responsive il passe
          en bas — order-last — accompagné d'un bouton Imprimer mobile). */}
      <div className="order-last flex min-w-0 flex-1 flex-col gap-3 lg:order-none lg:min-h-0">
        <div className="min-h-0 min-w-0 flex-1">
          <PosterPreview {...state} {...effectiveSizes} />
        </div>
        {/* Bouton Imprimer sous l'aperçu, uniquement en responsive. */}
        <PrintButton
          onClick={handlePrint}
          className="w-full lg:hidden print:hidden"
        />
      </div>

      {/* COLONNE DROITE (écran uniquement) : card impression + card réglages */}
      <div className="flex min-h-0 w-full shrink-0 flex-col gap-4 print:hidden lg:max-h-full lg:w-80">
        {/* Card impression (desktop uniquement : en responsive le bouton vit
            sous l'aperçu, en bas de page). */}
        <div className="hidden shrink-0 rounded-xl border border-border bg-card p-4 lg:block">
          <PrintButton onClick={handlePrint} className="w-full" />
        </div>

        {/* Card réglages : modèle, icône, couleur, dates/horaires, tailles.
            flex-1 : elle s'étire jusqu'en bas, comme la card de gauche. */}
        <aside className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto rounded-xl border border-border bg-card p-5">
          {/* Templates */}
          <Field label="Modèle prédéfini">
            <Select
              value={selectedTemplate}
              onValueChange={applyAfficheTemplate}
            >
              <SelectTrigger className="w-full" aria-label="Choisir un modèle">
                <SelectValue placeholder="Choisir un modèle" />
              </SelectTrigger>
              <SelectContent position="popper">
                {TEMPLATES.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Separator />

          {/* Icône */}
          <Field label="Icône">
            <Popover open={iconOpen} onOpenChange={setIconOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Choisir une icône"
                  className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                >
                  <span
                    className="flex size-5 shrink-0 items-center justify-center text-foreground [&>svg]:size-5"
                    dangerouslySetInnerHTML={{
                      __html: getIconSvg(selectedIcon),
                    }}
                  />
                  <span className="truncate">{getIconName(selectedIcon)}</span>
                  <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              {/* Largeur calée sur le champ déclencheur (variable Radix) : le
                panneau qui s'ouvre fait exactement la largeur de l'input. */}
              <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] p-2"
                align="start"
              >
                <div className="app-scroll grid max-h-80 grid-cols-3 gap-1.5 overflow-y-auto pr-1">
                  {ICON_KEYS.map((key) => {
                    const selected = key === selectedIcon
                    return (
                      <button
                        type="button"
                        key={key}
                        title={getIconName(key)}
                        // Amène la sélection courante dans la zone visible à l'ouverture.
                        ref={(el) => {
                          if (el && selected)
                            el.scrollIntoView({ block: 'nearest' })
                        }}
                        onClick={() => {
                          setAffiche({ selectedIcon: key })
                          setIconOpen(false)
                        }}
                        className={cn(
                          'flex flex-col items-center gap-1.5 rounded-lg border p-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
                          selected
                            ? 'border-primary/50 bg-primary/10 text-primary'
                            : 'border-transparent text-foreground hover:bg-accent',
                        )}
                      >
                        <span
                          className="flex size-7 items-center justify-center [&>svg]:size-7"
                          dangerouslySetInnerHTML={{ __html: getIconSvg(key) }}
                        />
                        <span
                          className={cn(
                            'w-full truncate text-center text-[11px] leading-tight',
                            selected ? 'text-primary' : 'text-muted-foreground',
                          )}
                        >
                          {getIconName(key)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </Field>

          {/* Couleur */}
          <Field label="Thème de couleur">
            <Popover open={colorOpen} onOpenChange={setColorOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Choisir un thème de couleur"
                  className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                >
                  <span
                    className="size-5 shrink-0 rounded-full border border-border"
                    style={colorSwatch(colorKey)}
                  />
                  <span className="truncate">{COLORS[colorKey].name}</span>
                  <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] p-2"
                align="start"
              >
                <div className="flex flex-col gap-1">
                  {COLOR_KEYS.map((key) => {
                    const selected = key === colorKey
                    return (
                      <button
                        type="button"
                        key={key}
                        onClick={() => {
                          setAffiche({ colorKey: key })
                          setColorOpen(false)
                        }}
                        className={cn(
                          'flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
                          selected
                            ? 'border-primary/50 bg-primary/10 text-primary'
                            : 'border-transparent hover:bg-accent',
                        )}
                      >
                        <span
                          className="size-5 shrink-0 rounded-full border border-border"
                          style={colorSwatch(key)}
                        />
                        <span>{COLORS[key].name}</span>
                      </button>
                    )
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </Field>

          <Separator />

          {/* Dates (pickers custom, pas les contrôles natifs du navigateur) */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date de début">
              <DateField
                value={dateStart}
                onChange={(v) => setAffiche({ dateStart: v })}
              />
            </Field>
            <Field label="Date de fin">
              <DateField
                value={dateEnd}
                onChange={(v) => setAffiche({ dateEnd: v })}
              />
            </Field>
          </div>

          {/* Horaires (pickers custom) */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Heure de début">
              <TimeField
                value={timeStart}
                onChange={(v) => setAffiche({ timeStart: v })}
              />
            </Field>
            <Field label="Heure de fin">
              <TimeField
                value={timeEnd}
                onChange={(v) => setAffiche({ timeEnd: v })}
              />
            </Field>
          </div>

          <Separator />

          {/* Tailles */}
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="autoSizeMode">Taille automatique</Label>
            <Switch
              id="autoSizeMode"
              checked={isAutoSizeMode}
              onCheckedChange={onAutoModeChange}
            />
          </div>

          {/* Sliders manuels : masqués en mode auto ; chaque slider est masqué si
            l'élément associé est absent (updateVisibleControls du fork). */}
          {!isAutoSizeMode && (
            <div className="flex flex-col gap-4">
              {showIconSlider && (
                <SizeSlider
                  label="Icône"
                  value={fontSizeIcon}
                  min={80}
                  max={200}
                  onChange={(v) => setAffiche({ fontSizeIcon: v })}
                />
              )}
              {showTitleSlider && (
                <SizeSlider
                  label="Titre"
                  value={fontSizeTitle}
                  min={30}
                  max={80}
                  onChange={(v) => setAffiche({ fontSizeTitle: v })}
                />
              )}
              {showMessageSlider && (
                <SizeSlider
                  label="Message"
                  value={fontSizeMessage}
                  min={16}
                  max={40}
                  onChange={(v) => setAffiche({ fontSizeMessage: v })}
                />
              )}
              {showInfoSlider && (
                <SizeSlider
                  label="Dates / horaires"
                  value={fontSizeInfo}
                  min={14}
                  max={30}
                  onChange={(v) => setAffiche({ fontSizeInfo: v })}
                />
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
