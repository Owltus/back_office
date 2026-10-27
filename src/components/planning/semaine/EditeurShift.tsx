/*
 * Éditeur d'un shift, en tiroir (prototype `EditeurShift.tsx`) : créer ou
 * modifier un shift (code horaire ou heures libres avec pause, journée
 * courte, poste, personne, jour, validé), ou poser une absence à la place,
 * ou supprimer le shift. Le tiroir se ferme aussitôt l'action lancée : le
 * résultat arrive par le fil de messages. Partagé par la vue semaine et la
 * vue mois (`dateEnLettres` : le jour s'y lit en toutes lettres, prototype
 * `quand`).
 */

import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { BadgeCheck, Trash2, Undo2 } from 'lucide-react'

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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet.tsx'
import { Switch } from '#/components/ui/switch.tsx'
import { Tip } from '#/components/shared/Tip.tsx'
import {
  disponibleLe,
  grouperHoraires,
  heures,
  NIVEAUX,
  texteSur,
} from '#/lib/planning/affichage.ts'
import { estEcole } from '#/lib/planning/semaine.ts'
import type { ShiftOut } from '#/lib/planning/semaine.ts'
import type { ShiftSaisi } from '#/lib/planning/service.ts'
import {
  ajouterJours,
  heureAffichee,
  horaireDe,
  minutes,
  presence,
} from '#/lib/planning/temps.ts'
import { JOURS } from '#/lib/planning/types.ts'
import type { Referentiel } from '#/lib/planning/types.ts'
import { cn } from '#/lib/utils.ts'
import { CodeRegle } from '#/components/planning/semaine/PanneauAlertes.tsx'
import {
  horairesPermis,
  NEUTRE,
  travailCode,
} from '#/components/planning/semaine/edition.ts'

export type Edition =
  | { mode: 'creation'; salarie_id: number; jour: number }
  | { mode: 'modification'; shift: ShiftOut }

const PAUSES = [0, 15, 20, 30, 45, 60, 90]

const EN_LETTRES = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
/** « mercredi 18 novembre 2026 ». */
export const dateEnLettres = (iso: string) =>
  EN_LETTRES.format(new Date(`${iso}T12:00:00Z`))

/** Délai après lequel « Confirmer la suppression » se désarme. */
export const DESARMEMENT_MS = 4000

interface Brouillon {
  salarie_id: number
  poste_id: number
  jour: number
  horaire_id: number | null
  debut: string
  fin: string
  court: boolean
  pause: number
}

