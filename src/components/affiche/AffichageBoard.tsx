import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@tanstack/react-store'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'

import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import { PrintButton } from '#/components/shared/PrintButton.tsx'
import { SkeletonBlock } from '#/components/shared/skeleton/SkeletonBlock.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
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
import { IconPicker, ColorPicker } from '#/components/affiche/pickers.tsx'
import { TemplateDialog } from '#/components/affiche/TemplateDialog.tsx'
import {
  calculateAutoSizes,
  calculateIconSize,
} from '#/lib/poster/sizeCalculator.ts'
import { hasEnglishContent } from '#/lib/poster/types.ts'
import { useAuth } from '#/components/auth/AuthContext.tsx'
import type {
  AfficheTemplate,
  AfficheTemplateInput,
} from '#/lib/affiche/model.ts'
import {
  createTemplate,
  deleteTemplate,
  fetchTemplates,
  toDbInsert,
  toDbPatch,
  updateTemplate,
} from '#/lib/affiche/service.ts'
import {
  afficheStore,
  applyAfficheTemplate,
  setAffiche,
} from '#/lib/afficheStore.ts'
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
  const { can } = useAuth()
  const canEdit = can('affichage', 'ecriture')
  const queryClient = useQueryClient()

  // Modèles chargés depuis Supabase (cache TanStack Query) — remplace la
  // collection en dur. `isPending` distingue le chargement (aucune donnée encore)
  // de la liste vide résolue (`[]`), pour piloter le squelette de l'aperçu.
  const { data: templates = [], isPending: templatesPending } = useQuery({
    queryKey: ['affiche', 'templates'],
    queryFn: fetchTemplates,
  })

  // Affiche encore vierge : aucun modèle sélectionné et aucun texte saisi. Le
  // store survit à la navigation, donc ceci n'est vrai qu'au démarrage à froid.
  const isPristine =
    selectedTemplate === '' &&
    titleFr === '' &&
    messageFr === '' &&
    titleEn === '' &&
    messageEn === ''

  // Au premier chargement, si l'affiche est encore vierge, on applique le
  // premier modèle disponible (l'app ne démarre jamais sur une page blanche).
  const autoAppliedRef = useRef(false)
  useEffect(() => {
    if (autoAppliedRef.current || templates.length === 0) return
    autoAppliedRef.current = true
    if (isPristine) applyAfficheTemplate(templates[0])
  }, [templates, isPristine])

  // Modèle actuellement sélectionné (pour éditer / supprimer).
  const selected = templates.find((t) => t.id === selectedTemplate) ?? null

  // Dialog de création / édition, réservé aux rôles autorisés (canEdit).
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AfficheTemplate | null>(null)

  const invalidateTemplates = () =>
    queryClient.invalidateQueries({ queryKey: ['affiche', 'templates'] })

  async function handleSubmitTemplate(input: AfficheTemplateInput) {
    if (!canEdit) return
    try {
      if (editing) {
        await updateTemplate(editing.id, toDbPatch(input))
        // Rafraîchit l'aperçu si le modèle édité est celui affiché.
        if (selectedTemplate === editing.id) {
          applyAfficheTemplate({ id: editing.id, ...input })
        }
      } else {
        const created: AfficheTemplate = { id: crypto.randomUUID(), ...input }
        await createTemplate(toDbInsert(created, templates.length))
        applyAfficheTemplate(created)
      }
      await invalidateTemplates()
      setDialogOpen(false)
      setEditing(null)
    } catch (err) {
      console.error('[affiche] enregistrement du modèle échoué', err)
    }
  }

  async function handleDeleteTemplate() {
    if (!canEdit || !selected) return
    if (!window.confirm(`Supprimer le modèle « ${selected.name} » ?`)) return
    try {
      await deleteTemplate(selected.id)
      if (selectedTemplate === selected.id) setAffiche({ selectedTemplate: '' })
      await invalidateTemplates()
    } catch (err) {
      console.error('[affiche] suppression du modèle échouée', err)
    }
  }

  function openCreate() {
    if (!canEdit) return
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit() {
    if (!canEdit || !selected) return
    setEditing(selected)
    setDialogOpen(true)
  }

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

  // Squelette de l'aperçu : uniquement au démarrage à froid, tant que les
  // modèles ne sont pas chargés ET que le store est encore vierge (aucun modèle
  // à afficher). Dès qu'un modèle est appliqué (store hydraté) ou que la liste
  // est résolue, on rend l'aperçu réel — évite le flash affiche blanche→modèle.
  const previewLoading = templatesPending && isPristine

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
          {previewLoading ? (
            // Reflet de l'affiche A3 (ratio 1123 × 1587) centré comme l'aperçu.
            <div className="flex h-full w-full items-center justify-center">
              <SkeletonBlock className="h-full w-auto max-w-full rounded-xl aspect-[1123/1587]" />
            </div>
          ) : (
            <PosterPreview {...state} {...effectiveSizes} />
          )}
        </div>
        {/* Bouton Imprimer sous l'aperçu, uniquement en responsive. */}
        <PrintButton
          onClick={handlePrint}
          label="Imprimer"
          className="w-full lg:hidden print:hidden"
        />
      </div>

      {/* COLONNE DROITE (écran uniquement) : card impression + card réglages */}
      <div className="flex min-h-0 w-full shrink-0 flex-col gap-4 print:hidden lg:max-h-full lg:w-80">
        {/* Card impression (desktop uniquement : en responsive le bouton vit
            sous l'aperçu, en bas de page). */}
        <div className="hidden shrink-0 rounded-xl border border-border bg-card p-4 lg:block">
          <PrintButton onClick={handlePrint} label="Imprimer" className="w-full" />
        </div>

        {/* Card réglages : modèle, icône, couleur, dates/horaires, tailles.
            flex-1 : elle s'étire jusqu'en bas, comme la card de gauche. */}
        <aside className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto rounded-xl border border-border bg-card p-5">
          {/* Modèles : sélection (tous les rôles) + barre de gestion (création /
              édition / suppression, réservée aux rôles super_utilisateur / admin).
              Le Select occupe sa propre ligne ; les actions passent en dessous
              pour rester visibles dans la colonne étroite. */}
          <Field label="Modèle prédéfini">
            <div className="flex flex-col gap-2">
              <Select
                value={selectedTemplate}
                onValueChange={(id) => {
                  const t = templates.find((tpl) => tpl.id === id)
                  if (t) applyAfficheTemplate(t)
                }}
              >
                <SelectTrigger
                  className="w-full"
                  aria-label="Choisir un modèle"
                >
                  <SelectValue placeholder="Choisir un modèle" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {canEdit && (
                // Groupe segmenté (cf. ButtonGroup) : nouveau / éditer /
                // supprimer forment un seul bloc. `flex w-full` (au lieu de
                // l'inline-flex par défaut) pour que « Nouveau » (flex-1)
                // occupe la largeur restante, éditer/supprimer collés à droite.
                <ButtonGroup className="flex w-full">
                  <Tip label="Nouveau modèle">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={openCreate}
                      className="flex-1"
                    >
                      <Plus />
                      Nouveau
                    </Button>
                  </Tip>
                  <Tip label="Modifier le modèle">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={openEdit}
                      disabled={!selected}
                      aria-label="Modifier le modèle"
                    >
                      <Pencil />
                    </Button>
                  </Tip>
                  <Tip label="Supprimer le modèle">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={handleDeleteTemplate}
                      disabled={!selected}
                      aria-label="Supprimer le modèle"
                    >
                      <Trash2 />
                    </Button>
                  </Tip>
                </ButtonGroup>
              )}
            </div>
          </Field>

          <Separator />

          {/* Icône */}
          <Field label="Icône">
            <IconPicker
              value={selectedIcon}
              onChange={(key) => setAffiche({ selectedIcon: key })}
            />
          </Field>

          {/* Couleur */}
          <Field label="Thème de couleur">
            <ColorPicker
              value={colorKey}
              onChange={(key) => setAffiche({ colorKey: key })}
            />
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

      {canEdit && (
        <TemplateDialog
          open={dialogOpen}
          onOpenChange={(o) => {
            setDialogOpen(o)
            if (!o) setEditing(null)
          }}
          initial={editing}
          onSubmit={handleSubmitTemplate}
        />
      )}
    </div>
  )
}
