import { useCallback, useState } from 'react'

import { Textarea } from '#/components/ui/textarea.tsx'
import {
  DEMANDES_LLM,
  composerDemande,
  demandeMajeure,
} from '#/lib/classeur/llmDemandes.ts'

/*
 * Demandes toutes prêtes pour un LLM (étape 3 du plan
 * `classeur-fonctions-2026-10-04`), partagées par les deux exports JSON :
 * chapitre ou document (`EchangeJsonDialog`) et classeur complet
 * (`ExportJsonClasseurDialog`, D25 renversée par l'audit). Rien n'est
 * mémorisé (D26, poste partagé) : l'état vit dans le dialogue et repart de
 * zéro à sa fermeture.
 */

/** État des demandes : cases cochées et champ libre, plus le texte composé. */
export function useDemandesLlm() {
  const [demandes, setDemandes] = useState<ReadonlySet<string>>(new Set())
  const [autre, setAutre] = useState('')
  return {
    demandes,
    autre,
    setAutre,
    /** `null` si rien n'est demandé (le JSON reste celui d'avant). */
    demande: composerDemande(demandes, autre),
    basculer: useCallback(
      (id: string) =>
        setDemandes((avant) => {
          const s = new Set(avant)
          if (s.has(id)) s.delete(id)
          else s.add(id)
          return s
        }),
      [],
    ),
    /** Stable : utilisable dans l'effet de fermeture du dialogue. */
    oublier: useCallback(() => {
      setDemandes(new Set())
      setAutre('')
    }, []),
  }
}

export function ChoixDemandesLlm({
  demandes,
  onBasculer,
  autre,
  onAutre,
}: {
  demandes: ReadonlySet<string>
  onBasculer: (id: string) => void
  autre: string
  onAutre: (texte: string) => void
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-xs text-muted-foreground">
        Demandes au LLM (facultatif) : ajoutées au JSON et en tête du texte
        copié.
      </legend>
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        {DEMANDES_LLM.map((d) => (
          <label
            key={d.id}
            title={d.aide}
            className="flex min-h-8 cursor-pointer items-center gap-2 text-sm pointer-coarse:min-h-11"
          >
            <input
              type="checkbox"
              checked={demandes.has(d.id)}
              onChange={() => onBasculer(d.id)}
              className="size-4 shrink-0 accent-primary"
            />
            <span>
              {d.libelle}
              <span className="sr-only"> : {d.aide}</span>
            </span>
          </label>
        ))}
      </div>
      <Textarea
        value={autre}
        onChange={(e) => onAutre(e.target.value)}
        placeholder="Autre demande…"
        aria-label="Autre demande"
        rows={2}
        className="min-h-14 resize-none text-sm [field-sizing:fixed]"
      />
      {demandeMajeure(demandes) && (
        <p className="text-xs text-muted-foreground">
          Traduire ou Raccourcir créeront une nouvelle version majeure à
          l'import.
        </p>
      )}
    </fieldset>
  )
}