export function EditeurShift({
  edition,
  lundi,
  referentiel,
  absence,
  onFermer,
  onCreer,
  onModifier,
  onSupprimer,
  onPoserAbsence,
  onRetirerAbsence,
  dateEnLettres: enLettres = false,
}: {
  edition: Edition
  lundi: string
  /** Vue mois : la date en toutes lettres plutôt que le jour de la semaine. */
  dateEnLettres?: boolean
  referentiel: Referentiel
  /** Absence déjà posée sur le jour (création). */
  absence: { motif_id: number | null; fixe: boolean } | null
  onFermer: () => void
  onCreer: (s: ShiftSaisi) => void
  onModifier: (id: number, s: Partial<ShiftSaisi>) => void
  onSupprimer: (id: number) => void
  onPoserAbsence: (salarieId: number, jour: number, motifId: number) => void
  onRetirerAbsence: (salarieId: number, jour: number) => void
}) {
  const { horaires, postes, salaries, motifs } = referentiel
  const existant = edition.mode === 'modification' ? edition.shift : null
  const salarieInitial =
    existant?.salarie_id ??
    (edition.mode === 'creation' ? edition.salarie_id : 0)
  const personne = salaries.find((s) => s.id === salarieInitial)
  const jourInitial =
    existant?.jour ?? (edition.mode === 'creation' ? edition.jour : 0)
  const posteParDefaut =
    existant?.poste_id ??
    personne?.competences.find((c) => c.niveau === 'titulaire')?.poste_id ??
    personne?.competences.at(0)?.poste_id ??
    postes.at(0)?.id ??
    0
  const horaireInitial = existant
    ? undefined
    : horairesPermis(posteParDefaut, personne, jourInitial, horaires, postes)[0]

  const [b, setB] = useState<Brouillon>(() => ({
    salarie_id: salarieInitial,
    poste_id: posteParDefaut,
    jour: jourInitial,
    horaire_id: existant
      ? existant.type_shift_id
      : (horaireInitial?.id ?? null),
    debut: existant?.debut ?? horaireInitial?.debut ?? '09:00',
    fin: existant?.fin ?? horaireInitial?.fin ?? '17:00',
    court: existant?.court ?? false,
    pause: existant?.pause ?? 0,
  }))
  // Sans code horaire permis : horaire spécifique d'emblée.
  const [libre, setLibre] = useState(
    existant ? existant.type_shift_id === null : !horaireInitial,
  )
  const [epinglee, setEpinglee] = useState(existant?.epinglee ?? true)
  const [motif, setMotif] = useState<number | null>(null)
  // « Non attribué » choisi : la case redevient vide à l'enregistrement.
  const [vider, setVider] = useState(false)
  const [confirmerSuppression, setConfirmerSuppression] = useState(false)
  // Suppression en deux temps : sans confirmation dans les 4 s, elle se désarme.
  useEffect(() => {
    if (!confirmerSuppression) return
    const t = window.setTimeout(
      () => setConfirmerSuppression(false),
      DESARMEMENT_MS,
    )
    return () => window.clearTimeout(t)
  }, [confirmerSuppression])

  const maj = (champs: Partial<Brouillon>) => setB((x) => ({ ...x, ...champs }))
  const code = libre ? undefined : horaires.find((h) => h.id === b.horaire_id)
  const niveau = (posteId: number, salarieId = b.salarie_id) =>
    salaries
      .find((s) => s.id === salarieId)
      ?.competences.find((c) => c.poste_id === posteId)?.niveau

  const absenceActuelle = absence
    ? motifs.find((m) => m.id === absence.motif_id)
    : undefined
  const ecoleActuelle = !!absenceActuelle && estEcole(absenceActuelle)
  const motifChoisi = motifs.find((m) => m.id === motif)

  // Changer de poste ou de personne : un code qui n'y est plus permis cède la
  // place au premier permis (le code d'origine d'un shift reste accepté).
  const changerQui = (
    champs: Partial<Pick<Brouillon, 'poste_id' | 'salarie_id'>>,
  ) => {
    const suite = { ...b, ...champs }
    const permis = horairesPermis(
      suite.poste_id,
      salaries.find((s) => s.id === suite.salarie_id),
      suite.jour,
      horaires,
      postes,
    )
    const garde =
      libre ||
      permis.some((h) => h.id === suite.horaire_id) ||
      suite.horaire_id === existant?.type_shift_id
    if (garde) return maj(champs)
    const premier = permis.at(0)
    if (premier) {
      maj({
        ...champs,
        horaire_id: premier.id,
        debut: premier.debut,
        fin: premier.fin,
        court: false,
      })
    } else {
      maj(champs)
      setLibre(true)
    }
  }

  const dateDuJour = (jour: number) => ajouterJours(lundi, jour)
  const choisissables = salaries.filter(
    (s) => disponibleLe(s, dateDuJour(b.jour)) || s.id === b.salarie_id,
  )
  const choisi = salaries.find((s) => s.id === b.salarie_id)
  const inchange =
    !!existant &&
    existant.salarie_id === b.salarie_id &&
    existant.jour === b.jour
  const indisponible =
    !!choisi && !disponibleLe(choisi, dateDuJour(b.jour)) && !inchange

  // Horaire spécifique : début et fin différents, pause plus courte que la présence.
  const presenceLibre = presence(b.debut, b.fin)
  const erreurLibre =
    motif === null && libre
      ? minutes(b.debut) % 1440 === minutes(b.fin) % 1440
        ? 'Le début et la fin sont identiques : choisissez une autre heure de fin.'
        : b.pause >= presenceLibre
          ? 'La pause doit être plus courte que le shift.'
          : null
      : null
  const bloque = indisponible
    ? 'Pas sous contrat (ou désactivé) ce jour-là : voir sa fiche'
    : erreurLibre

  const valeurs = (): ShiftSaisi => {
    if (libre) {
      return { ...b, horaire_id: null, court: false, epinglee }
    }
    const h = code
    const court = !!(b.court && h?.raccourci)
    // Code et journée courte inchangés : on garde les heures enregistrées (la
    // pause est celle du shift, un code retouché depuis ne les réécrit pas).
    if (
      existant &&
      h &&
      existant.type_shift_id === h.id &&
      existant.court === court
    ) {
      return {
        ...b,
        debut: existant.debut,
        fin: existant.fin,
        pause: existant.pause,
        court,
        epinglee,
      }
    }
    return {
      ...b,
      ...(h ? horaireDe(h, court) : {}),
      pause: h ? h.pause : b.pause,
      court,
      epinglee,
    }
  }

  const valider = () => {
    if (vider && existant) return onSupprimer(existant.id)
    if (vider && absence && !absence.fixe)
      return onRetirerAbsence(b.salarie_id, b.jour)
    if (bloque) return
    if (motif !== null) return onPoserAbsence(b.salarie_id, b.jour, motif)
    const v = valeurs()
    if (existant) onModifier(existant.id, v)
    else {
      const { epinglee: _e, ...reste } = v
      onCreer({ ...reste, epinglee: true })
    }
  }

  // Même règle que le clic droit (décision utilisateur du 2026-10-28 : « que
  // tout soit bien attribué ») : les codes du poste, réduits à ceux de la
  // fiche de la personne s'il y en a ; l'horaire actuel reste visible.
  const qui = salaries.find((s) => s.id === b.salarie_id)
  const codes = horairesPermis(b.poste_id, qui, b.jour, horaires, postes)
    .concat(horaires.filter((h) => h.id === existant?.type_shift_id))
    .filter((h, i, l) => l.findIndex((x) => x.id === h.id) === i)
  // Seulement les postes qu'elle tient (et celui du shift, s'il n'en est
  // pas) : un hôtelier ne voit plus Supervision ni Direction.
  const tenus = postes.filter(
    (p) =>
      niveau(p.id) !== undefined ||
      p.id === b.poste_id ||
      p.id === existant?.poste_id,
  )
  const postesTries = tenus.length ? tenus : postes
  const titre = existant
    ? 'Modifier le shift'
    : absence
      ? ecoleActuelle
        ? "Jour d'école"
        : "Jour d'absence"
      : 'Planifier le jour'
  const libellePrincipal = vider
    ? 'Vider la case'
    : motif !== null
      ? motifChoisi && estEcole(motifChoisi)
        ? "Poser l'école"
        : "Poser l'absence"
      : existant
        ? 'Enregistrer'
        : 'Ajouter le shift'

  const boutonPrincipal = (
    <Button onClick={valider} disabled={!!bloque}>
      {libellePrincipal}
    </Button>
  )

  return (
    <Sheet open onOpenChange={(o) => !o && onFermer()}>
      <SheetContent className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>{titre}</SheetTitle>
          <SheetDescription>
            {personne ? `${personne.prenom} ${personne.nom}` : ''} ·{' '}
            {enLettres
              ? dateEnLettres(ajouterJours(lundi, b.jour))
              : JOURS[b.jour]}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {existant && existant.alertes.length > 0 && (
            <div className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-sm">
              {existant.alertes.map((a, i) => (
                <div
                  key={i}
                  className={cn(a.nature === 'loi' && 'text-destructive')}
                >
                  {a.message}
                  <CodeRegle regle={a.regle} />
                </div>
              ))}
            </div>
          )}

          {absence && (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
              style={{ borderColor: absenceActuelle?.couleur }}
            >
              <strong style={{ color: absenceActuelle?.couleur }}>
                {absenceActuelle?.nom ?? 'Absent'}
              </strong>
              {absence.fixe ? (
                <span className="text-xs text-muted-foreground">
                  vient de la semaine type : à changer dans sa fiche
                </span>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRetirerAbsence(b.salarie_id, b.jour)}
                >
                  {ecoleActuelle ? "Retirer l'école" : "Retirer l'absence"}
                </Button>
              )}
            </div>
          )}

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Horaire</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {(existant || (absence && !absence.fixe)) && (
                <Choix
                  couleur={NEUTRE}
                  code="—"
                  titre="Non attribué"
                  detail="la case redevient vide"
                  choisi={vider}
                  onClick={() => {
                    setVider(true)
                    setMotif(null)
                  }}
                />
              )}
              {grouperHoraires(codes).map((g) => [
                <span
                  key={`titre-${g.libelle}`}
                  className="col-span-2 pt-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  {g.libelle}
                </span>,
                ...g.horaires.map((h) => (
                  <Choix
                    key={h.id}
                    couleur={h.couleur}
                    code={h.code}
                    titre={h.nom}
                    detail={`${heureAffichee(h.debut)}-${heureAffichee(h.fin)}${h.pause > 0 ? ` · ${heures(travailCode(h))} de travail` : ''}`}
                    choisi={
                      !vider &&
                      motif === null &&
                      !libre &&
                      b.horaire_id === h.id
                    }
                    onClick={() => {
                      setVider(false)
                      setLibre(false)
                      setMotif(null)
                      maj({
                        horaire_id: h.id,
                        debut: h.debut,
                        fin: h.fin,
                        pause: h.pause,
                      })
                    }}
                  />
                )),
              ])}
              <span className="col-span-2 pt-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Autre
              </span>
              <Choix
                couleur={NEUTRE}
                code="•"
                titre="Horaire spécifique"
                detail="heures libres"
                choisi={!vider && motif === null && libre}
                onClick={() => {
                  setVider(false)
                  setLibre(true)
                  setMotif(null)
                }}
              />
            </div>

            {[
              {
                titre: 'Ou une absence',
                aide: 'pas de travail ce jour-là',
                liste: motifs.filter((m) => !estEcole(m)),
              },
              {
                titre: "Ou l'école",
                aide: 'formation hors établissement',
                liste: motifs.filter(estEcole),
              },
            ]
              .filter((g) => g.liste.length > 0)
              .map((g) => (
                <div key={g.titre} className="space-y-1.5 pt-2">
                  <h4 className="text-xs font-semibold text-muted-foreground">
                    {g.titre}
                  </h4>
                  <div className="grid grid-cols-2 gap-1.5">
                    {g.liste.map((m) => (
                      <Choix
                        key={m.id}
                        couleur={m.couleur}
                        code={m.code}
                        titre={m.nom}
                        detail={g.aide}
                        choisi={motif === m.id}
                        onClick={() => {
                          setVider(false)
                          setMotif(m.id)
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}

            {motif === null && code && code.raccourci > 0 && (
              <Interrupteur
                id="planning-court"
                coche={b.court}
                onChange={(court) => maj({ court })}
              >
                Journée courte : {heureAffichee(horaireDe(code, true).debut)} →{' '}
                {heureAffichee(horaireDe(code, true).fin)} (
                {heures(travailCode(code) - code.raccourci)} de travail)
              </Interrupteur>
            )}

            {motif === null && libre && (
              <div className="space-y-3 pt-2">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="grid gap-1">
                    <Label htmlFor="planning-debut">Début</Label>
                    {/* Un champ heure ne sait pas afficher « 24:00 » : il montre
                        00:00 et l'interrupteur dessous dit de quel minuit il s'agit. */}
                    <Input
                      id="planning-debut"
                      type="time"
                      className="w-28"
                      value={b.debut === '24:00' ? '00:00' : b.debut}
                      onChange={(e) =>
                        e.target.value && maj({ debut: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="planning-fin">Fin</Label>
                    <Input
                      id="planning-fin"
                      type="time"
                      className="w-28"
                      value={b.fin}
                      onChange={(e) =>
                        e.target.value && maj({ fin: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="planning-pause">Pause</Label>
                    <Select
                      value={String(b.pause)}
                      onValueChange={(v) => maj({ pause: Number(v) })}
                    >
                      <SelectTrigger id="planning-pause" className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[...new Set([...PAUSES, b.pause])]
                          .sort((x, y) => x - y)
                          .map((p) => (
                            <SelectItem key={p} value={String(p)}>
                              {p === 0 ? 'Aucune' : `${p} min`}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <span className="pb-2 text-sm text-muted-foreground">
                    {heures(Math.max(presenceLibre - b.pause, 0))} de travail
                  </span>
                </div>
                {(b.debut === '00:00' || b.debut === '24:00') && (
                  <Interrupteur
                    id="planning-minuit"
                    coche={b.debut === '24:00'}
                    onChange={(soir) =>
                      maj({ debut: soir ? '24:00' : '00:00' })
                    }
                    aide="Activé : le shift commence à minuit à la fin de ce jour, comme une nuit qui démarre le soir même. Désactivé : il commence à minuit au tout début de ce jour."
                  >
                    Commence à 00:00 en fin de journée (nuit vers le lendemain)
                  </Interrupteur>
                )}
                {erreurLibre && (
                  <p className="text-sm text-destructive">{erreurLibre}</p>
                )}
              </div>
            )}
          </section>

          {motif === null && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Poste</h3>
              <div className="flex flex-wrap gap-1.5">
                {postesTries.map((p) => {
                  const n = niveau(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={b.poste_id === p.id}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors hover:bg-muted',
                        b.poste_id === p.id && 'border-primary bg-primary/10',
                      )}
                      onClick={() => changerQui({ poste_id: p.id })}
                    >
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: p.couleur }}
                      />
                      {p.nom}
                      <small
                        className={cn(
                          'text-xs',
                          n
                            ? 'text-muted-foreground'
                            : 'text-muted-foreground/50',
                        )}
                      >
                        {n ? NIVEAUX[n].libelle : 'non tenu'}
                      </small>
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Qui et quand</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label htmlFor="planning-qui">Membre du staff</Label>
                <Select
                  value={String(b.salarie_id)}
                  onValueChange={(v) => changerQui({ salarie_id: Number(v) })}
                >
                  <SelectTrigger id="planning-qui" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {choisissables.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.prenom} {s.nom}
                        {disponibleLe(s, dateDuJour(b.jour))
                          ? ''
                          : ' (hors contrat ce jour-là)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="planning-jour">Jour</Label>
                <Select
                  value={String(b.jour)}
                  onValueChange={(v) => maj({ jour: Number(v) })}
                >
                  <SelectTrigger id="planning-jour" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {JOURS.map((j, i) => (
                      <SelectItem key={j} value={String(i)}>
                        {j}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {indisponible && (
              <p className="text-sm text-destructive">
                {choisi.prenom} n'est pas sous contrat (ou est désactivé) ce
                jour-là : choisissez une autre personne ou un autre jour.
              </p>
            )}
            {existant && motif === null && (
              <Interrupteur
                id="planning-valide"
                coche={epinglee}
                onChange={setEpinglee}
              >
                <span className="inline-flex items-center gap-1.5">
                  {epinglee ? (
                    <BadgeCheck className="size-4 text-emerald-500" />
                  ) : (
                    <Undo2 className="size-4" />
                  )}
                  {epinglee
                    ? 'Validé : les générations gardent ce shift tel quel'
                    : 'Proposition : la prochaine génération pourra le changer'}
                </span>
              </Interrupteur>
            )}
          </section>
        </div>

        <SheetFooter className="flex-row items-center border-t">
          {existant && (
            <div className="mr-auto">
              {confirmerSuppression ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onSupprimer(existant.id)}
                >
                  Confirmer la suppression
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmerSuppression(true)}
                >
                  <Trash2 />
                  Supprimer
                </Button>
              )}
            </div>
          )}
          <Button
            variant="outline"
            className={existant ? undefined : 'ml-auto'}
            onClick={onFermer}
          >
            Annuler
          </Button>
          {bloque ? (
            <Tip label={bloque}>
              <span tabIndex={0} className="inline-flex">
                {boutonPrincipal}
              </span>
            </Tip>
          ) : (
            boutonPrincipal
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function Choix({
  couleur,
  code,
  titre,
  detail,
  choisi,
  onClick,
}: {
  couleur: string
  code: string
  titre: string
  detail: string
  choisi: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={choisi}
      onClick={onClick}
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors hover:bg-muted',
        choisi && 'border-primary bg-primary/10 ring-1 ring-primary',
      )}
      style={{ '--couleur': couleur } as CSSProperties}
    >
      <span
        className="inline-grid h-[18px] min-w-6 shrink-0 place-items-center rounded px-1 text-[10.5px] font-bold"
        style={{ background: couleur, color: texteSur(couleur) }}
      >
        {code}
      </span>
      <span className="grid min-w-0">
        <strong className="truncate text-sm font-medium">{titre}</strong>
        <small className="truncate text-xs text-muted-foreground">
          {detail}
        </small>
      </span>
    </button>
  )
}

function Interrupteur({
  id,
  coche,
  onChange,
  aide,
  children,
}: {
  id: string
  coche: boolean
  onChange: (v: boolean) => void
  aide?: string
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5 pt-2">
      <Switch
        id={id}
        checked={coche}
        onCheckedChange={onChange}
        className="mt-0.5"
      />
      <Label
        htmlFor={id}
        className="grid gap-0.5 text-sm leading-snug font-normal"
      >
        <span>{children}</span>
        {aide && <span className="text-xs text-muted-foreground">{aide}</span>}
      </Label>
    </div>
  )
}
