import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, Loader2 } from 'lucide-react'

import { IconPicker } from '#/components/classeur/IconPicker.tsx'
import { useInvaliderClasseur } from '#/components/classeur/hooks/useClasseur.ts'
import { Alert, AlertDescription } from '#/components/ui/alert.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { messageErreur } from '#/lib/classeur/erreur.ts'
import {
  useDroitsPageClasseur,
  usePersonnesClasseur,
} from '#/components/classeur/hooks/useDroitsClasseur.ts'
import {
  LIBELLE_VISIBILITE,
  peutChangerAuteur,
  peutChangerType,
  peutEtreAuteur,
} from '#/lib/classeur/droits.ts'
import type { Visibilite } from '#/lib/classeur/droits.ts'
import { nomAuteur } from '#/lib/classeur/auteurs.ts'
import {
  CLASSES_PASTILLE,
  COULEURS_CLASSEUR,
  NOM_COULEUR,
  couleurDe,
} from '#/lib/classeur/couleurs.ts'
import type { CouleurClasseur } from '#/lib/classeur/couleurs.ts'
import {
  createClasseur,
  rangerClasseur,
  updateClasseur,
} from '#/lib/classeur/service.ts'
import { cn } from '#/lib/utils.ts'
import type { ClasseurInput } from '#/lib/classeur/service.ts'
import type { DbClasseur } from '#/lib/classeur/types.ts'

/** Ce que dit chaque type, sous son nom. */
const AIDE_TYPE: Record<Visibilite, string> = {
  public: 'Tous ceux qui ont la page le lisent.',
  prive: 'Son auteur seul.',
  gestion: 'La gestion de la page seule.',
}

const ICONE_PAR_DEFAUT = 'BookOpen'

/**
 * Dialogue de création OU d'édition d'un classeur (nom, icône, établissement,
 * complément) — fusion des deux dialogues de Registre (`ClasseurListPage`,
 * `DashboardPage`). Édition si `classeur` est fourni.
 *
 * TYPE ET AUTEUR (2026-11-16) : à la création, le type (public, privé, et
 * gestion pour la gestion) ; en édition, l'auteur et la gestion changent le
 * type et l'auteur (`lib/classeur/droits.ts`), les autres voient l'auteur.
 *
 * Le dialogue porte sa mutation : écriture, puis invalidation de
 * `classeurKeys.all`, puis `onDone(id)`. L'erreur (dont le refus RLS 42501)
 * s'affiche dans le dialogue, sous le formulaire.
 */
