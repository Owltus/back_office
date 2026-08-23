import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@tanstack/react-store'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, FilePlus2, Plus, Save, Trash2 } from 'lucide-react'

import { PrintButton } from '#/components/shared/PrintButton.tsx'
import { SkeletonBlock } from '#/components/shared/skeleton/SkeletonBlock.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { usePrintShortcut } from '#/components/shared/usePrintShortcut.ts'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import { TemplateNameDialog } from '#/components/affiche/TemplateNameDialog.tsx'
import { useConfirm } from '#/components/shared/ConfirmDialog.tsx'
import {
  calculateAutoSizes,
  calculateIconSize,
} from '#/lib/poster/sizeCalculator.ts'
import { hasEnglishContent } from '#/lib/poster/types.ts'
import { useAuth } from '#/components/auth/AuthContext.tsx'
import type { AfficheTemplateInput } from '#/lib/affiche/model.ts'
import {
  createTemplate,
  deleteTemplate,
  fetchTemplates,
  toDbInsert,
  toDbUpdate,
  updateTemplate,
} from '#/lib/affiche/service.ts'
import {
  afficheStore,
  applyAfficheTemplate,
  resetAffiche,
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
    gap,
  } = state

  // Popovers icône / couleur (état d'UI local, non persisté).
  // Modèle d'accès PAR PROPRIÉTAIRE :
  //  - lecture : édite « à chaud » les champs (toujours actifs) + génère des PDF,
  //    mais ne voit pas la barre de gestion des modèles (rien n'est persisté) ;
  //  - ecriture : crée des modèles ; ne modifie/supprime QUE les siens ;
  //  - gestion : crée / modifie / supprime TOUS les modèles.
  const { can, user } = useAuth()
  const canWrite = can('affichage', 'ecriture')
  const canManage = can('affichage', 'gestion')
  const queryClient = useQueryClient()
  // Confirmation de suppression : modale maison (comme le reste de l'app), au lieu
  // du window.confirm natif.
  const { confirm, confirmDialog } = useConfirm()

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

  // Modèle actuellement sélectionné (pour sauvegarder / supprimer). Il RESTE
  // sélectionné pendant l'édition des champs → « Sauvegarder » réécrit ce modèle.
  const selected = templates.find((t) => t.id === selectedTemplate) ?? null
  // Propriété : un écriture ne peut toucher qu'à SES modèles ; la gestion, à tous.
  // Un seed (createdBy null) n'a pas d'auteur → gestion uniquement.
  const isOwner =
    selected != null &&
    selected.createdBy != null &&
    selected.createdBy === user?.id
  // Droit de modifier le modèle SÉLECTIONNÉ (le `selected` non nul est vérifié
  // séparément par les appelants) : gestion partout, écriture sur le sien.
  const canModifySelected = canManage || (canWrite && isOwner)

  // Groupement du dropdown par PROPRIÉTÉ (createdBy), pas par droit de modif :
  // « Mes modèles » (dont je suis l'auteur) vs « Autres modèles » (seeds sans
  // auteur + modèles d'autres). Un gestionnaire/admin voit le même découpage
  // même s'il peut tout modifier. On ne groupe QUE si les deux listes existent.
  const myTemplates = templates.filter((t) => t.createdBy === user?.id)
  const otherTemplates = templates.filter((t) => t.createdBy !== user?.id)
  const groupedTemplates = myTemplates.length > 0 && otherTemplates.length > 0

  // Modale « nom du modèle » (création), réservée aux niveaux écriture/gestion.
  const [nameOpen, setNameOpen] = useState(false)

  // Feedback bref à l'enregistrement : le bouton passe à « Enregistré ✓ » ~1,8 s.
  const [savedFlash, setSavedFlash] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function flashSaved() {
    setSavedFlash(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSavedFlash(false), 1800)
  }
  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current)
    },
    [],
  )

  const invalidateTemplates = () =>
    queryClient.invalidateQueries({ queryKey: ['affiche', 'templates'] })

  // Capture l'ÉTAT COMPLET courant de l'affiche en entrée de modèle (tout sauf
  // le nom, fourni par l'appelant) — c'est ce qui est enregistré/mis à jour.
  const currentInput = (name: string): AfficheTemplateInput => ({
    name,
    titleFr,
    messageFr,
    titleEn,
    messageEn,
    selectedIcon,
    colorKey,
    dateStart,
    dateEnd,
    timeStart,
    timeEnd,
    isAutoSizeMode,
    fontSizeIcon,
    fontSizeTitle,
    fontSizeMessage,
    fontSizeInfo,
    gap,
  })

  // « Nouveau » : repart d'une affiche vierge, plus aucun modèle sélectionné →
  // le bouton du bas repasse en « Créer ». N'écrit rien en base.
  function handleNew() {
    resetAffiche()
  }

  // « Créer » : la modale ne demande que le nom ; le reste = état courant.
  async function handleCreate(name: string) {
    if (!canWrite) return
    const id = crypto.randomUUID()
    try {
      await createTemplate(toDbInsert({ ...currentInput(name), id }, templates.length))
      await invalidateTemplates()
      // Le nouveau modèle devient le modèle sélectionné (l'état colle déjà).
      setAffiche({ selectedTemplate: id })
      setNameOpen(false)
      flashSaved()
    } catch (err) {
      console.error('[affiche] création du modèle échouée', err)
    }
  }

  // « Sauvegarder » : réécrit le modèle sélectionné avec l'état courant (sans
  // redemander le nom, conservé). Gardé par la propriété (canModifySelected).
  async function handleSave() {
    if (!selected || !canModifySelected) return
    try {
      await updateTemplate(selected.id, toDbUpdate(currentInput(selected.name)))
      await invalidateTemplates()
      flashSaved()
    } catch (err) {
      console.error('[affiche] sauvegarde du modèle échouée', err)
    }
  }

  async function handleDeleteTemplate() {
    if (!selected || !canModifySelected) return
    const ok = await confirm({
      title: `Supprimer le modèle « ${selected.name} » ?`,
      description: 'Cette action est définitive.',
      confirmLabel: 'Supprimer',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteTemplate(selected.id)
      if (selectedTemplate === selected.id) setAffiche({ selectedTemplate: '' })
      await invalidateTemplates()
    } catch (err) {
      console.error('[affiche] suppression du modèle échouée', err)
    }
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

  // Bascule auto/manuel FLUIDE : on ne touche QU'au mode. Les tailles manuelles
  // (fontSize* + gap) restent stockées dans le store → repasser en manuel restaure
  // exactement les paramètres réglés / sauvegardés, sans les écraser par les
  // valeurs auto (aller-retour auto ↔ manuel sans perte).
  function onAutoModeChange(checked: boolean) {
    setAffiche({ isAutoSizeMode: checked })
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
  usePrintShortcut(handlePrint)

  // Squelette de l'aperçu : uniquement au démarrage à froid, tant que les
  // modèles ne sont pas chargés ET que le store est encore vierge (aucun modèle
  // à afficher). Dès qu'un modèle est appliqué (store hydraté) ou que la liste
  // est résolue, on rend l'aperçu réel — évite le flash affiche blanche→modèle.
  const previewLoading = templatesPending && isPristine

  // Bouton du bas (près d'Imprimer), réutilisé desktop (card actions) + mobile.
  //  - « Sauvegarder » quand un modèle MODIFIABLE est chargé → réécrit l'état
  //    complet dans ce modèle.
  //  - « Créer un modèle » sinon : rien de sélectionné, OU modèle chargé non
  //    modifiable (seed / autre auteur) → on enregistre l'état courant comme un
  //    NOUVEAU modèle (pas de cul-de-sac : éditer un seed puis « Créer »).
  const renderSaveOrCreate = () => {
    if (!canWrite) return null
    // Feedback bref après un enregistrement réussi (création ou sauvegarde) :
    // pastille verte inerte pendant ~1,8 s, puis retour au bouton normal.
    if (savedFlash) {
      return (
        <Button
          variant="outline"
          className="w-full border-chart-5/40 text-chart-5 hover:text-chart-5"
        >
          <Check />
          Enregistré
        </Button>
      )
    }
    return selected && canModifySelected ? (
      <Tip label="Enregistrer les modifications dans ce modèle">
        <Button onClick={handleSave} className="w-full">
          <Save />
          Sauvegarder
        </Button>
      </Tip>
    ) : (
      <Button onClick={() => setNameOpen(true)} className="w-full">
        <Plus />
        Créer un modèle
      </Button>
    )
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-6">
      {/* PANNEAU TEXTES (gauche, écran uniquement) : titres + messages FR/EN */}
      <aside className="flex min-h-0 w-full shrink-0 flex-col gap-5 rounded-xl border border-border bg-card p-5 print:hidden lg:max-h-full lg:w-80 lg:overflow-y-auto">
        {/* Textes français. L'édition NE désélectionne PLUS le modèle : on reste
            « sur » le modèle chargé pour que « Sauvegarder » le réécrive. Pour
            repartir de zéro, utiliser « Nouveau ». */}
        <Field label="Titre (français)">
          <Input
            value={titleFr}
            onChange={(e) => setAffiche({ titleFr: e.target.value })}
            placeholder="Titre en français"
          />
        </Field>
        {/* Les deux messages absorbent la hauteur libre du panneau (flex-1) :
            field-sizing-fixed neutralise l'auto-dimensionnement au contenu. */}
        <Field label="Message (français)" className="min-h-0 flex-1">
          <Textarea
            value={messageFr}
            onChange={(e) => setAffiche({ messageFr: e.target.value })}
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
            onChange={(e) => setAffiche({ titleEn: e.target.value })}
            placeholder="Titre en anglais"
          />
        </Field>
        <Field label="Message (anglais)" className="min-h-0 flex-1">
          <Textarea
            value={messageEn}
            onChange={(e) => setAffiche({ messageEn: e.target.value })}
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
        {/* Boutons Imprimer + Créer/Sauvegarder sous l'aperçu, en responsive. */}
        <PrintButton
          onClick={handlePrint}
          label="Imprimer"
          className="w-full lg:hidden print:hidden"
        />
        <div className="lg:hidden print:hidden empty:hidden">
          {renderSaveOrCreate()}
        </div>
      </div>

      {/* COLONNE DROITE (écran uniquement) : Imprimer (haut) + réglages (défile) +
          Créer/Sauvegarder (bas). */}
      <div className="flex min-h-0 w-full shrink-0 flex-col gap-4 print:hidden lg:max-h-full lg:w-80">
        {/* Card impression — ancrée EN HAUT (desktop ; en responsive Imprimer vit
            sous l'aperçu). */}
        <div className="hidden shrink-0 rounded-xl border border-border bg-card p-4 lg:block">
          <PrintButton onClick={handlePrint} label="Imprimer" className="w-full" />
        </div>

        {/* Card MODÈLE (sa propre card, comme les cards boutons) : sélection
            (tous les rôles) + actions (écriture/gestion). « Nouveau » repart
            d'une affiche vierge ; la suppression est bornée à la propriété.
            L'enregistrement se fait par le bouton du bas (Créer / Sauvegarder). */}
        <div className="shrink-0 rounded-xl border border-border bg-card p-4">
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
                  {groupedTemplates ? (
                    <>
                      <SelectGroup>
                        <SelectLabel>Mes modèles</SelectLabel>
                        {myTemplates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>Autres modèles</SelectLabel>
                        {otherTemplates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </>
                  ) : (
                    templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {canWrite && (
                <div className="flex w-full gap-2">
                  <Tip label="Nouvelle affiche vierge">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNew}
                      className="flex-1"
                    >
                      <FilePlus2 />
                      Nouveau
                    </Button>
                  </Tip>
                  <Tip
                    label={
                      selected && !canModifySelected
                        ? 'Modèle d’un autre auteur (réservé à la gestion)'
                        : 'Supprimer le modèle'
                    }
                  >
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={handleDeleteTemplate}
                      disabled={!selected || !canModifySelected}
                      aria-label="Supprimer le modèle"
                    >
                      <Trash2 />
                    </Button>
                  </Tip>
                </div>
              )}
            </div>
          </Field>
        </div>

        {/* Card réglages : icône, couleur, dates/horaires, tailles.
            flex-1 : elle s'étire et pousse la card actions tout en bas. */}
        <aside className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto rounded-xl border border-border bg-card p-5">
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
              {/* Espacement intra-section : pilote le gap entre le titre, le
                  message et les dates/heures. N'affecte ni l'icône, ni le logo,
                  ni la répartition des sections. Toujours visible en manuel. */}
              <SizeSlider
                label="Espacement"
                value={gap}
                min={0}
                max={80}
                onChange={(v) => setAffiche({ gap: v })}
              />
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

        {/* Card Créer/Sauvegarder ancrée EN BAS de la colonne droite (desktop ;
            en responsive ce bouton vit sous l'aperçu). Masquée pour les rôles
            sans écriture (rien à enregistrer). */}
        {canWrite && (
          <div className="hidden shrink-0 rounded-xl border border-border bg-card p-4 lg:block">
            {renderSaveOrCreate()}
          </div>
        )}
      </div>

      {canWrite && (
        <TemplateNameDialog
          open={nameOpen}
          onOpenChange={setNameOpen}
          onSubmit={handleCreate}
        />
      )}
      {confirmDialog}
    </div>
  )
}
