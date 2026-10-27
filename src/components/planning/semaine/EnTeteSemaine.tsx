/*
 * En-tête de la vue semaine (prototype `PlanningPage.tsx` lignes 428-659,
 * `Validation.tsx`) : indicateurs (validation, couverture, règles HCR),
 * actions (aide, cadenas, points d'attention, Compléter et ses autres
 * actions), navigation dans le temps, puis l'engrenage des paramètres.
 */

import type { ReactNode } from 'react'
import {
  BadgeCheck,
  CalendarDays,
  ChevronDown,
  Loader2,
  Lock,
  LockOpen,
  Sparkles,
  SquareDashed,
  TriangleAlert,
} from 'lucide-react'

import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import { HelpGlyph } from '#/components/shared/HelpGlyph.tsx'
import { PageHeader } from '#/components/shared/PageHeader.tsx'
import { DatePickerButton } from '#/components/form/fields.tsx'
import { StepNav } from '#/components/shared/StepNav.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu.tsx'
import { MenuParametres } from '#/components/planning/EnTeteParametres.tsx'
import { BoutonHcr } from '#/components/planning/mois/BarreMois.tsx'
import { dateCourte } from '#/lib/planning/affichage.ts'
import type { SemaineOut } from '#/lib/planning/semaine.ts'
import { cn } from '#/lib/utils.ts'
import { compteurs } from '#/components/planning/semaine/edition.ts'

export const AIDE_VALIDATION = [
  'Proposition (pointillés) : proposée par le moteur, recalculée à chaque génération',
  'Validé (coche verte) : gardé par les générations, encore modifiable à la main',
  'Verrouillé (cadenas) : semaine réalisée, rien ne bouge',
  'Valider : clic droit sur un shift, coche en tête de jour, ou le menu Autres actions',
]

export const AIDE_GESTES = [
  'Glisser un shift : le déplacer (Alt maintenu : le dupliquer)',
  "Clic droit sur une case : changer l'horaire, valider, journée étoile",
  'Clic sur un shift : tout modifier',
  'Semi-auto : posez et validez quelques shifts, Compléter fait le reste',
]

export interface ActionsEnTete {
  onMois: () => void
  onPrecedente: () => void
  onSuivante: () => void
  onCetteSemaine: () => void
  /** Un jour choisi au calendrier : sa semaine s'affiche. */
  onDate: (date: string) => void
  aujourdhui: string
  onVerrou: () => void
  onAlertes: () => void
  /** Le bouclier rouge : détail des infractions HCR. */
  onInfractions: () => void
  onCompleter: () => void
  onFullAuto: () => void
  onValiderSemaine: (epinglee: boolean) => void
  onEffacerPropositions: () => void
  onVider: () => void
}

