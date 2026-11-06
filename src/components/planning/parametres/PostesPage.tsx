/*
 * Paramètres du Planning : les postes (prototype `PostesPage.tsx`, spec §5.1).
 * Une carte par poste : nom, durée max d'un service (bornée par la loi
 * : 12 h), couleur, rangement à part, horaires
 * possibles (Tous ou Seulement ceux-ci). Enregistrement explicite par carte ;
 * un nouveau poste est une carte brouillon, créée en base à Enregistrer.
 * Seule la gestion modifie ; lecture et écriture voient les réglages.
 */

import { SectionNiveaux } from '#/components/planning/parametres/postes/SectionNiveaux.tsx'
import { lireNiveaux } from '#/lib/planning/niveaux.ts'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'

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
import { TousOuCertains } from '#/components/planning/parametres/reglages/TousOuCertains.tsx'
import {
  idCible,
  useOuvrirCible,
} from '#/components/planning/parametres/reglages/ouvrirCible.ts'
import type { PropsOuvrir } from '#/components/planning/parametres/reglages/ouvrirCible.ts'
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
import { Segmente } from '#/components/planning/parametres/equipe/Segmente.tsx'
import { lireRegles } from '#/lib/planning/reglesEtablissement.ts'
import { dureeHoraire, heures } from '#/lib/planning/affichage.ts'
import {
  JOUR_MAX_LOI,
  JOUR_MAX_POSTE_DEFAUT,
  presenceMaxPoste,
} from '#/lib/planning/regles.ts'
import {
  enregistrerPoste,
  ordonnerPostes,
  supprimerPoste,
} from '#/lib/planning/service.ts'
import { Tip } from '#/components/shared/Tip.tsx'
import {
  AIDE_INDISPENSABLE,
  AIDE_NON_INDISPENSABLE,
} from '#/components/planning/parametres/besoins/ordreDecision.ts'
import { estIndispensable } from '#/lib/planning/modele.ts'
import type { Poste, Referentiel } from '#/lib/planning/types.ts'

const saisieDe = (p: Poste): SaisiePoste => ({
  nom: p.nom,
  jour_max_minutes: presenceMaxPoste(p),
  couleur: p.couleur,
  horaires_autorises: [...p.horaires_autorises],
  zone_id: p.zone_id ?? null,
  ferme: p.ferme ?? false,
  ouverture: p.ouverture ?? null,
  feries_chomes: p.feries_chomes ?? false,
  // Oui / non (2026-11-05) : l'ancienne valeur « important » se lit non.
  indispensable: estIndispensable(p),
  fermeture: p.fermeture ?? null,
})

/** La zone d'un poste (2026-11-06, remplace le choix Accueil non / matin et
 * soir / nuit) : aucune, ou une zone de l'établissement. Le poste compte
 * dans chaque moment du tableau de sa zone que touchent ses horaires. */
const AUCUNE_ZONE = 'aucune'
const nomZone = (r: Referentiel, id: number | null | undefined) =>
  id == null
    ? undefined
    : lireRegles(r).zones.find((z) => z.id === String(id))?.nom

