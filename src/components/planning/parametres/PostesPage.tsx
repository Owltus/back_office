/*
 * Paramètres du Planning : les postes (prototype `PostesPage.tsx`, spec §5.1).
 * Une carte par poste : nom, catégorie réglementaire (qui fixe la durée
 * maximale d'un service, convention HCR), couleur, poste à part, codes
 * horaires possibles (aucun = tous). Enregistrement explicite par carte ;
 * un nouveau poste est une carte brouillon, créée en base à Enregistrer.
 * Seule la gestion modifie ; lecture et écriture voient les réglages.
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import {
  useDroitsPlanning,
  useEcriture,
  useReferentiel,
} from '#/components/planning/hooks/usePlanning.ts'
import { useNotifier } from '#/components/planning/Messages.tsx'
import {
  CadreReglages,
  EnTeteSection,
  useBrouillon,
} from '#/components/planning/parametres/reglages/cadre.tsx'
import {
  CarteReglage,
  ErreursSaisie,
  Nuancier,
  PALETTE,
} from '#/components/planning/parametres/reglages/controles.tsx'
import {
  erreursPoste,
  nettoyerPoste,
} from '#/components/planning/parametres/reglages/validation.ts'
import type { SaisiePoste } from '#/components/planning/parametres/reglages/validation.ts'
import { ConfirmDialog } from '#/components/shared/ConfirmDialog.tsx'
import { ChoixCodes } from '#/components/planning/parametres/reglages/ChoixCodes.tsx'
import { LigneCompacte } from '#/components/planning/parametres/reglages/ListeCompacte.tsx'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet.tsx'
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
import { Switch } from '#/components/ui/switch.tsx'
import { dureeHoraire, heures } from '#/lib/planning/affichage.ts'
import { JOUR_MAX_CATEGORIE } from '#/lib/planning/regles.ts'
import { enregistrerPoste, supprimerPoste } from '#/lib/planning/service.ts'
import { CATEGORIES } from '#/lib/planning/types.ts'
import type { Poste, Referentiel } from '#/lib/planning/types.ts'

const saisieDe = (p: Poste): SaisiePoste => ({
  nom: p.nom,
  categorie: p.categorie,
  couleur: p.couleur,
  horaires_autorises: [...p.horaires_autorises],
  a_part: p.a_part,
  presence: p.presence,
})

export function PostesPage() {
  const droits = useDroitsPlanning()
  const ref = useReferentiel()
  const modifiable = droits.pret && droits.gerer
  const [nouveau, setNouveau] = useState<SaisiePoste | null>(null)

  // Poste ouvert dans le volet (null : nouveau ; undefined : aucun).
  const [ouvert, setOuvert] = useState<number | null | undefined>(undefined)
  const posteOuvert =
    typeof ouvert === 'number'
      ? ref.data?.postes.find((p) => p.id === ouvert)
      : undefined
  const fermer = () => {
    setOuvert(undefined)
    setNouveau(null)
  }

  const creer = () => {
    if (!ref.data) return
    setOuvert(null)
    setNouveau({
      nom: 'Nouveau poste',
      categorie: 'autre',
      couleur: PALETTE[ref.data.postes.length % PALETTE.length],
      horaires_autorises: [],
      a_part: false,
      presence: false,
    })
  }

  return (
    <CadreReglages
      titre="Postes"
      actif="/planning/postes"
      modifiable={modifiable}
      pret={droits.pret}
      chargement={ref.isPending}
      erreur={ref.isError}
      onReessayer={() => void ref.refetch()}
      actions={
        modifiable ? (
          <Button size="sm" onClick={creer} disabled={!!nouveau || !ref.data}>
            <Plus />
            Nouveau poste
          </Button>
        ) : undefined
      }
    >
      {ref.data && (
        <>
          <EnTeteSection
            titre="Les postes de l'hôtel"
            texte="Un clic sur un poste ouvre son réglage : nom, catégorie réglementaire (elle fixe la durée maximale d'un service selon la convention HCR), couleur et horaires possibles."
          />
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <span>Poste</span>
              <span>Horaires · personnes</span>
            </div>
            <ul className="divide-y">
              {ref.data.postes.map((p) => (
                <LigneCompacte
                  key={p.id}
                  etiquette={`Régler le poste ${p.nom}`}
                  pastille={
                    <span
                      className="size-3 shrink-0 rounded-full"
                      style={{ background: p.couleur }}
                    />
                  }
                  libelle={
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{p.nom}</span>
                      {p.a_part && <Etiquette>à part</Etiquette>}
                      {p.presence && <Etiquette>présence</Etiquette>}
                    </span>
                  }
                  detail={resumePoste(p, ref.data)}
                  onOuvrir={() => setOuvert(p.id)}
                />
              ))}
            </ul>
            {!ref.data.postes.length && (
              <p className="p-4 text-sm text-muted-foreground">
                Aucun poste pour l'instant.
              </p>
            )}
          </div>

          <Sheet
            open={ouvert !== undefined && (ouvert === null || !!posteOuvert)}
            onOpenChange={(o) => !o && fermer()}
          >
            <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
              <SheetHeader className="border-b">
                <SheetTitle>
                  {ouvert === null
                    ? 'Nouveau poste'
                    : `Poste ${posteOuvert?.nom ?? ''}`}
                </SheetTitle>
                <SheetDescription>
                  Nom, catégorie, couleur et horaires possibles
                </SheetDescription>
              </SheetHeader>
              <div className="p-4">
                {ouvert === null
                  ? nouveau && (
                      <CartePoste
                        key="nouveau"
                        id={null}
                        enregistre={nouveau}
                        referentiel={ref.data}
                        modifiable={modifiable}
                        onFin={fermer}
                      />
                    )
                  : posteOuvert && (
                      <CartePoste
                        key={posteOuvert.id}
                        id={posteOuvert.id}
                        enregistre={saisieDe(posteOuvert)}
                        referentiel={ref.data}
                        modifiable={modifiable}
                        onFin={fermer}
                      />
                    )}
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </CadreReglages>
  )
}

function Etiquette({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-full border px-1.5 text-[10px] text-muted-foreground">
      {children}
    </span>
  )
}

/** « 2 codes · 3 personnes » : ce qu'un poste permet et qui le tient. */
function resumePoste(p: Poste, r: Referentiel): string {
  const codes = p.horaires_autorises.length
  const personnes = r.salaries.filter(
    (s) => s.actif && s.competences.some((c) => c.poste_id === p.id),
  ).length
  return `${codes ? `${codes} code${codes > 1 ? 's' : ''}` : 'tous les codes'} · ${personnes} personne${personnes > 1 ? 's' : ''}`
}