function Lignes({ lignes }: { lignes: string[] }) {
  return (
    <div className="max-w-80 space-y-0.5">
      {lignes.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </div>
  )
}

/** Un bouton d'icône avec son infobulle, même désactivé (span porteur). */
function BoutonBarre({
  label,
  tip,
  disabled,
  onClick,
  className,
  variant = 'outline',
  children,
}: {
  label: string
  tip: ReactNode
  disabled?: boolean
  onClick?: () => void
  className?: string
  variant?: 'outline' | 'secondary'
  children: ReactNode
}) {
  const bouton = (
    <Button
      variant={variant}
      size="icon-sm"
      className={className}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
    >
      {children}
    </Button>
  )
  return (
    <Tip label={tip}>
      {disabled ? (
        <span tabIndex={0} className="inline-flex">
          {bouton}
        </span>
      ) : (
        bouton
      )}
    </Tip>
  )
}

export function EnTeteSemaine({
  numero,
  dates,
  semaine,
  nbAlertes,
  pret,
  ecrire,
  gerer,
  occupe,
  enGeneration,
  passee,
  enCours,
  actions,
}: {
  numero: number
  dates: string[]
  semaine: SemaineOut | null
  /** Points d'attention, comptés comme le panneau les montre. */
  nbAlertes: number
  /** Droits lus et semaine affichée chargée. */
  pret: boolean
  ecrire: boolean
  gerer: boolean
  occupe: boolean
  enGeneration: boolean
  passee: boolean
  /** La semaine affichée est la semaine en cours. */
  enCours: boolean
  actions: ActionsEnTete
}) {
  const verrou = !!semaine?.verrouillee
  const stats = semaine?.stats
  const nb = semaine ? compteurs(semaine) : null

  const couverture =
    stats && stats.places
      ? Math.round((stats.pourvues / stats.places) * 100)
      : 100

  // Raison commune d'une écriture impossible (null : possible).
  const raisonEcriture = !pret
    ? 'Chargement en cours'
    : !ecrire
      ? 'Lecture seule'
      : verrou
        ? 'Semaine verrouillée : le cadenas permet de la rouvrir'
        : occupe
          ? 'Calcul en cours…'
          : null
  const raisonCompleter = !pret
    ? 'Chargement en cours'
    : !ecrire
      ? 'Lecture seule'
      : passee
        ? 'Semaine passée : on ne génère pas le passé'
        : verrou
          ? 'Semaine verrouillée : pas de génération'
          : occupe
            ? 'Calcul en cours…'
            : null
  const raisonVerrou = !pret
    ? 'Chargement en cours'
    : !gerer
      ? null
      : occupe
        ? 'Calcul en cours…'
        : null
  const texteVerrou = verrou
    ? 'Semaine verrouillée (planning réalisé) : cliquer pour la déverrouiller'
    : 'Verrouiller la semaine : plus de modification ni de génération'

  const completer = (
    <Button
      variant="default"
      size="sm"
      disabled={!!raisonCompleter}
      onClick={actions.onCompleter}
      aria-label="Compléter le planning"
    >
      {enGeneration ? <Loader2 className="animate-spin" /> : <Sparkles />}
      Compléter
    </Button>
  )
  const autres = (
    <Button
      variant="default"
      size="icon-sm"
      disabled={!!raisonEcriture}
      aria-label="Autres actions"
      className="border-l border-primary-foreground/20"
    >
      <ChevronDown />
    </Button>
  )

  return (
    <PageHeader
      // L'année de la semaine est celle de son jeudi (semaines ISO).
      title={`Semaine ${numero} · ${dates[3].slice(0, 4)}`}
      badge={
        verrou ? (
          <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
            <Lock className="size-3" />
            Verrouillée
          </span>
        ) : undefined
      }
      actionsAlign="end"
      actions={
        <>
          {stats && nb && (
            <div className="flex items-center gap-3 text-sm">
              {(nb.propositions > 0 ||
                nb.valides > 0 ||
                nb.verrouilles > 0) && (
                <Tip label={<Lignes lignes={AIDE_VALIDATION} />}>
                  <span
                    tabIndex={0}
                    className="inline-flex items-center gap-2.5 rounded-md px-1 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {nb.propositions > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <SquareDashed className="size-3.5" />
                        {nb.propositions} proposition
                        {nb.propositions > 1 ? 's' : ''}
                      </span>
                    )}
                    {nb.valides > 0 && (
                      <span className="inline-flex items-center gap-1 text-emerald-500">
                        <BadgeCheck className="size-3.5" />
                        {nb.valides} validé{nb.valides > 1 ? 's' : ''}
                      </span>
                    )}
                    {nb.verrouilles > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Lock className="size-3" />
                        {nb.verrouilles} verrouillé
                        {nb.verrouilles > 1 ? 's' : ''}
                      </span>
                    )}
                  </span>
                </Tip>
              )}
              <Tip
                label={`Couverture des besoins : ${stats.pourvues} places pourvues sur ${stats.places}`}
              >
                <span
                  tabIndex={0}
                  className="inline-flex items-center gap-2 rounded-md px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Couverture : ${stats.pourvues} sur ${stats.places}`}
                >
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn(
                        'block h-full rounded-full',
                        couverture === 100 ? 'bg-emerald-500' : 'bg-amber-500',
                      )}
                      style={{ width: `${couverture}%` }}
                    />
                  </span>
                  <strong className="tabular-nums">
                    {stats.pourvues}/{stats.places}
                  </strong>
                </span>
              </Tip>
            </div>
          )}

          <ButtonGroup>
            <BoutonBarre label="Aide" tip={<Lignes lignes={AIDE_GESTES} />}>
              <HelpGlyph className="size-4" />
            </BoutonBarre>
            <BoutonBarre
              label={
                verrou ? 'Déverrouiller la semaine' : 'Verrouiller la semaine'
              }
              tip={
                gerer
                  ? (raisonVerrou ?? texteVerrou)
                  : `${verrou ? 'Semaine verrouillée' : 'Semaine ouverte'} : verrouillage réservé à la gestion`
              }
              disabled={!gerer || !!raisonVerrou}
              variant={verrou ? 'secondary' : 'outline'}
              onClick={actions.onVerrou}
            >
              {verrou ? <Lock /> : <LockOpen />}
            </BoutonBarre>
            <BoutonBarre
              label={
                nbAlertes
                  ? `Points d'attention (${nbAlertes})`
                  : "Points d'attention"
              }
              tip={
                nbAlertes
                  ? `Points d'attention (${nbAlertes})`
                  : "Points d'attention : rien à signaler"
              }
              disabled={!semaine}
              onClick={actions.onAlertes}
              className="relative"
            >
              <TriangleAlert />
              {nbAlertes > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-4 rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white tabular-nums">
                  {nbAlertes}
                </span>
              )}
            </BoutonBarre>
            <BoutonHcr
              infractions={stats?.infractions ?? 0}
              disabled={!semaine}
              onClick={actions.onInfractions}
            />
          </ButtonGroup>

          <ButtonGroup>
            <Tip
              label={
                raisonCompleter ??
                'Semi-auto : recalcule les propositions (nouveau tirage à chaque clic) ; le validé ne bouge pas'
              }
            >
              {raisonCompleter ? (
                <span tabIndex={0} className="inline-flex">
                  {completer}
                </span>
              ) : (
                completer
              )}
            </Tip>
            <DropdownMenu>
              <Tip label={raisonEcriture ?? 'Générer, valider, effacer'}>
                {raisonEcriture ? (
                  <span tabIndex={0} className="inline-flex">
                    {autres}
                  </span>
                ) : (
                  <DropdownMenuTrigger asChild>{autres}</DropdownMenuTrigger>
                )}
              </Tip>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Générer
                  </DropdownMenuLabel>
                  <ItemAction
                    libelle="Full auto"
                    aide="Repart de zéro, y compris ce qui est validé"
                    inactif={
                      passee
                        ? 'Semaine passée : on ne génère pas le passé'
                        : undefined
                    }
                    onSelect={actions.onFullAuto}
                  />
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Valider
                  </DropdownMenuLabel>
                  <ItemAction
                    libelle="Valider toute la semaine"
                    aide="Toutes les propositions deviennent validées"
                    onSelect={() => actions.onValiderSemaine(true)}
                  />
                  <ItemAction
                    libelle="Tout remettre en proposition"
                    aide="Plus rien de validé : la génération peut tout changer"
                    onSelect={() => actions.onValiderSemaine(false)}
                  />
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Effacer
                  </DropdownMenuLabel>
                  <ItemAction
                    libelle="Effacer les propositions"
                    aide={
                      enCours
                        ? "Garde le validé ; à partir d'aujourd'hui"
                        : 'Garde le validé'
                    }
                    inactif={
                      passee
                        ? "Semaine passée : on n'efface pas le passé"
                        : undefined
                    }
                    onSelect={actions.onEffacerPropositions}
                  />
                  <ItemAction
                    libelle="Vider la semaine"
                    aide={
                      enCours
                        ? "Supprime tous les shifts à partir d'aujourd'hui, validés compris"
                        : 'Supprime tous les shifts, validés compris'
                    }
                    danger
                    inactif={
                      passee
                        ? "Semaine passée : on n'efface pas le passé"
                        : undefined
                    }
                    onSelect={actions.onVider}
                  />
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>

          <div className="flex items-center gap-2">
            <BoutonBarre
              label="Vue mois"
              tip="Revenir à la vue mois"
              onClick={actions.onMois}
            >
              <CalendarDays />
            </BoutonBarre>
            <StepNav
              onPrev={actions.onPrecedente}
              onNext={actions.onSuivante}
              prevLabel="Semaine précédente"
              nextLabel="Semaine suivante"
              enlargeOnNarrow={false}
            >
              {/* Calendrier comme RepJour (décision utilisateur du
                  2026-10-28) : un jour choisi ouvre sa semaine, « Aujourd'hui »
                  la semaine en cours. */}
              <DatePickerButton
                value={dates[0]}
                onChange={actions.onDate}
                todayValue={actions.aujourdhui}
                ariaLabel={`Choisir une semaine (du ${dateCourte(dates[0])} au ${dateCourte(dates[6])})`}
                enlargeOnNarrow={false}
              />
            </StepNav>
          </div>

          <MenuParametres />
        </>
      }
    />
  )
}

function ItemAction({
  libelle,
  aide,
  inactif,
  danger,
  onSelect,
}: {
  libelle: string
  aide: string
  /** Raison affichée à la place de l'aide quand l'action n'est pas possible. */
  inactif?: string
  danger?: boolean
  onSelect: () => void
}) {
  return (
    <DropdownMenuItem
      disabled={!!inactif}
      variant={danger ? 'destructive' : 'default'}
      onSelect={onSelect}
      className="flex-col items-start gap-0.5"
    >
      <span className="font-medium">{libelle}</span>
      <span
        className={cn(
          'text-xs',
          danger && !inactif ? 'text-destructive/80' : 'text-muted-foreground',
        )}
      >
        {inactif ?? aide}
      </span>
    </DropdownMenuItem>
  )
}
