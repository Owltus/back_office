/*
 * Paramètres du Planning : Comment ça marche (demande utilisateur du
 * 2026-11-02 : une page qui explique explicitement comment l'application
 * fonctionne, pour tous les statuts, les horaires et tout le reste).
 *
 * Lecture seule, ouverte à qui voit la page planning. Rien n'est lu en base :
 * les chiffres de la loi viennent de `regles.ts` (seule source des chiffres
 * HCR), ceux du calcul de `modele.ts` et `semaine.ts`. Les pastilles sont les
 * VRAIES cartes de la grille (`CarteShift`, `CarteStatut`) : un changement
 * d'aspect dans la grille se voit ici aussi.
 *
 * Les poids du générateur ne sont jamais cités en nombres : seul leur ordre
 * compte pour l'utilisateur, et il est écrit en mots (en tête de
 * `generateur.ts`, ORDRE DE DÉCISION).
 */

import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'

import {
  CarteShift,
  CarteStatut,
} from '#/components/planning/semaine/Cartes.tsx'
import type { ContenuCarte } from '#/components/planning/semaine/Cartes.tsx'
import { NEUTRE } from '#/components/planning/semaine/edition.ts'
import type { ContenuStatut } from '#/components/planning/semaine/edition.ts'
import { SEMAINES_EQUITE } from '#/lib/planning/modele.ts'
import {
  CHANGEMENTS_MOMENT_MAX,
  CONGE_LONG,
  ECOLE_LENDEMAIN_DEBUT,
  ECOLE_VEILLE_FIN,
  EQUIPE_TOLERANCE,
  FORFAIT_JOUR_MAX,
  JOUR_MAX_CATEGORIE,
  JOURNEE_ETOILE_MIN,
  JOURNEE_PLEINE,
  JOURS_AFFILES_CONSEILLES,
  JOURS_AFFILES_MAX,
  JOURS_TRAVAILLES_MAX,
  JOURS_TRAVAILLES_PREFERES,
  MINEUR_JOUR_MAX,
  MINEUR_REPOS_QUOTIDIEN,
  MINEUR_SEMAINE_MAX,
  NUITS_AFFILEES_MAX,
  REPOS_APRES_NUITS,
  REPOS_CONFORT,
  REPOS_DEUX_SEMAINES,
  REPOS_HEBDO_MIN,
  REPOS_QUOTIDIEN,
  SEMAINE_MAX,
  SEMAINES_EN_PLUS_ALERTE,
  STAGE_JOUR_MAX,
  TEMPS_PLEIN,
} from '#/lib/planning/regles.ts'
import { DUREE_OUVERTURE } from '#/lib/planning/semaine.ts'
import { heuresLisibles as h } from '#/lib/planning/temps.ts'
import { CATEGORIES } from '#/lib/planning/types.ts'
import type { Horaire } from '#/lib/planning/types.ts'

/** Les parties de la page, dans l'ordre du sommaire. */
export const SECTIONS_FONCTIONNEMENT = [
  { id: 'ensemble', titre: 'Vue d’ensemble' },
  { id: 'cases', titre: 'Les cases du planning' },
  { id: 'horaires', titre: 'Les horaires' },
  { id: 'postes', titre: 'Les postes et l’accueil' },
  { id: 'contrats', titre: 'Les contrats' },
  { id: 'absences', titre: 'Absences, école et repos' },
  { id: 'feries', titre: 'Les jours fériés' },
  { id: 'generation', titre: 'Comment le planning est calculé' },
  { id: 'loi', titre: 'Les règles de la loi' },
  { id: 'bien-etre', titre: 'Le bien-être de l’équipe' },
  { id: 'alertes', titre: 'Alertes et places à pourvoir' },
  { id: 'droits', titre: 'Qui peut faire quoi' },
] as const

type IdSection = (typeof SECTIONS_FONCTIONNEMENT)[number]['id']

const titreDe = (id: IdSection) =>
  SECTIONS_FONCTIONNEMENT.find((s) => s.id === id)?.titre ?? id

// ------------------------------------------------------------ pastilles

/** Un horaire d'exemple pour les cartes (couleur du matin). */
function horaireExemple(
  debut: string,
  fin: string,
  pause: number,
  couleur: string,
): Horaire {
  return { id: 0, nom: '', debut, fin, pause, couleur, periode: null }
}

const MATIN = horaireExemple('07:00', '15:45', 45, '#0ea5e9')
const ETOILE = horaireExemple('07:00', '14:45', 45, '#0ea5e9')

function carte(maj: Partial<ContenuCarte>): ContenuCarte {
  return {
    debut: MATIN.debut,
    fin: MATIN.fin,
    duree: 8 * 60,
    horaire: MATIN,
    epinglee: false,
    etoile: false,
    role: null,
    alertes: [],
    ...maj,
  }
}

function statut(maj: Partial<ContenuStatut>): ContenuStatut {
  return {
    nom: 'Repos',
    couleur: NEUTRE,
    fixe: false,
    repos: true,
    genre: 'repos',
    ...maj,
  }
}

/** Une pastille à la taille d'une case de la vue semaine. */
function Case({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden className="grid h-12 w-32 shrink-0">
      {children}
    </div>
  )
}

/** La case vide, comme dans la grille : rien de posé. */
function CaseVide() {
  return (
    <div className="grid place-items-center rounded-[7px] border border-dashed text-[11px] text-muted-foreground">
      Non attribué
    </div>
  )
}

