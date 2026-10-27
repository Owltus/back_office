/*
 * Barre du haut de la vue mois (prototype `VueMois.tsx`, lignes 516-660, et
 * `PlanningPage.tsx`, lignes 468-494) : indicateurs du mois, aide, cadenas
 * du mois, points d'attention, « Compléter le mois » et son menu,
 * navigation de mois en mois, puis l'engrenage des paramètres.
 */

import type { ReactNode } from 'react'
import {
  ChevronDown,
  CircleHelp,
  Loader2,
  Lock,
  LockOpen,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'

import { MenuParametres } from '#/components/planning/EnTeteParametres.tsx'
import { ButtonGroup } from '#/components/shared/ButtonGroup.tsx'
import { DatePickerButton } from '#/components/form/fields.tsx'
import { CompteursValidation } from '#/components/planning/CompteursValidation.tsx'
import { StepNav } from '#/components/shared/StepNav.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu.tsx'
import { cn } from '#/lib/utils.ts'
import type { Compteurs } from '#/components/planning/mois/mois.ts'

export interface ActionMois {
  libelle: string
  aide: string
  /** Raison de l'inaction (affichée à la place de l'aide). */
  inactif?: string
  danger?: boolean
  onClick: () => void
}

/** Un bouton grisé garde son infobulle (span porteur, cf. Tip). */
function AvecRaison({
  label,
  desactive,
  children,
}: {
  label: ReactNode
  desactive: boolean
  children: ReactNode
}) {
  return (
    <Tip label={<span className="whitespace-pre-line">{label}</span>}>
      {desactive ? (
        <span tabIndex={0} className="inline-flex">
          {children}
        </span>
      ) : (
        children
      )}
    </Tip>
  )
}

export function Indicateurs({ c }: { c: Compteurs }) {
  const taux = c.places ? (c.pourvues / c.places) * 100 : 100
  return (
    <div className="flex items-center gap-3 text-xs">
      <CompteursValidation
        propositions={c.propositions}
        valides={c.valides}
        verrouilles={c.verrouilles}
      />
      <Tip
        label={`Couverture du mois : ${c.pourvues} places pourvues sur ${c.places}`}
      >
        <span tabIndex={0} className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
            <span
              className={cn(
                'block h-full rounded-full',
                c.pourvues === c.places ? 'bg-emerald-500' : 'bg-amber-500',
              )}
              style={{ width: `${taux}%` }}
            />
          </span>
          <strong className="tabular-nums">
            {c.pourvues}/{c.places}
          </strong>
        </span>
      </Tip>
    </div>
  )
}

/** Bouclier « règles HCR », dans le groupe de boutons comme « Points
 * d'attention » (décision utilisateur du 2026-10-28) : rouge avec le nombre
 * d'infractions, vert si tout est conforme ; un clic ouvre le détail. */
export function BoutonHcr({
  infractions,
  onClick,
  disabled,
}: {
  infractions: number
  onClick: () => void
  disabled?: boolean
}) {
  const libelle = infractions
    ? `${infractions} infraction${infractions > 1 ? 's' : ''} aux règles HCR`
    : 'Conforme aux règles HCR'
  return (
    <Tip label={libelle}>
      <Button
        variant="outline"
        size="icon-sm"
        className={cn(
          'relative',
          infractions
            ? 'text-destructive hover:text-destructive'
            : 'text-emerald-600 hover:text-emerald-600 dark:text-emerald-400',
        )}
        disabled={disabled}
        onClick={onClick}
        aria-label={libelle}
      >
        {infractions ? <ShieldAlert /> : <ShieldCheck />}
        {infractions > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-4 rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white tabular-nums">
            {infractions}
          </span>
        )}
      </Button>
    </Tip>
  )
}

