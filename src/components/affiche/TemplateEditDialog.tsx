import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { Field } from '#/components/form/fields.tsx'
import { nomPersonne } from '#/lib/affiche/service.ts'

import type { PersonneAffiche } from '#/lib/affiche/service.ts'

/** Valeur du choix « aucun auteur » (un Select n'accepte pas la chaîne vide). */
const SANS_AUTEUR = '__aucun__'

export interface ModificationModele {
  name: string
  /** Absent : l'auteur ne change pas. `null` : modèle de base, sans auteur. */
  createdBy?: string | null
}

/*
 * Modale « Modifier le modèle » (demande utilisateur du 2026-11-16) : renommer
 * le modèle sélectionné, ou le supprimer. Le contenu de l'affiche (textes,
 * icône, couleur, dates, tailles) s'édite toujours dans le panneau puis se
 * sauvegarde par le bouton du bas.
 *
 * AUTEUR (2026-11-16) : la gestion de la page (et l'admin) choisit qui est
 * l'auteur, donc qui peut modifier le modèle avec un simple droit d'écriture.
 * Le choix n'est montré que si `personnes` est fourni (gestion seule) ; la
 * base refuse toute autre écriture de l'auteur.
 *
 * La suppression se confirme DANS la modale (deuxième étape), pas par une
 * seconde modale empilée. Les droits sont décidés par l'appelant (gestion :
 * tous les modèles ; écriture : les siens), et la RLS les impose en base.
 */
export function TemplateEditDialog({
  open,
  onOpenChange,
  name,
  auteur,
  personnes,
  onSave,
  onDelete,
  pending = false,
  error = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Nom actuel du modèle. */
  name: string
  /** Auteur actuel (`null` : modèle de base). */
  auteur: string | null
  /**
   * Auteurs possibles, pour la gestion seulement (`undefined` : le choix de
   * l'auteur n'est pas montré ; `null` : liste en cours de lecture).
   */
  personnes?: PersonneAffiche[] | null
  onSave: (modification: ModificationModele) => void
  onDelete: () => void
  pending?: boolean
  /** Échec de la dernière action, affiché dans la modale restée ouverte. */
  error?: string | null
}) {
  const [value, setValue] = useState(name)
  const [choixAuteur, setChoixAuteur] = useState(auteur ?? SANS_AUTEUR)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Repart de l'état actuel, sans confirmation en cours, à chaque ouverture.
  useEffect(() => {
    if (open) {
      setValue(name)
      setChoixAuteur(auteur ?? SANS_AUTEUR)
      setConfirmDelete(false)
    }
  }, [open, name, auteur])

  const montrerAuteur = personnes !== undefined
  const nouvelAuteur = choixAuteur === SANS_AUTEUR ? null : choixAuteur
  const auteurChange = montrerAuteur && nouvelAuteur !== auteur
  // Auteur actuel absent de la liste : il a perdu son droit d'écriture.
  const auteurHorsListe =
    auteur !== null &&
    personnes != null &&
    !personnes.some((p) => p.id === auteur)

  const trimmed = value.trim()
  const canSave =
    trimmed !== '' && (trimmed !== name || auteurChange) && !pending

  function enregistrer() {
    if (!canSave) return
    onSave(
      auteurChange
        ? { name: trimmed, createdBy: nouvelAuteur }
        : { name: trimmed },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {confirmDelete ? (
          <>
            <DialogHeader>
              <DialogTitle>Supprimer le modèle ?</DialogTitle>
              <DialogDescription>
                Le modèle {name} sera supprimé. Cette action est définitive.
              </DialogDescription>
            </DialogHeader>
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmDelete(false)}
                disabled={pending}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={onDelete}
                disabled={pending}
              >
                <Trash2 />
                Supprimer
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Modifier le modèle</DialogTitle>
            </DialogHeader>

            <Field label="Nom du modèle">
              <Input
                value={value}
                autoFocus
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') enregistrer()
                }}
                placeholder="Nom affiché dans la liste"
              />
            </Field>

            {montrerAuteur && (
              <Field label="Auteur">
                <div className="space-y-1.5">
                  <Select
                    value={choixAuteur}
                    onValueChange={setChoixAuteur}
                    disabled={personnes === null}
                  >
                    <SelectTrigger className="w-full" aria-label="Auteur">
                      <SelectValue
                        placeholder={
                          personnes === null ? 'Chargement…' : 'Choisir'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value={SANS_AUTEUR}>
                        Aucun (modèle de base)
                      </SelectItem>
                      {auteurHorsListe && (
                        <SelectItem value={auteur}>
                          Auteur actuel, sans droit sur la page
                        </SelectItem>
                      )}
                      {(personnes ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {nomPersonne(p)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {nouvelAuteur === null
                      ? 'Seule la gestion pourra le modifier.'
                      : 'L’auteur peut le modifier et le supprimer. La gestion aussi.'}
                  </p>
                </div>
              </Field>
            )}

            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}

            <DialogFooter className="sm:justify-between">
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
                disabled={pending}
              >
                <Trash2 />
                Supprimer
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Annuler
                </Button>
                <Button disabled={!canSave} onClick={enregistrer}>
                  Enregistrer
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