const STATUTS: ReadonlyArray<{
  nom: string
  pastille: ReactNode
  texte: ReactNode
}> = [
  {
    nom: 'Shift proposé',
    pastille: <CarteShift c={carte({})} />,
    texte:
      'Pointillés, fond pâle. Le calcul l’a proposé. Il peut changer à la prochaine génération. Validez-le pour le garder.',
  },
  {
    nom: 'Shift validé',
    pastille: <CarteShift c={carte({ epinglee: true })} />,
    texte:
      'Trait plein et coche verte. Les générations le gardent tel quel. Vous pouvez encore le changer à la main.',
  },
  {
    nom: 'Semaine verrouillée',
    pastille: (
      <div className="relative grid">
        <CarteShift c={carte({ epinglee: true })} />
        <Lock
          className="absolute -top-1.5 -left-1.5 size-3.5 rounded-full bg-card p-0.5 text-muted-foreground"
          aria-hidden
        />
      </div>
    ),
    texte:
      'Cadenas dans l’en-tête de la semaine. C’est le planning réalisé : plus rien ne bouge, ni à la main ni par le calcul. Seule la gestion verrouille et rouvre une semaine.',
  },
  {
    nom: 'Journée étoile',
    pastille: (
      <CarteShift
        c={carte({
          debut: ETOILE.debut,
          fin: ETOILE.fin,
          duree: 7 * 60,
          horaire: ETOILE,
          etoile: true,
        })}
      />
    ),
    texte: `Étoile au coin. Pour un contrat de plus de 35 h, un jour par semaine se fait sur un horaire plus court (de ${h(JOURNEE_ETOILE_MIN)} à moins de ${h(JOURNEE_PLEINE)}).`,
  },
  {
    nom: 'Shift en dépannage',
    pastille: <CarteShift c={carte({ role: 'occasionnel' })} />,
    texte:
      'Bouée. La personne tient ce poste en dépannage : elle sait le faire, mais ce n’est pas son poste habituel.',
  },
  {
    nom: 'Shift avec alerte',
    pastille: (
      <CarteShift
        c={carte({
          alertes: [
            {
              regle: 'R-REPOS-QUOTIDIEN',
              message: 'repos trop court',
              nature: 'loi',
            },
          ],
        })}
      />
    ),
    texte:
      'Triangle. Rouge : une règle de la loi n’est pas tenue. Orange : un point d’organisation à regarder. Survolez la carte pour lire la raison.',
  },
  {
    nom: 'Repos de la semaine type',
    pastille: <CarteStatut s={statut({ fixe: true })} />,
    texte:
      'Repos fixé dans la fiche de la personne. Toujours validé. Il se change dans sa fiche, pas dans la grille.',
  },
  {
    nom: 'Repos proposé',
    pastille: <CarteStatut s={statut({ proposition: true })} />,
    texte:
      'Pointillés. Posé par la génération sur les jours libres qui restent. Validez-le comme un shift, ou retirez-le avec Vider la case.',
  },
  {
    nom: 'Repos posé',
    pastille: (
      <CarteStatut
        s={statut({ repos: false, reposPose: true, genre: 'absence' })}
      />
    ),
    texte:
      'Repos posé à la main sur une date (motif R). Trait plein : validé. Il ne retire aucune heure due.',
  },
  {
    nom: 'Repos sur un jour de congé',
    pastille: <CarteStatut s={statut({ proposition: true })} />,
    texte:
      'Quelqu’un en congé toute la semaine garde ses deux repos. L’app propose Repos sur deux jours de congé en trop. Valider change ces jours de congé en repos.',
  },
  {
    nom: 'Absence',
    pastille: (
      <CarteStatut
        s={statut({
          nom: 'Congé payé',
          couleur: '#0ea5e9',
          repos: false,
          genre: 'absence',
        })}
      />
    ),
    texte:
      'Teintée à la couleur du motif, avec son icône (palmier pour un congé, thermomètre pour une maladie…). Voir Absences, école et repos.',
  },
  {
    nom: 'Jour férié rattrapé (JFR)',
    pastille: (
      <CarteStatut
        s={statut({
          nom: 'Jour férié rattrapé',
          couleur: '#c084fc',
          repos: false,
          proposition: true,
          jfr: true,
          genre: 'absence',
        })}
      />
    ),
    texte:
      'Le jour rendu après un jour férié travaillé. Proposé par l’app, puis validé comme un repos. Voir Les jours fériés.',
  },
  {
    nom: 'École',
    pastille: (
      <CarteStatut
        s={statut({
          nom: 'École - CFA',
          couleur: '#a855f7',
          repos: false,
          genre: 'ecole',
        })}
      />
    ),
    texte:
      'Jour d’école d’un apprenti ou d’un stagiaire, pris dans le calendrier de sa fiche. Compté comme une journée de travail complète.',
  },
  {
    nom: 'Hors contrat',
    pastille: (
      <CarteStatut
        s={statut({ nom: 'Hors contrat', fixe: true, genre: 'hors' })}
      />
    ),
    texte:
      'Avant la date d’entrée ou après la date de sortie de la fiche. Rien ne peut s’y poser.',
  },
  {
    nom: 'Non attribué',
    pastille: <CaseVide />,
    texte:
      'Rien de posé. Ce n’est pas un repos : la case reste vide tant que la semaine n’est pas remplie. Retirer un shift remet la case à vide.',
  },
]

// ------------------------------------------------------------ mise en page

function Section({
  id,
  intro,
  children,
}: {
  id: IdSection
  intro?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      id={`fonctionnement-${id}`}
      aria-labelledby={`fonctionnement-${id}-titre`}
      className="scroll-mt-4 rounded-xl border bg-card p-4 md:p-5"
    >
      <h2 id={`fonctionnement-${id}-titre`} className="text-lg font-semibold">
        {titreDe(id)}
      </h2>
      {intro && (
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{intro}</p>
      )}
      <div className="mt-4 flex flex-col gap-4 text-sm">{children}</div>
    </section>
  )
}

function Sous({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="font-semibold">{titre}</h3>
      {children}
    </div>
  )
}

function Liste({ items }: { items: ReadonlyArray<ReactNode> }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground marker:text-muted-foreground/60">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  )
}

function Exemple({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border-l-2 border-primary/50 bg-muted/40 px-3 py-2 text-muted-foreground">
      <span className="font-medium text-foreground">Exemple : </span>
      {children}
    </p>
  )
}

