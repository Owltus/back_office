import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react'

import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import {
  LIBELLE_NIVEAU,
  estNiveauClasseur,
  niveauEffectif,
} from '#/lib/classeur/droits.ts'
import type { NiveauClasseur } from '#/lib/classeur/droits.ts'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import { classeurKeys } from '#/lib/classeur/keys.ts'
import {
  definirAcces,
  definirAccesTous,
  fetchAccesClasseur,
  fetchPersonnesClasseur,
} from '#/lib/classeur/service.ts'
import type { DbClasseur, PersonneClasseur } from '#/lib/classeur/types.ts'
import { cn } from '#/lib/utils.ts'

/*
 * Accès à un classeur (2026-09-28, plan `plan/classeur-acces-par-classeur`,
 * étape 6) — gestion de la page et admin seulement (la base refuse sinon).
 *
 *   - Accès pour tous : aucun (privé) / lecture / écriture ;
 *   - une exception par personne ayant la page, dans les deux sens, avec le
 *     niveau EFFECTIF affiché (le droit de page plafonne).
 *
 * Chaque changement est enregistré aussitôt (et journalisé en base) ; pas
 * de bouton « Enregistrer » à oublier.
 */

const CHOIX_TOUS: ReadonlyArray<[NiveauClasseur, string, string]> = [
  ['aucun', 'Privé', 'Personne, sauf la gestion et les accès donnés'],
  ['lecture', 'Lecture pour tous', 'Tous ceux qui ont la page le lisent'],
  [
    'ecriture',
    'Écriture pour tous',
    'Tous ceux qui ont l’écriture sur la page le modifient',
  ],
]

function nomDe(p: PersonneClasseur): string {
  const complet = `${p.prenom} ${p.nom}`.trim()
  return complet !== ''
    ? complet
    : p.nom_affiche !== ''
      ? p.nom_affiche
      : 'Sans nom'
}

export function AccesClasseurDialog({
  classeur,
  onClose,
}: {
  /** `null` : fermé. */
  classeur: DbClasseur | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={classeur !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        {classeur && <Contenu classeur={classeur} />}
      </DialogContent>
    </Dialog>
  )
}

function Contenu({ classeur }: { classeur: DbClasseur }) {
  const queryClient = useQueryClient()
  const personnes = useQuery({
    queryKey: classeurKeys.personnes(),
    queryFn: fetchPersonnesClasseur,
    staleTime: 0,
  })
  const acces = useQuery({
    queryKey: classeurKeys.acces(classeur.id),
    queryFn: () => fetchAccesClasseur(classeur.id),
    staleTime: 0,
  })
  const exceptions = useMemo(() => {
    const m = new Map<string, NiveauClasseur>()
    for (const a of acces.data ?? []) m.set(a.user_id, a.niveau)
    return m
  }, [acces.data])

  const rafraichir = () =>
    queryClient.invalidateQueries({ queryKey: classeurKeys.all })

  const tous = useMutation({
    mutationFn: (n: NiveauClasseur) => definirAccesTous(classeur.id, n),
    onSuccess: rafraichir,
  })
  const exception = useMutation({
    mutationFn: ({
      userId,
      niveau,
    }: {
      userId: string
      niveau: NiveauClasseur | null
    }) => definirAcces(classeur.id, userId, niveau),
    onSuccess: rafraichir,
  })

  const erreur = tous.error ?? exception.error ?? personnes.error ?? acces.error

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <DialogHeader className="shrink-0">
        <DialogTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4" />
          Accès au classeur
        </DialogTitle>
        <DialogDescription>
          « {classeur.name} ». La gestion de la page et les administrateurs ont
          toujours accès à tout. Le droit sur la page reste un plafond :
          quelqu'un en lecture sur la page ne peut que lire.
        </DialogDescription>
      </DialogHeader>

      <section className="shrink-0 space-y-2">
        <h3 className="text-sm font-medium">Pour tout le monde</h3>
        <div
          role="radiogroup"
          aria-label="Accès pour tous"
          className="grid gap-2 sm:grid-cols-3"
        >
          {CHOIX_TOUS.map(([n, titre, aide]) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={classeur.acces_tous === n}
              disabled={tous.isPending}
              onClick={() => {
                if (classeur.acces_tous !== n) tous.mutate(n)
              }}
              className={cn(
                'rounded-md border p-2.5 text-left text-sm transition-colors disabled:opacity-60',
                classeur.acces_tous === n
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:bg-accent',
              )}
            >
              <span className="flex items-center gap-1.5 font-medium">
                {tous.isPending && tous.variables === n && (
                  <Loader2 className="size-3.5 animate-spin" />
                )}
                {titre}
              </span>
              <span className="text-xs text-muted-foreground">{aide}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="flex min-h-0 flex-col gap-2">
        <h3 className="shrink-0 text-sm font-medium">
          Exceptions par personne
        </h3>
        {personnes.isPending || acces.isPending ? (
          <div className="flex justify-center py-6 text-muted-foreground">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <ul className="min-h-0 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {(personnes.data ?? []).map((p) => {
              const ex = exceptions.get(p.id) ?? null
              const createur = classeur.created_by === p.id
              const effectif = niveauEffectif(p.niveau_page, classeur, ex, p.id)
              const plafonne =
                p.niveau_page === 'lecture' &&
                (ex ?? (createur ? 'ecriture' : classeur.acces_tous)) ===
                  'ecriture'
              const enCours =
                exception.isPending && exception.variables.userId === p.id
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {nomDe(p)}
                      {createur && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          créateur
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Page : {LIBELLE_NIVEAU[p.niveau_page]} · Effectif :{' '}
                      <span className="font-medium text-foreground">
                        {LIBELLE_NIVEAU[effectif]}
                      </span>
                      {plafonne && ' (plafonné par la page)'}
                    </p>
                  </div>
                  {p.niveau_page === 'gestion' ? (
                    <span className="text-xs text-muted-foreground">
                      Accès complet
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      {enCours && (
                        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                      )}
                      <select
                        aria-label={`Accès de ${nomDe(p)}`}
                        value={ex ?? ''}
                        disabled={exception.isPending}
                        onChange={(e) => {
                          const v = e.target.value
                          exception.mutate({
                            userId: p.id,
                            niveau: estNiveauClasseur(v) ? v : null,
                          })
                        }}
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm dark:bg-input/30"
                      >
                        <option value="">
                          {createur
                            ? 'Par défaut (créateur : écriture)'
                            : `Comme tout le monde (${LIBELLE_NIVEAU[classeur.acces_tous].toLowerCase()})`}
                        </option>
                        <option value="aucun">Aucun accès</option>
                        <option value="lecture">Lecture</option>
                        <option value="ecriture">Écriture</option>
                      </select>
                    </span>
                  )}
                </li>
              )
            })}
            {(personnes.data ?? []).length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                Personne d'autre n'a de droit sur la page Classeur.
              </li>
            )}
          </ul>
        )}
      </section>

      {erreur && (
        <Alert variant="destructive" className="shrink-0">
          <AlertCircle />
          <AlertDescription>
            {messageErreur(erreur, 'Modification des accès impossible')}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