export function BarreMois({
  compteurs,
  occupe,
  progression,
  nbAlertes,
  onAlertes,
  onInfractions,
  verrou,
  completer,
  groupes,
  menuInactif,
  portee,
  nomDuMois,
  onPrecedent,
  onSuivant,
  date,
  aujourdhui,
  onDate,
}: {
  compteurs: Compteurs | null
  occupe: boolean
  progression: ReactNode
  nbAlertes: number
  onAlertes: () => void
  /** Ouvre le détail des infractions HCR. */
  onInfractions: () => void
  /** Cadenas du mois (gestion seule). */
  verrou: { verrouille: boolean; inactif?: string; onClick: () => void }
  completer: { inactif?: string; aide: string; onClick: () => void }
  groupes: Array<{ titre: string; actions: ActionMois[] }>
  /** Raison pour laquelle le menu ⌄ est fermé (droits, chargement, calcul). */
  menuInactif?: string
  portee: string
  nomDuMois: string
  onPrecedent: () => void
  onSuivant: () => void
  /** Jour montré par le calendrier (aujourd'hui dans le mois en cours). */
  date: string
  aujourdhui: string
  /** Un jour choisi au calendrier : son mois s'affiche. */
  onDate: (date: string) => void
}) {
  return (
    <>
      {progression}
      {compteurs && <Indicateurs c={compteurs} />}
      <ButtonGroup>
        <Tip
          label={
            <span className="whitespace-pre-line">
              {[
                'Clic : modifier le jour (horaire, poste, absence, école…)',
                'Clic droit : changer l’horaire, valider, journée étoile',
                'Glisser un shift : le déplacer, même vers une autre semaine (Alt : le dupliquer)',
                'Glisser un repos, une absence ou l’école : dans sa semaine',
                'S45 : ouvrir la semaine en vue semaine',
              ].join('\n')}
            </span>
          }
        >
          <Button variant="outline" size="icon-sm" aria-label="Aide">
            <CircleHelp />
          </Button>
        </Tip>
        <AvecRaison
          desactive={!!verrou.inactif}
          label={
            verrou.inactif ??
            (verrou.verrouille
              ? 'Mois verrouillé (plannings réalisés) : cliquer pour le déverrouiller'
              : 'Verrouiller tout le mois : plus de modification ni de génération.\nLes semaines à cheval sur deux mois sont verrouillées en entier.')
          }
        >
          <Button
            variant={verrou.verrouille ? 'secondary' : 'outline'}
            size="icon-sm"
            disabled={!!verrou.inactif}
            onClick={verrou.onClick}
            aria-label={
              verrou.verrouille
                ? 'Déverrouiller le mois'
                : 'Verrouiller le mois'
            }
          >
            {verrou.verrouille ? <Lock /> : <LockOpen />}
          </Button>
        </AvecRaison>
        <Tip
          label={
            nbAlertes
              ? `Points d'attention du mois (${nbAlertes})`
              : "Points d'attention : rien à signaler"
          }
        >
          <Button
            variant="outline"
            size="icon-sm"
            className="relative"
            onClick={onAlertes}
            aria-label="Points d'attention"
          >
            <TriangleAlert />
            {nbAlertes > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-4 rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white">
                {nbAlertes}
              </span>
            )}
          </Button>
        </Tip>
        <BoutonHcr
          infractions={compteurs?.infractions ?? 0}
          onClick={onInfractions}
        />
      </ButtonGroup>
      <ButtonGroup>
        <AvecRaison
          desactive={!!completer.inactif}
          label={completer.inactif ?? completer.aide}
        >
          {/* Étincelles seules (décision utilisateur du 2026-10-28) : le nom
              reste pour les lecteurs d'écran, l'infobulle dit ce qu'il fait. */}
          <Button
            size="icon-sm"
            disabled={!!completer.inactif}
            onClick={completer.onClick}
            aria-label="Compléter le mois"
          >
            {occupe ? <Loader2 className="animate-spin" /> : <Sparkles />}
          </Button>
        </AvecRaison>
        <DropdownMenu>
          <AvecRaison
            desactive={!!menuInactif}
            label={menuInactif ?? 'Générer, valider, effacer'}
          >
            <DropdownMenuTrigger asChild disabled={!!menuInactif}>
              <Button
                size="icon-sm"
                aria-label="Autres actions"
                disabled={!!menuInactif}
              >
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
          </AvecRaison>
          <DropdownMenuContent align="end" className="w-80">
            {groupes.map((g, i) => (
              <div key={g.titre} role="group" aria-label={g.titre}>
                {i > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {g.titre}
                </DropdownMenuLabel>
                {g.actions.map((a) => (
                  <DropdownMenuItem
                    key={a.libelle}
                    disabled={!!a.inactif}
                    onSelect={a.onClick}
                    className={cn(
                      'flex-col items-start gap-0',
                      a.danger && 'text-destructive',
                    )}
                  >
                    <span className="font-medium">{a.libelle}</span>
                    <span className="text-xs text-muted-foreground">
                      {a.inactif ?? a.aide}
                    </span>
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {portee}
            </p>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
      <StepNav
        onPrev={onPrecedent}
        onNext={onSuivant}
        prevLabel="Mois précédent"
        nextLabel="Mois suivant"
      >
        {/* Calendrier comme RepJour (décision utilisateur du 2026-10-28) ; son
            bouton « Aujourd'hui » ramène au mois en cours. */}
        <DatePickerButton
          value={date}
          onChange={onDate}
          todayValue={aujourdhui}
          ariaLabel={`Choisir un mois (${nomDuMois})`}
        />
      </StepNav>
      <MenuParametres />
    </>
  )
}