/** Tableau à deux colonnes : un terme, son explication. */
function Tableau({
  entetes,
  lignes,
}: {
  entetes: readonly [string, string]
  lignes: ReadonlyArray<readonly [ReactNode, ReactNode]>
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">{entetes[0]}</th>
            <th className="px-3 py-2 font-medium">{entetes[1]}</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map(([a, b], i) => (
            <tr key={i} className="border-t align-top">
              <td className="px-3 py-2 font-medium whitespace-nowrap">{a}</td>
              <td className="px-3 py-2 text-muted-foreground">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Sommaire() {
  const aller = (id: IdSection) =>
    document
      .getElementById(`fonctionnement-${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <nav aria-label="Sommaire" className="rounded-xl border bg-card p-4 md:p-5">
      <p className="text-sm font-semibold">Sommaire</p>
      <ol className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS_FONCTIONNEMENT.map((s, i) => (
          <li key={s.id} className="flex gap-2">
            <span className="w-5 text-right text-muted-foreground tabular-nums">
              {i + 1}.
            </span>
            <a
              href={`#fonctionnement-${s.id}`}
              className="text-primary underline-offset-4 hover:underline"
              onClick={(e) => {
                e.preventDefault()
                aller(s.id)
              }}
            >
              {s.titre}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

// ------------------------------------------------------------ le contenu

/** Corps de l'aide du planning (bouton « ? » des vues mois et semaine,
 * `AideGestes`), comme l'aide des autres pages : les gestes de la vue
 * ouverte, puis tout le fonctionnement de l'application. Lecture seule. */
export function AidePlanningContenu({
  gestes = [],
}: {
  /** Les gestes de la vue ouverte (mois ou semaine), en tête. */
  gestes?: readonly string[]
}) {
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Cette aide explique ce que fait l’application, règle par règle. Elle ne
        change rien : les réglages se font dans les quatre écrans numérotés du
        menu des paramètres (l’engrenage).
      </p>
      {gestes.length > 0 && (
        <section
          aria-label="Les gestes"
          className="rounded-xl border bg-card p-4 md:p-5"
        >
          <h2 className="text-lg font-semibold">Les gestes</h2>
          <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
            {gestes.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </section>
      )}
      <Sommaire />

      <Section
        id="ensemble"
        intro="Vous décrivez l’hôtel une fois. L’app propose ensuite chaque semaine un planning qui tient la loi, les contrats et l’accueil. Vous gardez la main sur tout."
      >
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Horaires</span> : les
            heures de travail possibles et les motifs d’absence.
          </li>
          <li>
            <span className="font-medium text-foreground">Postes</span> :
            Réception, Club, Veille de nuit, Direction… et les horaires permis
            sur chacun.
          </li>
          <li>
            <span className="font-medium text-foreground">Équipe</span> : une
            fiche par personne (contrat, postes tenus, semaine type, école).
          </li>
          <li>
            <span className="font-medium text-foreground">Besoins</span> :
            combien de personnes il faut à l’accueil le matin, le soir et la
            nuit, et sur les postes à part.
          </li>
          <li>
            <span className="font-medium text-foreground">Compléter</span> :
            l’app propose les shifts et les repos qui manquent, autour de ce qui
            est déjà validé.
          </li>
          <li>
            <span className="font-medium text-foreground">Valider</span> : vous
            relisez, vous changez ce qui ne va pas, vous validez. Le validé ne
            bouge plus aux générations suivantes.
          </li>
          <li>
            <span className="font-medium text-foreground">Verrouiller</span> :
            une fois la semaine faite, la gestion la verrouille. C’est le
            planning réalisé.
          </li>
        </ol>
        <p className="text-muted-foreground">
          La pastille À vérifier, à côté de l’engrenage, relit les réglages et
          dit ce qui ne colle pas. Le menu coche chaque écran sans point
          bloquant. Quand les quatre sont cochés, le planning est prêt à
          générer.
        </p>
        <p>
          Chaque semaine est calculée en regardant aussi la suivante : qui
          pourra travailler quels jours, qui aura besoin de son week-end, et
          combien de personnes il faudra. Ainsi une semaine ne laisse pas la
          suivante dans une impasse (trop de jours d’affilée, un week-end à
          rendre sans personne pour le tenir). Seule la semaine calculée est
          écrite.
        </p>
        <Exemple>
          vous posez et validez les shifts des personnes à horaires fixes et les
          congés connus, puis Compléter le mois fait le reste. Vous corrigez
          deux cases à la main et vous validez le tout.
        </Exemple>
      </Section>

      <Section
        id="cases"
        intro="Chaque case est une personne un jour. Elle montre un shift, un repos, une absence, l’école, ou rien. Les pastilles ci-dessous sont celles de la grille."
      >
        <ul className="flex flex-col divide-y">
          {STATUTS.map((s) => (
            <li
              key={s.nom}
              className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4"
            >
              <Case>{s.pastille}</Case>
              <div className="min-w-0">
                <p className="font-medium">{s.nom}</p>
                <p className="text-muted-foreground">{s.texte}</p>
              </div>
            </li>
          ))}
        </ul>
        <Sous titre="Les gestes">
          <Liste
            items={[
              'Clic droit sur une case : choisir un horaire, poser un repos ou une absence, valider.',
              'Clic sur un shift : tout modifier (horaire, poste, heures).',
              'Double-clic sur un shift ou un repos : le valider, ou le remettre en proposition.',
              'Glisser un shift : le déplacer. Avec Alt maintenu : le dupliquer.',
            ]}
          />
        </Sous>
        <Sous titre="Les formes sous chaque jour">
          <p className="text-muted-foreground">
            Elles comptent l’accueil : un rond pour le matin, un rond pour le
            soir, un triangle pour la nuit, posé entre deux jours. Vert : au
            complet. Rouge : il manque quelqu’un. Bleu : quelqu’un en plus.
            Orange vide : personne de demandé. Le trait qui les relie dit si la
            relève se fait : vert plein, assurée ; pointillé rouge, personne
            pour la faire.
          </p>
        </Sous>
      </Section>

      <Section
        id="horaires"
        intro="Un horaire, c’est un début, une fin et une pause. Il n’a plus de code : il se lit par ses heures, par exemple 07:00–15:45."
      >
        <Liste
          items={[
            'La pause compte dans la présence, pas dans les heures. 07:00–15:45 avec 45 min de pause fait 8 h de travail.',
            'Une fin plus tôt que le début finit le lendemain : 23:00–07:00 est une nuit.',
            'Un horaire qui commence à minuit s’écrit 24:00 sur le jour où il est posé : la nuit du lundi de 00:00 à 07:00 est posée le lundi soir.',
            'Modifier les heures d’un horaire met à jour les shifts à venir posés avec lui, jamais ceux des semaines verrouillées.',
          ]}
        />
        <Sous titre="Le moment de l’horaire">
          <p className="text-muted-foreground">
            Chaque horaire a un moment, calculé d’après ses heures. Il ne se
            règle pas : le calcul ne regarde que les heures, jamais le nom.
          </p>
          <Tableau
            entetes={['Moment', 'Quand']}
            lignes={[
              ['Nuit', 'il commence à 21 h ou plus tard, ou avant 5 h'],
              [
                'Soir',
                'il finit à 21 h ou plus tard, ou après minuit, ou il commence à 15 h ou plus tard',
              ],
              [
                'Matin',
                'il commence avant 9 h et finit à 17 h 45 au plus tard',
              ],
              [
                'Middle',
                'le reste : à cheval sur le matin et le soir. Un middle est un coup de main : il ne compte ni au matin ni au soir de l’accueil, et il est posé s’il reste des heures.',
              ],
            ]}
          />
        </Sous>
        <Sous titre="Horaires courts">
          <p className="text-muted-foreground">
            Un horaire de moins de 7 h de travail est court. Il se range au
            matin, au middle ou au soir d’après son début. Quand l’app change
            d’horaire pour tenir une place, un court ne remplace qu’un court.
          </p>
        </Sous>
        <Sous titre="Versions étoile">
          <p className="text-muted-foreground">
            Un horaire de {h(JOURNEE_PLEINE)} exactement a des versions étoile :
            les horaires de {h(JOURNEE_ETOILE_MIN)} à moins de{' '}
            {h(JOURNEE_PLEINE)} qui tiennent dans ses heures. Le moment peut
            changer. Aucun horaire n’est raccourci : on prend un autre horaire
            qui existe.
          </p>
          <Exemple>
            07:00–15:45 a pour versions étoile 07:00–14:45, 07:30–15:15 et
            08:00–15:45. 23:00–07:00 a 00:00–07:00.
          </Exemple>
        </Sous>
        <Sous titre="Motifs d’absence">
          <p className="text-muted-foreground">
            Les motifs (congé, maladie, école…) se règlent sur le même écran.
            Chacun a un code court, une couleur, et dit s’il compte dans les
            heures. Voir Absences, école et repos.
          </p>
        </Sous>
      </Section>

      <Section
        id="postes"
        intro="Un poste dit où l’on travaille. Sa catégorie HCR fixe la durée maximale d’un service."
      >
        <Tableau
          entetes={['Catégorie HCR', 'Service le plus long']}
          lignes={CATEGORIES.map((c) => [
            c.libelle,
            h(JOUR_MAX_CATEGORIE[c.code]),
          ])}
        />
        <Sous titre="L’accueil">
          <p className="text-muted-foreground">
            Chaque poste a un choix Accueil : non, matin et soir, ou nuit. Les
            postes de l’accueil (Réception et Club le jour, Veille de nuit la
            nuit) n’ont pas de grille de besoins : un seul tableau de la page
            Besoins dit combien de personnes il faut exactement le matin, le
            soir et la nuit. L’app répartit entre les postes et choisit les
            horaires.
          </p>
          <Liste
            items={[
              'D’un veilleur à l’autre : quand la nuit est demandée, l’accueil est tenu sans trou du départ du veilleur au matin jusqu’à l’arrivée du suivant le soir.',
              `Ouverture : un poste de l’accueil peut avoir une heure d’ouverture (07:00 pour la Réception et le Club). Quelqu’un y est dès cette heure, pendant au moins ${h(DUREE_OUVERTURE)}.`,
              'Relève : l’équipe du matin et celle du soir sont ensemble un moment chaque jour, le temps réglé sur la page Besoins (30 minutes par défaut).',
              `Une équipe ensemble : le soir, les personnes arrivent à ${EQUIPE_TOLERANCE} minutes près et partent à ${EQUIPE_TOLERANCE} minutes près, pour que personne ne reste seul. Chacune croise le matin le temps de la relève. Le matin, l’équipe arrive à l’heure d’ouverture du poste, comme dans les plannings faits à la main. Une alerte dit quand ce n’est pas possible.`,
              'Un apprenti ou un stagiaire compte dans le chiffre de l’accueil, mais n’est jamais seul sur son poste.',
            ]}
          />
          <Exemple>
            matin 3, soir 2, nuit 1 : l’app pose trois personnes du matin entre
            Réception et Club, deux du soir et un veilleur, et vérifie qu’aucun
            quart d’heure ne reste sans personne.
          </Exemple>
        </Sous>
        <Sous titre="Les postes à part">
          <p className="text-muted-foreground">
            Direction, Adjoint, Supervision, Technique… gardent leur propre
            grille de besoins : un chiffre par horaire et par jour. La Direction
            ne se remplace pas : quand la personne au forfait jours qui la tient
            est absente, la place n’existe pas ce jour-là, rien n’est à
            pourvoir.
          </p>
        </Sous>
        <Sous titre="Titulaire, dépannage, soutien">
          <Liste
            items={[
              'Titulaire : son poste habituel. L’app le place en premier.',
              'Dépannage : il sait tenir le poste, mais ce n’est pas le sien. L’app ne le prend que si aucun titulaire ne peut.',
              'Soutien : apprenti ou stagiaire. Il compte, mais jamais seul.',
            ]}
          />
        </Sous>
        <Sous titre="Poste fermé">
          <p className="text-muted-foreground">
            Un poste fermé n’est plus proposé dans les fiches, les menus ni les
            besoins. Ses anciens shifts restent dans l’historique.
          </p>
        </Sous>
      </Section>

      <Section
        id="contrats"
        intro="La fiche de chaque personne dit son contrat. L’app en tire les heures à faire chaque semaine et les plafonds."
      >
        <Tableau
          entetes={['Contrat', 'Ce que fait l’app']}
          lignes={[
            [
              '39 h',
              `5 jours : 4 journées de ${h(JOURNEE_PLEINE)} et une journée étoile de ${h(7 * 60)}. Le calcul ne pose que ces journées, jamais d’heures en plus. Une étoile fixée dans la fiche tombe ce jour-là. La semaine d’un congé, de l’école ou d’un jour férié rattrapé, la journée étoile saute : toutes les journées sont de ${h(JOURNEE_PLEINE)}.`,
            ],
            [
              '35 h',
              `5 jours de ${h(TEMPS_PLEIN / 5)}. Le calcul ne pose que des journées de ${h(TEMPS_PLEIN / 5)}, jamais d’heures en plus. Apprentis et stagiaires compris.`,
            ],
            [
              'Temps partiel',
              `Heures complémentaires jusqu’au tiers du contrat, toujours sous ${h(TEMPS_PLEIN)}.`,
            ],
            [
              'Forfait jours',
              `Les heures ne se comptent pas. Seuls le repos de ${h(REPOS_QUOTIDIEN)} et le repos de la semaine s’appliquent (${h(FORFAIT_JOUR_MAX)} d’amplitude au plus).`,
            ],
            [
              'Extra',
              'Pas d’heures dues. Il ne reçoit jamais de repos déduit. Le calcul ne le place jamais : il s’appelle d’abord, puis se pose à la main.',
            ],
            [
              'Apprenti',
              'Ses jours d’école viennent du calendrier de sa fiche. Il est en soutien : jamais seul.',
            ],
            [
              'Stagiaire',
              `Au plus ${h(STAGE_JOUR_MAX)} par jour, mêmes repos que les salariés. En soutien comme l’apprenti.`,
            ],
            [
              'Mineur',
              `Au plus ${h(MINEUR_JOUR_MAX)} par jour et ${h(MINEUR_SEMAINE_MAX)} par semaine, ${h(MINEUR_REPOS_QUOTIDIEN)} de repos entre deux services, aucun travail entre 22 h et 6 h, deux jours de repos qui se suivent.`,
            ],
          ]}
        />
        <Sous titre="Les heures dues">
          <p className="text-muted-foreground">
            Chaque semaine, l’app vise les heures du contrat. Un jour d’absence
            qui compte dans les heures, ou un jour d’école, vaut une journée de
            contrat : {h(JOURNEE_PLEINE)} pour un contrat de plus de 35 h, le
            contrat divisé par 5 sinon. Une journée de contrat de moins est due
            : un 39 h avec un congé doit 4 × 8 h = 32 h, un 35 h doit 4 × 7 h =
            28 h.
          </p>
          <Exemple>
            un 39 h avec deux jours de congé doit 3 × 8 h : sa journée étoile
            saute. Un 35 h avec deux jours d’école doit 3 × 7 h.
          </Exemple>
          <p className="text-muted-foreground">
            Les autres horaires (3 h, 4 h, 5 h, 9 h, 10 h) ne sont posés qu’à la
            main pour un 35 h ou un 39 h. Un shift posé à la main ou validé
            n’est jamais refusé, et le reste de la semaine garde ses journées.
            Une semaine type qui fixe un tel horaire décide seule. Si une place
            reste vide à cause de ces règles, la page le dit.
          </p>
        </Sous>
        <Sous titre="Arrivée ou départ en cours de semaine">
          <p className="text-muted-foreground">
            Seuls les jours de présence comptent. Les jours avant l’entrée ou
            après la sortie sont hors contrat, et seules les journées de contrat
            qui manquent sont retirées. Le premier jour du contrat est travaillé
            : un stage ne commence pas par ses repos.
          </p>
          <Exemple>
            un 39 h qui part un jeudi est là 4 jours : il doit une journée de
            moins, soit 32 h. Le week-end après son départ ne retire rien.
          </Exemple>
        </Sous>
        <Sous titre="Fiche">
          <Liste
            items={[
              'Une date de fin est obligatoire pour un CDD, un apprenti ou un stagiaire.',
              'Un extra n’a pas de date de fin : il est actif ou non.',
              'Promotion, changement de poste ou de contrat : bouton Changer de poste ou de contrat dans la fiche, avec la date. Jusqu’à la veille, rien ne change ; à partir de la date, ses nouveaux postes et son nouveau contrat s’appliquent, et le planning en tient compte jour par jour. Pensez aussi à la page Besoins si un poste n’est plus tenu.',
              'Une personne qui a eu plusieurs contrats (CDD puis CDI, départ puis retour, promotion) n’a qu’une ligne dans la page Équipe, sur son contrat du moment. Sa fiche liste tous ses contrats, du plus ancien au plus récent.',
              'On ne supprime pas quelqu’un qui a travaillé : son départ, c’est une date de fin de contrat, et son historique reste. Seul un contrat ou une fiche créé par erreur, qui n’a jamais servi (aucun shift, aucune absence), se supprime.',
              'Un extra qu’on n’appelle plus se désactive. Un extra embauché : Ajouter un contrat, et son contrat d’extra s’arrête tout seul la veille.',
              'La semaine type dit, jour par jour : libre, travaille (avec un horaire fixé ou non), ou repos.',
              'Les horaires fixés de la semaine type se posent tout seuls à l’ouverture d’une semaine à venir.',
            ]}
          />
        </Sous>
      </Section>

      <Section
        id="absences"
        intro="Une absence se pose jour par jour, comme un horaire, depuis le clic droit d’une case ou la fiche."
      >
        <Tableau
          entetes={['Motif', 'Effet']}
          lignes={[
            [
              'Congé payé (CP)',
              'Compte une journée de contrat. Deux repos par semaine restent dus, même en congé.',
            ],
            ['Maladie (MA)', 'Compte une journée de contrat.'],
            ['Formation (FO)', 'Compte une journée de contrat.'],
            ['Sans solde (SS)', 'Compte une journée de contrat.'],
            [
              'Repos exceptionnel (RP)',
              'Un jour non travaillé qui ne retire aucune heure due.',
            ],
            [
              'Jour férié (JF)',
              'Un motif d’absence comme les autres, à poser à la main. Il compte une journée de contrat. L’app ne vérifie aucun droit dessus.',
            ],
            [
              'Jour férié rattrapé (JFR)',
              'Le jour rendu après un jour férié travaillé. Compte une journée de contrat, comme un congé. Voir Les jours fériés.',
            ],
            [
              'École (EC)',
              'Jour hors de l’hôtel d’un apprenti ou d’un stagiaire. Une journée de travail complète, jamais une absence.',
            ],
            [
              'Repos (R)',
              'Un repos posé à une date. Ne retire aucune heure due. Montré comme le repos de la semaine type, mais il se retire.',
            ],
          ]}
        />
        <p className="text-muted-foreground">
          Les codes ci-dessus sont ceux de l’hôtel. Ils se règlent dans Horaires
          et absences, avec la case qui dit si le motif compte dans les heures.
        </p>
        <Sous titre="Les repos de la semaine">
          <Liste
            items={[
              'Deux repos par semaine pour chacun. Un jour hors contrat en retire un, deux jours hors contrat les retirent tous les deux.',
              'Une case vide reste vide : l’app ne devine aucun repos. La génération pose les repos en proposition ; à la main, on les pose d’un clic droit. Un repos posé, proposé ou validé, se retire avec Vider la case.',
              'Repos obligé : un jour où la personne ne peut pas travailler (plus de 6 jours d’affilée, plus de jours que permis dans la semaine, ou moins de 11 h de repos entre deux services). Il s’affiche Repos, en proposition, et la raison apparaît au survol.',
              'En congé toute la semaine, deux jours de congé deviennent des repos proposés : les jours de congé ne sont pas des jours de repos.',
              'Apprentis et stagiaires : leur ligne reste vide, sauf l’école, tant que la semaine n’est pas remplie.',
              'Un repos proposé part avec les propositions quand on recalcule ou qu’on efface.',
            ]}
          />
        </Sous>
      </Section>

      <Section
        id="feries"
        intro="Les 11 jours fériés de l’année : 1er janvier, lundi de Pâques, 1er mai, 8 mai, Ascension, lundi de Pentecôte, 14 juillet, 15 août, 1er novembre, 11 novembre et 25 décembre."
      >
        <Liste
          items={[
            'La première année de contrat, aucun jour férié n’est dû : le jour férié est un jour comme un autre.',
            'Après un an d’ancienneté (date d’entrée de la fiche), un jour férié travaillé donne un jour rattrapé, le JFR.',
            'Date d’entrée vide dans la fiche : l’app compte moins d’un an. Pas de droit tant que la date n’est pas remplie.',
            'Les extras n’ont pas de jour rattrapé.',
            'Un stagiaire a tous ses jours fériés, dès le premier jour : il n’est jamais placé ce jour-là, la case montre Jour férié, et une journée de contrat de moins est due dans sa semaine. Il n’a donc jamais de JFR.',
            'L’encadrement (postes où la case Jours fériés chômés le jour même est cochée, page Postes) prend ses jours fériés le jour même, sans JFR. Un jour férié qui tombe un jour de travail de sa semaine type est chômé : la case montre Jour férié, une journée de contrat de moins est due. Un jour de repos habituel : rien. Sans jour Travaille dans la semaine type : tous les jours fériés. Il faut aussi un an d’ancienneté.',
            'Un mineur n’est pas placé un jour férié si on peut l’éviter. La loi le permet en hôtellerie, mais le calcul l’évite, et une alerte le signale s’il y travaille.',
            'Le JFR est proposé dès la semaine qui suit le jour férié, au plus un par semaine. Tant qu’il n’est pas rendu, il reste dû : une alerte le rappelle et l’app le propose à nouveau chaque semaine.',
            'La direction au forfait jours reçoit aussi son JFR : ce jour-là, sa place disparaît, comme quand elle est absente.',
            'Il se valide comme un repos : pointillés tant qu’il est proposé, trait plein une fois validé. Comme un congé, une journée de contrat de moins est due dans sa semaine : 39 h passent à 32 h, 35 h à 28 h.',
          ]}
        />
        <Exemple>
          une réceptionniste entrée il y a trois ans travaille le 11 novembre.
          L’app lui propose un JFR dans les semaines suivantes, un jour où elle
          n’est pas indispensable. Vous le validez, ou vous le déplacez.
        </Exemple>
        <p className="text-muted-foreground">
          Pensez à remplir la date d’entrée de chacun dans sa fiche Équipe :
          sans elle, personne n’a droit au JFR.
        </p>
      </Section>

      <Section
        id="generation"
        intro="Compléter calcule toutes les propositions d’une semaine en une fois, en pesant chaque choix. Quand deux choses s’opposent, il tranche toujours dans le même ordre."
      >
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">La loi</span> : jamais
            dépassée par le calcul (repos, jours, heures, mineurs).
          </li>
          <li>
            <span className="font-medium text-foreground">
              Deux repos de suite
            </span>{' '}
            pour chacun, chaque semaine, au plus 5 jours de travail d’affilée,
            et jamais un jour seul entre deux repos. Une place reste vide plutôt
            que de les casser, et la page le dit : à vous de compenser. Seuls
            des shifts déjà posés ou validés peuvent l’empêcher.
          </li>
          <li>
            <span className="font-medium text-foreground">
              Les places nécessaires
            </span>{' '}
            et le chiffre de l’accueil du matin, du soir et de la nuit. Une
            place ne reste vide que si personne ne peut la tenir sans enfreindre
            la loi ni perdre ses deux repos de suite.
          </li>
          <li>
            <span className="font-medium text-foreground">
              L’accueil sans trou
            </span>{' '}
            : personne ne manque entre deux équipes, l’ouverture est tenue. La
            passation avec le veilleur aussi : le soir reste jusqu’à son
            arrivée, à la minute près (fin à 23:00 pour une nuit à 23:00), et le
            matin arrive avant son départ.
          </li>
          <li>
            <span className="font-medium text-foreground">Les contrats</span> :
            d’abord les heures dues, sur une semaine complète de 5 jours. Des
            heures payées doivent être faites. Puis éviter une personne en plus.
          </li>
          <li>
            <span className="font-medium text-foreground">La fatigue</span> : 12
            h entre deux services, 2 jours après des nuits avant de reprendre de
            jour, un week-end libre sur 4 semaines. Elle passe après les heures
            dues : quand seules des heures en moins la sauveraient, les heures
            passent devant et une alerte orange le dit. Elle passe avant un 6e
            jour et les heures au-delà du contrat. Plus de 6 jours d’affilée,
            jamais.
          </li>
          <li>
            <span className="font-medium text-foreground">La relève</span> : une
            personne du matin et une du soir ensemble chaque jour. Elle passe
            avant un 6e jour, après les heures dues.
          </li>
          <li>
            <span className="font-medium text-foreground">
              Le bien-être de l’équipe
            </span>{' '}
            : les autres règles de la partie Le bien-être de l’équipe. Elles
            passent après les heures dues (ne pas donner ses heures à quelqu’un
            est aussi injuste), avant le confort. Quand l’hôtel ne peut pas
            faire autrement, l’une d’elles peut céder, et une alerte orange le
            dit.
          </li>
          <li>
            <span className="font-medium text-foreground">
              Le titulaire avant le dépannage
            </span>{' '}
            : un titulaire à l’horaire demandé, puis un titulaire sur un autre
            horaire du même moment, puis un dépannage. Jamais un extra : il
            s’appelle d’abord, puis se pose à la main. Un collègue en dépannage
            vaut mieux qu’une règle du bien-être enfreinte.
          </li>
          <li>
            <span className="font-medium text-foreground">Le confort</span> :
            jours habituels, mêmes jours de repos que la semaine d’avant,
            partage équitable.
          </li>
        </ol>
        <Sous titre="Ce qui n’est jamais touché">
          <Liste
            items={[
              'Le validé : le calcul compose autour.',
              'Les semaines verrouillées et les jours passés.',
              'Les absences posées et l’école.',
            ]}
          />
          <p className="text-muted-foreground">
            Tout recalculer, dans le menu de la semaine, repart de zéro, y
            compris ce qui est validé.
          </p>
        </Sous>
        <Sous titre="Changer d’horaire pour tenir une place">
          <p className="text-muted-foreground">
            Si l’horaire demandé ne se peut pas, l’app essaie un autre horaire
            du même poste et du même moment (un matin pour un matin, un middle
            pour un middle). Le survol de la carte le dit : 09:00–17:45 au lieu
            de 07:00–15:45. Il ne le fait jamais pour donner plus d’heures à
            quelqu’un.
          </p>
        </Sous>
        <Sous titre="Calcul en deux temps">
          <p className="text-muted-foreground">
            Un premier calcul n’utilise que les horaires demandés et leurs
            versions étoile. S’il reste une place vide, un manque à l’accueil,
            un trou ou un dépannage évitable, un second calcul essaie aussi les
            autres horaires. Chaque semaine a au plus 60 secondes de calcul. Un
            nouveau clic sur Compléter le mois arrête le calcul.
          </p>
        </Sous>
        <Sous titre="Un calcul différent à chaque clic">
          <p className="text-muted-foreground">
            À choix égal, un petit tirage départage : deux clics sur Compléter
            peuvent donner deux plannings aussi bons l’un que l’autre.
          </p>
        </Sous>
      </Section>

      <Section
        id="loi"
        intro="Convention HCR et Code du travail. Le calcul ne les dépasse jamais. À la main, certaines restent possibles avec une alerte rouge."
      >
        <Tableau
          entetes={['Règle', 'Ce qui est appliqué']}
          lignes={[
            [
              'Repos entre deux services',
              `Au moins ${h(REPOS_QUOTIDIEN)} (${h(MINEUR_REPOS_QUOTIDIEN)} pour un mineur).`,
            ],
            [
              'Jours par semaine',
              `${JOURS_TRAVAILLES_PREFERES} de préférence, ${JOURS_TRAVAILLES_MAX} au plus, et au moins ${REPOS_DEUX_SEMAINES} jours de repos sur deux semaines.`,
            ],
            [
              'Heures par semaine',
              `Au plus ${h(SEMAINE_MAX)}, école comprise.`,
            ],
            [
              'Repos de la semaine',
              `${h(REPOS_HEBDO_MIN)} d’affilée : un jour libre suffit, sans finir tard la veille ni commencer tôt le lendemain.`,
            ],
            [
              'Longueur d’un service',
              'Selon la catégorie du poste, voir Les postes et l’accueil.',
            ],
            [
              'Mineurs',
              `${h(MINEUR_JOUR_MAX)} par jour, ${h(MINEUR_SEMAINE_MAX)} par semaine, rien entre 22 h et 6 h, deux repos qui se suivent.`,
            ],
            [
              'Nuits',
              'Un mineur ne travaille jamais la nuit. Un veilleur se compte sur ses vraies heures, changement d’heure compris.',
            ],
            [
              'Un shift par jour',
              'Une personne a au plus un shift par jour, jamais deux qui se chevauchent.',
            ],
          ]}
        />
        <p className="text-muted-foreground">
          À la main, une coupure plus courte que {h(REPOS_QUOTIDIEN)} est
          permise avec son alerte. Le calcul ne la choisit jamais.
        </p>
      </Section>

      <Section
        id="bien-etre"
        intro="Ce n’est pas parce que l’on peut que l’on doit. Au-delà de la loi, l’app cherche un planning vivable et juste, le même pour tous. Ces règles cèdent devant les places nécessaires, jamais l’inverse, sauf les deux repos de suite. Toutes cèdent devant les heures dues (des heures payées doivent être faites), sauf les 6 jours d’affilée, que le calcul ne dépasse jamais. À heures égales, celles de la fatigue (12 h de repos, repos après des nuits, week-end libre) passent en premier. Quand l’une cède, une alerte orange le dit à la personne qui fait le planning."
      >
        <Sous titre="Le repos">
          <Liste
            items={[
              'Deux repos par semaine, même en congé.',
              'Deux repos qui se suivent, chaque semaine, avant les places nécessaires. Un dimanche libre suivi du lundi libre compte, à cheval sur deux semaines. Une semaine type qui fixe deux repos décide seule.',
              `${JOURS_AFFILES_CONSEILLES} jours de travail d’affilée au plus pour un contrat de 35 h et plus, semaines voisines comprises (${JOURS_AFFILES_MAX} pour les autres). L’école compte comme du travail.`,
              `Au moins ${h(REPOS_CONFORT)} entre la fin d’un service et le début du suivant (la loi en demande ${h(REPOS_QUOTIDIEN)}).`,
              `Un week-end complet libre, samedi et dimanche, au moins une fois sur ${SEMAINES_EQUITE} semaines. Un congé ou un repos compte comme libre ; une maladie, une formation, un sans solde ou l’école, non. La nuit du dimanche au lundi est écrite le dimanche : elle rend le week-end travaillé.`,
              'Un repos fixe, posé ou validé n’est jamais repris par le calcul.',
            ]}
          />
        </Sous>
        <Sous titre="Le rythme">
          <Liste
            items={[
              `Une semaine stable : au plus ${CHANGEMENTS_MOMENT_MAX} changement de moment (matin, middle, soir, nuit) d’un jour au suivant, et plutôt du matin vers le soir que l’inverse.`,
              `Pas plus de ${NUITS_AFFILEES_MAX} nuits d’affilée, puis ${REPOS_APRES_NUITS} jours sans travail avant de reprendre de jour.`,
              'Les mêmes jours de repos que la semaine d’avant, quand c’est possible. Après un week-end travaillé, passer ses repos au samedi et au dimanche est toujours permis : les week-ends tournent.',
              'Jamais un jour de travail seul entre deux jours sans travail, d’une semaine à l’autre comprise, pour un contrat de 35 h et plus. Une place reste vide plutôt, et la page le dit. Les jours avant une arrivée comptent comme du repos, ceux après un départ comme du travail.',
              'Un contrat de 35 h ou plus se fait en 5 jours, jamais 39 h en 4 jours de 10 h.',
            ]}
          />
        </Sous>
        <Sous titre="La justice">
          <Liste
            items={[
              `Partage des week-ends, des soirs et des matins tôt, sur les ${SEMAINES_EQUITE} dernières semaines, entre tout l’accueil (Réception et Club, apprentis compris), à la part de contrat de chacun. Une semaine d’absence ne met personne en retard.`,
              'Le week-end libre passe avant la semaine type : un samedi ou un dimanche fixé en Travaille dans la fiche est libéré une fois sur 4 semaines, et les repos fixes de cette semaine-là peuvent bouger. Une alerte le dit.',
              'Le calcul ne place jamais un extra : il faut d’abord l’appeler. Une place que l’équipe ne peut pas tenir reste vide, et les ronds et triangles du mois le montrent en rouge.',
              `Les heures au-delà du contrat vont d’abord à qui en a fait le moins sur les ${SEMAINES_EQUITE} dernières semaines. Au-delà du contrat ${SEMAINES_EN_PLUS_ALERTE} semaines sur 4 : une alerte.`,
              'Les jours fériés travaillés sont rattrapés dans les semaines qui suivent, même sur un jour habituel de la semaine type.',
            ]}
          />
        </Sous>
        <Sous titre="La vie personnelle">
          <Liste
            items={[
              `Après un congé d’au moins ${CONGE_LONG} jours, une semaine de retour en douceur : pas de 6e jour, pas de repos court, et plutôt pas de reprise un samedi ou un dimanche.`,
              `École des apprentis et stagiaires : pas de service qui finit après ${h(ECOLE_VEILLE_FIN)} la veille, ni qui commence avant ${h(ECOLE_LENDEMAIN_DEBUT)} le lendemain.`,
              'Les jours habituels de la semaine type sont préférés.',
            ]}
          />
        </Sous>
        <Exemple>
          une réceptionniste n’a pas eu de week-end libre depuis trois semaines.
          Le calcul lui laisse samedi et dimanche, et place un collègue qui en a
          eu un. Si personne d’autre ne peut venir, elle travaille, et l’alerte
          le dit dans son bilan.
        </Exemple>
        <p className="text-muted-foreground">
          Pas encore appliqué : le partage des fêtes d’une année sur l’autre
          (Noël, jour de l’An), faute d’un an d’historique.
        </p>
      </Section>

      <Section
        id="alertes"
        intro="L’app ne cache rien : ce qui ne va pas est dit en phrases courtes, avec où le corriger."
      >
        <Tableau
          entetes={['Où', 'Ce qu’on y lit']}
          lignes={[
            [
              'À vérifier',
              'Pastille à côté de l’engrenage, sur les écrans de paramètres. Les réglages qui ne collent pas, rangés par écran, chacun avec un lien vers le réglage. Les points bloquants empêchent de générer.',
            ],
            [
              'Points d’attention',
              'Bouton de la semaine et du mois. Du plus grave au moins grave : la loi, les places à pourvoir, l’accueil du matin, du soir et de la nuit, les trous, puis le reste par personne.',
            ],
            [
              'Bouclier rouge',
              'Le détail des infractions aux règles HCR de la semaine.',
            ],
            [
              'Triangle sur une carte',
              'Rouge : la loi. Orange : l’organisation (dépannage seul, 6e jour, jours d’affilée…).',
            ],
          ]}
        />
        <Sous titre="Une place à pourvoir">
          <p className="text-muted-foreground">
            L’app dit pourquoi personne ne la tient, par exemple : Je ne peux
            pas remplir le 07:00–15:45, puis la raison commune.
          </p>
          <Liste
            items={[
              'Placer quelqu’un : propose les personnes libres ce jour-là, titulaires d’abord.',
              'Prendre un extra : il se pose à la main.',
              'Changer un shift : libérer quelqu’un un autre jour.',
              'Revoir le réglage : le lien mène au besoin, à la fiche ou au poste en cause.',
            ]}
          />
        </Sous>
      </Section>

      <Section id="droits">
        <Tableau
          entetes={['Droit sur la page planning', 'Ce qu’il permet']}
          lignes={[
            ['Lecture', 'Voir le planning, les réglages et cette page.'],
            [
              'Écriture',
              'Faire le planning : poser, déplacer, valider, compléter, effacer, poser les absences.',
            ],
            [
              'Gestion',
              'En plus : régler les horaires, postes, équipe et besoins, verrouiller et rouvrir les semaines.',
            ],
          ]}
        />
        <p className="text-muted-foreground">
          Une semaine verrouillée et les jours passés sont figés pour tout le
          monde.
        </p>
      </Section>
    </div>
  )
}