export function PostesPage({ ouvrir: lien, onOuvert }: PropsOuvrir = {}) {
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
  useOuvrirCible(
    lien,
    !!ref.data,
    (cible) => {
      const id = idCible(cible, 'poste')
      if (id === undefined || !ref.data?.postes.some((p) => p.id === id))
        return false
      setNouveau(null)
      setOuvert(id)
      return true
    },
    onOuvert,
  )

  // L'organigramme (2026-11-03) : Monter / Descendre, jamais de chiffre ;
  // toute la liste est réécrite, aucun rang partagé.
  const ecrire = useEcriture()
  const notifier = useNotifier()
  const [deplacement, setDeplacement] = useState(false)
  const deplacer = async (i: number, sens: -1 | 1) => {
    if (!ref.data || deplacement) return
    const ids = ref.data.postes.map((p) => p.id)
    ;[ids[i], ids[i + sens]] = [ids[i + sens], ids[i]]
    setDeplacement(true)
    const r = await ecrire(
      () => ordonnerPostes(ids),
      "L'ordre des postes n'a pas pu être enregistré",
    )
    setDeplacement(false)
    if (!r.ok) notifier(r.message, 'danger')
  }

  const creer = () => {
    if (!ref.data) return
    setOuvert(null)
    setNouveau({
      nom: 'Nouveau poste',
      jour_max_minutes: JOUR_MAX_POSTE_DEFAUT,
      couleur: PALETTE[ref.data.postes.length % PALETTE.length],
      horaires_autorises: [],
      zone_id: null,
      ferme: false,
      ouverture: null,
      feries_chomes: false,
      indispensable: false,
      fermeture: null,
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
            texte="Un clic sur un poste ouvre son réglage : nom, durée max d'un service (12 h au plus, la loi), couleur et horaires possibles. L'ordre de la liste est l'organigramme : les flèches montent ou descendent un poste, et le planning range chaque groupe dans cet ordre, du poste le plus haut au plus bas."
          />
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <span>Poste</span>
              <span>Horaires · personnes</span>
            </div>
            <ul className="divide-y">
              {ref.data.postes.map((p, i, tous) => (
                <LigneCompacte
                  key={p.id}
                  actions={
                    modifiable ? (
                      <>
                        <Tip label={`Monter ${p.nom}`}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Monter ${p.nom}`}
                            disabled={i === 0 || deplacement}
                            onClick={() => void deplacer(i, -1)}
                          >
                            <ArrowUp />
                          </Button>
                        </Tip>
                        <Tip label={`Descendre ${p.nom}`}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Descendre ${p.nom}`}
                            disabled={i === tous.length - 1 || deplacement}
                            onClick={() => void deplacer(i, 1)}
                          >
                            <ArrowDown />
                          </Button>
                        </Tip>
                      </>
                    ) : undefined
                  }
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
                      {p.ferme && <Etiquette>fermé</Etiquette>}
                      {!p.ferme && nomZone(ref.data, p.zone_id) && (
                        <Etiquette>
                          {nomZone(ref.data, p.zone_id)?.toLocaleLowerCase(
                            'fr-FR',
                          )}
                        </Etiquette>
                      )}
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

          <SectionNiveaux referentiel={ref.data} modifiable={modifiable} />

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
                  Nom, durée max d'un service, couleur et horaires possibles
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

/** « 2 horaires · 3 personnes » : ce qu'un poste permet et qui le tient. */
function resumePoste(p: Poste, r: Referentiel): string {
  const nombre = p.horaires_autorises.length
  const personnes = r.salaries.filter(
    (s) => s.actif && s.competences.some((c) => c.poste_id === p.id),
  ).length
  return `${nombre ? `${nombre} horaire${nombre > 1 ? 's' : ''}` : 'tous les horaires'} · ${personnes} personne${personnes > 1 ? 's' : ''}`
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
    // Un nouveau poste arrive en bas de l'organigramme.
    const valeurs = neuf
      ? {
          ...nettoyerPoste(p),
          ordre:
            Math.max(-1, ...referentiel.postes.map((x) => x.ordre ?? 0)) + 1,
        }
      : nettoyerPoste(p)
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
    referentiel.salaries.filter(
      (s) =>
        s.actif &&
        s.competences.some((c) => c.poste_id === id && c.niveau === niveau),
    ).length
  const besoinsSemaine = referentiel.besoins
    .filter((b) => b.poste_id === id)
    .reduce((n, b) => n + b.effectif * dureeHoraire(b.debut, b.fin), 0)
  const max = presenceMaxPoste(p)
  // De 4 h à la loi, par demi-heure ; la valeur actuelle toujours proposée.
  const choixMax = [
    ...new Set([
      ...Array.from(
        { length: (JOUR_MAX_LOI - 240) / 30 + 1 },
        (_, i) => 240 + i * 30,
      ),
      max,
    ]),
  ].sort((a, b) => a - b)
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
        <Label>Durée max d'un service</Label>
        <Select
          value={String(max)}
          disabled={!modifiable}
          onValueChange={(v) => changer({ jour_max_minutes: Number(v) })}
        >
          <SelectTrigger className="w-full" aria-label="Durée max d'un service">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {choixMax.map((m) => (
              <SelectItem key={m} value={String(m)}>
                {heures(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          Un service dure au plus {heures(max)} sur ce poste, pause comprise. La
          loi ne permet jamais plus de {heures(JOUR_MAX_LOI)}.
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

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Zone</span>
        <Segmente<string>
          label="Zone"
          valeur={p.zone_id == null ? AUCUNE_ZONE : String(p.zone_id)}
          options={[
            { valeur: AUCUNE_ZONE, libelle: 'Aucune' },
            ...lireRegles(referentiel).zones.map((z) => ({
              valeur: z.id,
              libelle: z.nom,
            })),
          ]}
          disabled={!modifiable}
          onChange={(v) =>
            changer({ zone_id: v === AUCUNE_ZONE ? null : Number(v) })
          }
        />
        <span className="text-xs text-muted-foreground">
          {p.zone_id == null
            ? 'Poste à part : il a sa propre grille dans la page Besoins.'
            : `Compte dans le tableau ${nomZone(referentiel, p.zone_id) ?? ''} de la page Besoins, à chaque moment que touchent ses horaires, le jour comme la nuit.`}
        </span>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <Switch
          checked={estIndispensable(p)}
          disabled={!modifiable}
          onCheckedChange={(oui) => changer({ indispensable: oui })}
          aria-label="Indispensable au fonctionnement"
          className="mt-0.5"
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">Indispensable au fonctionnement</span>
          <span className="text-xs text-muted-foreground">
            {estIndispensable(p) ? AIDE_INDISPENSABLE : AIDE_NON_INDISPENSABLE}
          </span>
        </span>
      </label>

      <p className="text-xs text-muted-foreground">
        L'ouverture et la fermeture se règlent dans Besoins.
      </p>

      <label className="flex items-start gap-2 text-sm">
        <Switch
          checked={p.feries_chomes ?? false}
          disabled={!modifiable}
          onCheckedChange={(feries_chomes) => changer({ feries_chomes })}
          aria-label="Jours fériés chômés le jour même"
          className="mt-0.5"
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">Jours fériés chômés le jour même</span>
          <span className="text-xs text-muted-foreground">
            Pour l’encadrement. Un jour férié qui tombe un jour de travail de la
            semaine type est chômé, sans rattrapage. Un jour de repos habituel,
            rien. Après un an d’ancienneté. Vaut pour qui a ce poste en premier
            poste.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <Switch
          checked={p.ferme ?? false}
          disabled={!modifiable}
          onCheckedChange={(ferme) => changer({ ferme })}
          aria-label="Poste fermé"
          className="mt-0.5"
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">Poste fermé</span>
          <span className="text-xs text-muted-foreground">
            Plus proposé dans les fiches, les menus ni les besoins. Ses anciens
            shifts restent dans l'historique.
          </span>
        </span>
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Horaires possibles</span>
        <TousOuCertains
          etiquette="Horaires possibles"
          choisis={p.horaires_autorises}
          proposes={referentiel.horaires.map((h) => h.id)}
          onChange={(horaires_autorises) => changer({ horaires_autorises })}
          disabled={!modifiable}
          texteTous={
            referentiel.horaires.length
              ? `Tous les horaires (${referentiel.horaires.length}), y compris ceux créés plus tard.`
              : 'Aucun horaire pour l’instant : créez-les dans Horaires et absences.'
          }
        >
          {(liste) => (
            <>
              <ChoixCodes
                etiquette="Horaires possibles"
                horaires={referentiel.horaires}
                choisis={liste.choisis}
                onChange={liste.onChange}
                disabled={!modifiable}
              />
              <span className="text-xs text-muted-foreground">
                Seuls ces horaires sont proposés et placés sur ce poste.
              </span>
            </>
          )}
        </TousOuCertains>
      </div>

      {!neuf && (
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(5rem,1fr))] gap-2 rounded-lg bg-muted/50 p-2 text-center">
          {[
            // Les niveaux de l'établissement (2026-11-06), dans leur ordre.
            ...lireNiveaux(referentiel.niveaux).liste.map(
              (n) => [compte(n.id), n.nom.toLowerCase()] as const,
            ),
            [heures(besoinsSemaine), 'besoins / sem.'] as const,
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
        description="Tous ses shifts sont effacés, y compris ceux des semaines passées non verrouillées, ainsi que ses besoins. Il est retiré des fiches et des groupes. Une semaine verrouillée empêche la suppression."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => void supprimer()}
      />
    </CarteReglage>
  )
}