export function ClasseurDialog({
  open,
  onOpenChange,
  classeur,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Classeur à modifier ; absent = création. */
  classeur?: DbClasseur | null
  /** Appelé après l'écriture avec l'identifiant du classeur. */
  onDone?: (classeurId: number) => void
}) {
  const edition = classeur != null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {edition ? 'Modifier le classeur' : 'Nouveau classeur'}
          </DialogTitle>
          <DialogDescription>
            {edition
              ? 'Nom, icône et établissement imprimés sur le classeur.'
              : 'Un classeur regroupe des chapitres prêts à imprimer.'}
          </DialogDescription>
        </DialogHeader>
        {/* Radix démonte le contenu à la fermeture : l'état du formulaire
            repart des props à chaque ouverture, sans effet de synchronisation. */}
        <ClasseurForm
          classeur={classeur ?? null}
          onCancel={() => onOpenChange(false)}
          onDone={(id) => {
            onOpenChange(false)
            onDone?.(id)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function ClasseurForm({
  classeur,
  onCancel,
  onDone,
}: {
  classeur: DbClasseur | null
  onCancel: () => void
  onDone: (classeurId: number) => void
}) {
  const [name, setName] = useState(classeur?.name ?? '')
  const [icon, setIcon] = useState(classeur?.icon ?? ICONE_PAR_DEFAUT)
  const [couleur, setCouleur] = useState<CouleurClasseur>(
    couleurDe(classeur?.couleur),
  )
  const [etablissement, setEtablissement] = useState(
    classeur?.etablissement ?? '',
  )
  const [complement, setComplement] = useState(
    classeur?.etablissement_complement ?? '',
  )
  const invalider = useInvaliderClasseur()
  const { moi, typesCreables } = useDroitsPageClasseur()
  const [type, setType] = useState<Visibilite>(classeur?.visibilite ?? 'public')
  const [auteur, setAuteur] = useState<string | null>(
    classeur?.created_by ?? null,
  )
  const personnes = usePersonnesClasseur(classeur != null)

  // Types proposés : à la création, ceux que l'on peut créer ; en édition,
  // le type actuel et ceux vers lesquels on peut le changer.
  const types: Visibilite[] = classeur
    ? (['public', 'prive', 'gestion'] as const).filter(
        (t) => t === classeur.visibilite || peutChangerType(moi, classeur, t),
      )
    : typesCreables
  const changerAuteur = classeur != null && peutChangerAuteur(moi, classeur)
  const auteursPossibles = (personnes.data ?? []).filter((p) =>
    peutEtreAuteur(p.niveau_page, type),
  )
  // Un classeur PRIVÉ est à soi, sauf pour l'admin : la base refuse qu'on se
  // cache un classeur (un privé donné à un autre disparaîtrait). Un privé
  // déplacé par la gestion devient donc le sien, et l'auteur d'un privé ne
  // peut pas le donner tel quel (le passer d'abord en public).
  const auteurFige = classeur != null && type === 'prive' && !moi.admin
  const auteurVoulu = auteurFige ? (moi.userId ?? null) : auteur
  // L'auteur choisi n'a que la lecture : il lira « son » classeur sans le
  // modifier (décision utilisateur du 2026-11-16), on le lui dit.
  const auteurEnLecture =
    personnes.data?.find((p) => p.id === auteurVoulu)?.niveau_page === 'lecture'
  // Inchangé (type et auteur) : rien à vérifier ; sinon l'auteur doit
  // pouvoir tenir un classeur de ce type (la base le refuse aussi).
  const auteurValide =
    (auteurVoulu === classeur?.created_by && type === classeur.visibilite) ||
    auteursPossibles.some((p) => p.id === auteurVoulu)

  const mutation = useMutation({
    mutationFn: async (input: ClasseurInput) => {
      if (classeur) {
        await updateClasseur(classeur.id, input)
        const patch: { visibilite?: Visibilite; created_by?: string } = {}
        if (type !== classeur.visibilite) patch.visibilite = type
        if (auteurVoulu !== null && auteurVoulu !== classeur.created_by)
          patch.created_by = auteurVoulu
        if (Object.keys(patch).length > 0)
          await rangerClasseur(classeur.id, patch)
        return classeur.id
      }
      return createClasseur(input, type)
    },
    onSuccess: async (id) => {
      await invalider()
      onDone(id)
    },
  })

  const valide = name.trim() !== '' && (!changerAuteur || auteurValide)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!valide || mutation.isPending) return
        mutation.mutate({
          name: name.trim(),
          icon,
          etablissement: etablissement.trim(),
          etablissement_complement: complement.trim(),
          couleur,
        })
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="classeur-name">Nom</Label>
        <Input
          id="classeur-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Registre de sécurité"
          autoFocus
          maxLength={200}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Icône</Label>
        <IconPicker value={icon} onChange={setIcon} />
      </div>

      <div className="flex flex-col gap-2">
        <Label id="classeur-couleur">Couleur</Label>
        <div
          role="radiogroup"
          aria-labelledby="classeur-couleur"
          className="grid grid-cols-7 justify-items-center gap-2 sm:grid-cols-14 sm:gap-1.5"
        >
          {COULEURS_CLASSEUR.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={couleur === c}
              aria-label={NOM_COULEUR[c]}
              title={NOM_COULEUR[c]}
              onClick={() => setCouleur(c)}
              className={cn(
                'size-6 rounded-full ring-offset-2 ring-offset-background transition-shadow',
                CLASSES_PASTILLE[c],
                couleur === c
                  ? 'ring-2 ring-foreground'
                  : 'hover:ring-2 hover:ring-border',
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="classeur-etablissement">Établissement</Label>
        <Input
          id="classeur-etablissement"
          value={etablissement}
          onChange={(e) => setEtablissement(e.target.value)}
          placeholder="Okko Hotels"
          maxLength={200}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="classeur-complement">Complément</Label>
        <Input
          id="classeur-complement"
          value={complement}
          onChange={(e) => setComplement(e.target.value)}
          placeholder="Nantes Centre-ville (facultatif)"
          maxLength={200}
        />
      </div>

      {types.length > 1 && (
        <div className="flex flex-col gap-2">
          <Label>Tableau</Label>
          <div
            role="radiogroup"
            aria-label="Type du classeur"
            className={cn(
              'grid gap-2',
              types.length === 3 ? 'grid-cols-3' : 'grid-cols-2',
            )}
          >
            {types.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                onClick={() => setType(t)}
                className={cn(
                  'rounded-md border p-2.5 text-left text-sm transition-colors',
                  type === t
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-accent',
                )}
              >
                <span className="block font-medium">
                  {LIBELLE_VISIBILITE[t]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {AIDE_TYPE[t]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {classeur && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="classeur-auteur">Auteur</Label>
          {changerAuteur && !auteurFige ? (
            <Select
              value={auteur ?? undefined}
              onValueChange={setAuteur}
              disabled={personnes.isPending}
            >
              <SelectTrigger
                id="classeur-auteur"
                className="w-full"
                aria-label="Auteur"
              >
                <SelectValue
                  placeholder={
                    personnes.isPending ? 'Chargement…' : 'Choisir l’auteur'
                  }
                />
              </SelectTrigger>
              <SelectContent position="popper">
                {auteur !== null &&
                  !auteursPossibles.some((p) => p.id === auteur) && (
                    <SelectItem value={auteur}>
                      {nomAuteur(auteur, personnes.data, moi.userId)}, sans
                      droit pour ce type
                    </SelectItem>
                  )}
                {auteursPossibles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {nomAuteur(p.id, personnes.data, moi.userId)}
                    {p.niveau_page === 'lecture' ? ' (lecture seule)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p id="classeur-auteur" className="text-sm">
              {nomAuteur(auteurVoulu, personnes.data, moi.userId)}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {auteurFige
              ? classeur?.created_by === moi.userId
                ? 'Un classeur privé reste le vôtre. Pour le donner à quelqu’un, rangez-le d’abord dans les classeurs publics.'
                : 'Un classeur privé que vous rangez chez vous devient le vôtre.'
              : type === 'prive'
                ? 'Seul l’auteur voit un classeur privé.'
                : 'L’auteur et la gestion peuvent changer son type et son auteur.'}
          </p>
          {auteurEnLecture && (
            <p className="text-xs text-muted-foreground">
              Cette personne a la page en lecture : elle pourra lire ce
              classeur, pas le modifier.
            </p>
          )}
          {changerAuteur && !auteurValide && !personnes.isPending && (
            <p className="text-xs text-destructive">
              Cet auteur ne peut pas avoir un classeur de ce type : choisissez
              une autre personne.
            </p>
          )}
        </div>
      )}

      {mutation.isError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>
            {messageErreur(
              mutation.error,
              classeur ? 'Modification impossible' : 'Création impossible',
            )}
          </AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" disabled={!valide || mutation.isPending}>
          {mutation.isPending && <Loader2 className="animate-spin" />}
          {classeur ? 'Enregistrer' : 'Créer'}
        </Button>
      </DialogFooter>
    </form>
  )
}
