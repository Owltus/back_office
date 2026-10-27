/*
 * Coller les dates du document du CFA dans le calendrier d'école d'une fiche
 * (`lireDatesCfa`). Aperçu avant d'appliquer : périodes lues, jours ajoutés
 * et retirés, lignes écartées. Rien n'est écrit en base : la fiche
 * l'enregistre avec le reste.
 */

import { useState } from 'react'

import {
  appliquerCfa,
  dateLongue,
  lireDatesCfa,
  periodeTexte,
  periodesEcole,
} from '#/components/planning/parametres/equipe/ecole.ts'
import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'

const pluriel = (n: number, un: string, plusieurs: string) =>
  `${n} ${n > 1 ? plusieurs : un}`

export function DatesCfaDialog({
  ouvert,
  onFermer,
  jours,
  aujourdhui,
  modifiable,
  onAppliquer,
}: {
  ouvert: boolean
  onFermer: () => void
  jours: Set<string>
  aujourdhui: string
  modifiable: (jour: string) => boolean
  onAppliquer: (suite: Set<string>) => void
}) {
  const [texte, setTexte] = useState('')
  const lus = lireDatesCfa(texte, aujourdhui)
  const { suite, ajoutes, retires } = appliquerCfa(jours, lus, modifiable)
  const periodes = periodesEcole(lus.jours)
  const fermer = () => {
    setTexte('')
    onFermer()
  }
  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Dates du CFA</DialogTitle>
          <DialogDescription>
            Collez les périodes d'école du document du CFA, une par ligne. Par
            exemple : du 28/09 au 02/10/2026, ou 12/12/2026 pour un seul jour.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          rows={7}
          aria-label="Dates du CFA"
          placeholder={
            'du 28/09 au 02/10/2026\ndu 19/10 au 23/10/2026\nsamedi 12/12/2026'
          }
          className="resize-none font-normal [field-sizing:fixed]"
        />
        {texte.trim() && (
          <div className="flex flex-col gap-2 text-sm" aria-live="polite">
            {periodes.length === 0 ? (
              <p className="text-muted-foreground">
                Aucune date d'école lue pour l'instant.
              </p>
            ) : (
              <>
                <p>
                  {pluriel(periodes.length, 'période', 'périodes')},{' '}
                  {pluriel(lus.jours.size, "jour d'école", "jours d'école")}. Du{' '}
                  {lus.debut && dateLongue(lus.debut)} au{' '}
                  {lus.fin && dateLongue(lus.fin)}, le calendrier suit ce
                  document. Avant et après, rien ne change.
                </p>
                <ul className="max-h-40 overflow-y-auto rounded-md border border-border p-2 text-xs">
                  {periodes.map((p) => (
                    <li key={p.debut} className="py-0.5">
                      {periodeTexte(p)}{' '}
                      <span className="text-muted-foreground">
                        ({pluriel(p.jours, 'jour', 'jours')})
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  {ajoutes.length || retires.length
                    ? [
                        ajoutes.length &&
                          `${pluriel(ajoutes.length, 'jour passe', 'jours passent')} à l'école`,
                        retires.length &&
                          `${pluriel(retires.length, 'jour revient', 'jours reviennent')} à l'hôtel`,
                      ]
                        .filter(Boolean)
                        .join(', ') + '.'
                    : 'Le calendrier est déjà à jour.'}
                </p>
              </>
            )}
            {lus.ignorees.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Lignes écartées (entreprise ou vacances) :{' '}
                {lus.ignorees.join(' · ')}
              </p>
            )}
            {lus.illisibles.length > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Lignes non comprises : {lus.illisibles.join(' · ')}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fermer}>
            Annuler
          </Button>
          <Button
            type="button"
            disabled={!ajoutes.length && !retires.length}
            onClick={() => {
              onAppliquer(suite)
              fermer()
            }}
          >
            Appliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