function CartePoste({
  id,
  enregistre,
  referentiel,
  modifiable,
  onFin,
}: {
  id: number | null
  enregistre: SaisiePoste
  referentiel: Referentiel
  modifiable: boolean
  /** Brouillon d'un nouveau poste : créé ou abandonné. */
  onFin?: () => void
}) {
  const ecrire = useEcriture()
  const notifier = useNotifier()
  const {
    brouillon: p,
    modifie,
    changer,
    annuler,
    adopter,
  } = useBrouillon(enregistre)
  const [envoi, setEnvoi] = useState(false)
  const [suppression, setSuppression] = useState(false)
  const erreurs = erreursPoste(p)
  const neuf = id === null
  const nomAffiche = enregistre.nom

  const enregistrer = async () => {
    if (erreurs.length || envoi || (!modifie && !neuf)) return
    const valeurs = nettoyerPoste(p)
    setEnvoi(true)
    const r = await ecrire(
      () => enregistrerPoste(valeurs, id),
      "Le poste n'a pas pu être enregistré",
    )
    setEnvoi(false)
    if (!r.ok) {
      notifier(r.message, 'danger')
      return
    }
    adopter(valeurs)
    notifier(
      neuf ? `Poste ${valeurs.nom} créé` : `Poste ${valeurs.nom} enregistré`,
    )
    onFin?.()
  }

  const supprimer = async () => {
    if (id === null) return
    setEnvoi(true)
    const r = await ecrire(
      () => supprimerPoste(id),
      `Le poste ${nomAffiche} n'a pas pu être supprimé`,
    )
    setEnvoi(false)
    notifier(
      r.ok ? `Poste ${nomAffiche} supprimé` : r.message,
      r.ok ? 'info' : 'danger',
    )
  }

  // Chiffres du poste (prototype) : qui le tient, et sa présence demandée
  // par semaine (effectif × durée, pause non déduite).
  const compte = (niveau: string) =>
    referentiel.salaries.filter((s) =>
      s.competences.some((c) => c.poste_id === id && c.niveau === niveau),
    ).length
  const besoinsSemaine = referentiel.besoins
    .filter((b) => b.poste_id === id)
    .reduce((n, b) => n + b.effectif * dureeHoraire(b.debut, b.fin), 0)
  const max = JOUR_MAX_CATEGORIE[p.categorie]
  const idNom = `poste-${id ?? 'nouveau'}-nom`

  return (
    <CarteReglage
      couleur={p.couleur}
      etiquette={neuf ? 'Nouveau poste' : `Poste ${nomAffiche}`}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={idNom}>Nom du poste</Label>
        <Input
          id={idNom}
          value={p.nom}
          disabled={!modifiable}
          maxLength={80}
          onChange={(e) => changer({ nom: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && void enregistrer()}
          className="font-medium"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Catégorie réglementaire</Label>
        <Select
          value={p.categorie}
          disabled={!modifiable}
          onValueChange={(v) =>
            changer({ categorie: v as SaisiePoste['categorie'] })
          }
        >
          <SelectTrigger
            className="w-full"
            aria-label="Catégorie réglementaire"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.libelle}, service max {heures(JOUR_MAX_CATEGORIE[c.code])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          Un service dure au plus {heures(max)} sur ce poste (convention HCR).
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Couleur</span>
        <Nuancier
          valeur={p.couleur}
          disabled={!modifiable}
          etiquette="Couleur du poste"
          onChange={(couleur) => changer({ couleur })}
        />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <Switch
          checked={p.a_part}
          disabled={!modifiable}
          onCheckedChange={(a_part) => changer({ a_part })}
          aria-label="Poste à part"
          className="mt-0.5"
        />
        <span className="text-muted-foreground">
          {p.a_part
            ? 'Poste à part : proposé seulement dans la fiche de qui le tient.'
            : 'Poste courant : proposé à toute la catégorie.'}
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <Switch
          checked={p.presence}
          disabled={!modifiable}
          onCheckedChange={(presence) => changer({ presence })}
          aria-label="Compte dans la présence matin et soir"
          className="mt-0.5"
        />
        <span className="text-muted-foreground">
          {p.presence
            ? 'Compte dans la présence du matin et du soir (consignes des besoins).'
            : 'Ne compte pas dans la présence du matin et du soir.'}
        </span>
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Horaires possibles</span>
        <ChoixCodes
          etiquette="Horaires possibles"
          horaires={referentiel.horaires}
          choisis={p.horaires_autorises}
          onChange={(horaires_autorises) => changer({ horaires_autorises })}
          disabled={!modifiable}
        />
        {p.horaires_autorises.length ? (
          <span className="text-xs text-muted-foreground">
            Seuls ces horaires sont proposés et placés sur ce poste.
          </span>
        ) : (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            Aucun horaire coché : ce poste accepte tous les codes. Cochez les
            siens pour éviter qu'un mauvais code lui soit attribué.
          </span>
        )}
      </div>

      {!neuf && (
        <dl className="grid grid-cols-4 gap-2 rounded-lg bg-muted/50 p-2 text-center">
          {[
            [compte('titulaire'), 'titulaires'],
            [compte('occasionnel'), 'dépannage'],
            [compte('soutien'), 'soutien'],
            [heures(besoinsSemaine), 'besoins / sem.'],
          ].map(([v, l]) => (
            <div key={l} className="flex flex-col">
              <dd className="font-semibold tabular-nums">{v}</dd>
              <dt className="text-[11px] text-muted-foreground">{l}</dt>
            </div>
          ))}
        </dl>
      )}

      <ErreursSaisie erreurs={modifiable ? erreurs : []} />

      {modifiable && (
        <div className="mt-auto flex items-center justify-end gap-2 pt-1">
          {!neuf && !modifie && (
            <Button
              variant="ghost"
              size="sm"
              className="mr-auto text-destructive hover:text-destructive"
              disabled={envoi}
              onClick={() => setSuppression(true)}
            >
              <Trash2 />
              Supprimer
            </Button>
          )}
          {(modifie || neuf) && (
            <>
              {modifie && !neuf && (
                <span className="mr-auto text-xs text-muted-foreground">
                  Non enregistré
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={envoi}
                onClick={() => (neuf ? onFin?.() : annuler())}
              >
                Annuler
              </Button>
              <Button
                size="sm"
                disabled={envoi || erreurs.length > 0}
                onClick={() => void enregistrer()}
              >
                {neuf ? 'Créer le poste' : 'Enregistrer'}
              </Button>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={suppression}
        onOpenChange={setSuppression}
        title={`Supprimer le poste ${nomAffiche} ?`}
        description="Ses besoins et ses shifts sont supprimés avec lui, et il est retiré des fiches et des catégories. Les plannings réalisés (semaines verrouillées) empêchent la suppression."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => void supprimer()}
      />
    </CarteReglage>
  )
}
