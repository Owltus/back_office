/*
 * Génération d'un planning (prototype `solveur/generateur.py`, OR-Tools
 * CP-SAT) traduite en programme linéaire en nombres entiers, résolu par
 * HiGHS (WebAssembly, `highs`). Même modèle (poids revus depuis, voir
 * l'ORDRE DE DÉCISION plus bas) : une variable
 * booléenne par couple (salarié, créneau), 1 si le salarié le tient. Les
 * règles légales sont des contraintes dures ; la couverture est souple (s'il
 * manque du monde, le meilleur planning légal et la liste des trous).
 *
 * Traduction des primitives CP-SAT (toutes linéaires sur des booléens) :
 *   add_implication(a, b)          a - b <= 0
 *   add_implication(a, ¬b)         a + b <= 1
 *   add_bool_or([¬a, ¬b])          a + b <= 1
 *   add_bool_or([l1 … ln])         l1 + … + ln >= 1
 *   add_bool_or([¬l, ¬a, ¬b])      l + a + b <= 2
 *   add_max_equality(t, [x…])      t - x_i >= 0 pour tout i ; t - Σx <= 0
 * Les constantes d'objectif (POIDS × (1 - v)) sont retirées : elles ne
 * changent pas l'optimum.
 *
 * Les affectations épinglées (`imposees`) sont des faits : gardées même si
 * elles enfreignent une règle (le vérificateur le signale) ; d'où les
 * `max(plafond, fige)` qui évitent un modèle impossible.
 */

import {
  nuitDeLaVeille,
  plageAccueil,
  POSTE_ACCUEIL,
} from '#/lib/planning/cycles.ts'
import {
  codeDeLaFiche,
  codeImposeRespecte,
  coupureRespectee,
} from '#/lib/planning/eligibilite.ts'
import {
  cle,
  cleAEviter,
  dansLeContrat,
  duree,
  jourDe,
  presenceMax,
  role,
  toucheLaNuit,
  travail,
} from '#/lib/planning/modele.ts'
import type {
  AffectationSolveur,
  Creneau,
  Manque,
  Probleme,
  Resultat,
  SalarieSolveur,
} from '#/lib/planning/modele.ts'

/*
 * TABLEAU DE L'ACCUEIL (plan planning-accueil-2026-11-01, décisions
 * utilisateur D1-D15 du 2026-11-01). Les postes de l'accueil (Réception,
 * Club, et la Veille de nuit pour la nuit) n'ont plus de besoins : leurs
 * créneaux sont des CANDIDATS (`Creneau.accueil`, un par jour, poste et
 * horaire permis, effectif 0) et c'est le chiffre de chaque moment
 * (`Probleme.consignes`, `minimum` lu comme le chiffre EXACT, D3) qui dit
 * combien de personnes viennent. Chacun prend au plus un candidat par jour
 * (la règle « un shift par jour » ci-dessous) ; l'app répartit entre les
 * postes (D2) et choisit l'horaire (D4).
 *   - Compte d'un moment : TOUS les shifts tenus ce jour dont les moments
 *     (`Creneau.presence`, une liste) contiennent celui-ci. Un middle compte
 *     au matin ET au soir (D11 du 2026-11-01) ; un soutien (apprenti,
 *     stagiaire) compte (D5) mais n'est jamais seul : sur un candidat, un
 *     soutien <= les autonomes du MÊME poste dont le shift chevauche le sien.
 *   - Σ = N, souple des deux côtés : un MANQUE coûte une place vide (P1,
 *     `coutManqueMinimum`) ; un SURPLUS coûte `coutSurplus` (D8, ci-dessous).
 *   - Ordre de remplissage (D7) : titulaire < dépannage (`coutDepannage`)
 *     < extra (`coutExtra`) < vide. Les extras (`placementManuel`), exclus
 *     de tout autre créneau, sont permis sur les candidats SEULEMENT.
 *   - Trous (D15) : sur l'accueil ENTIER d'un jour (Réception et Club
 *     ensemble), du premier au dernier moment demandé (`plageAccueil`,
 *     `cycles.ts`), même grille et même prix qu'entre deux équipes.
 *   - Pas de remplaçant `r…` pour l'accueil : les candidats couvrent déjà
 *     tous les horaires permis ; la réduction des paires s'applique à eux.
 * Les postes « à part » (Direction, Adjoint, Supervision, Technique)
 * gardent EXACTEMENT leurs besoins, remplaçants et paliers ci-dessous.
 *
 * SURPLUS (D8 : « sois souple et logique… appli RH, faire au mieux »).
 * Une personne en plus du chiffre d'un moment coûte `coutSurplus` :
 *   - PLUS que tout le confort d'un shift (part fixe = `PART_FIXE_DEPANNAGE`,
 *     qui dépasse jour habituel, repos accolés, équité, départage) et que
 *     les heures ordinaires : 100 par minute du plus long candidat du
 *     moment (un shift de 8 h 45 : 57 109, plus qu'un 6e jour 15 000, 8 h 45
 *     en plus 26 250, ou un trou de 9 h). Personne ne vient en plus pour
 *     son jour habituel, pour l'équité, ni pour fermer un trou ordinaire ;
 *   - MOINS qu'un manque d'heures dues : le coût est PLAFONNÉ, pour chaque
 *     candidat du moment, sous ce que rapportent ses heures dues (400 par
 *     minute de travail) une fois payés un dépannage et tout le confort,
 *     et divisé par le nombre de moments où il compte (un middle en plus
 *     l'est deux fois). Une personne à qui il manque les heures d'un shift
 *     vient donc EN PLUS en DERNIER recours : seulement si aucun autre jour
 *     ne peut les lui donner sans surplus (ailleurs, rien ne coûte). C'est
 *     signalé (le compte du moment dépasse le chiffre). Un extra (contrat
 *     indicatif : 1 par minute) ne vient jamais en plus.
 *
 * ORDRE DE DÉCISION (étape 10 du plan « réglages cohérents », D3 = A,
 * D1 = A, D13, D14, D15). La phrase de la page Besoins le dit : la loi
 * d'abord, puis les personnes nécessaires, puis le matin et le soir et les
 * contrats, puis un titulaire avant un dépannage, puis le confort.
 *
 *   P0  la loi : contraintes DURES (repos de 11 h, 6 jours, 48 h, nuit des
 *       mineurs, soutien jamais seul, horaire fixé…). Aucun poids ne la passe.
 *   P1  une place « nécessaire » vide : `coutPlaceVide`, DÉRIVÉ des poids
 *       ci-dessous (pas posé à la main) ; une PLACE est le besoin et ses
 *       remplaçants (`coutPlaceVideGroupe`). Au même niveau, une personne
 *       de moins que le chiffre d'un moment de l'accueil, matin, soir ou
 *       nuit (`coutManqueMinimum`, même dérivation, extra compris, D7).
 *   P2  un trou (entre deux équipes d'un poste à part compté, ou sur
 *       l'accueil entier, D15) : `POIDS_TROU_QUART` par quart d'heure (D10).
 *   P3  les contrats : heures dues (`POIDS_SOUS_CONTRAT`) > une personne en
 *       plus du chiffre d'un moment (`coutSurplus`, D8, plafonné sous les
 *       heures dues) > 6e jour > heures au-delà (`POIDS_SUR_CONTRAT`).
 *   P4  le métier d'abord (D13), à heures de contrat égales (un
 *       remplaçant ne compte jamais plus d'heures dues ni moins d'heures en
 *       plus que son besoin, `minutesDues`, `minutesEnPlus`) :
 *         titulaire à l'horaire imposé              0
 *       < titulaire avec un autre horaire du cycle  POIDS_REMPLACANT (2 000)
 *       < dépannage à l'horaire imposé              `coutDepannage` (10 / min
 *                                               + PART_FIXE_DEPANNAGE 4 609)
 *       < dépannage avec un autre horaire          `coutDepannage` + 2 000
 *       < extra (accueil seulement, D7)         `coutExtra` : au-dessus
 *                                               d'un dépannage qui ferait
 *                                               le shift en heures en plus
 *                                               ET en 6e jour
 *       < place vide                            P1.
 *   P5  le confort : jours habituels, repos accolés, équité.
 *
 * P1 : ajouter UNE personne libre (rien d'autre ne bouge) sur un créneau `c`
 * coûte au pire, tous termes de l'objectif confondus :
 *     (POIDS_SUR_CONTRAT + POIDS_DEPANNAGE_MINUTE) × durée(c)   heures en plus, dépannage
 *   + PART_FIXE_DEPANNAGE                                       dépannage, part fixe
 *   + POIDS_REMPLACANT (si `c` est un remplaçant)               un autre horaire du cycle
 *     (pour un remplaçant, durée(c) des heures en plus = la plus longue
 *     de c et de son besoin, `minutesEnPlus`)
 *   + POIDS_SIXIEME_JOUR                                        un jour de plus = au plus un 6e jour
 *   + POIDS_REPOS_SEPARES                                       la paire de repos accolés perdue
 *   + `coutExtra` (si `c` est un candidat de l'accueil)          un extra
 *   + le plus cher des surplus                                  une personne en plus d'un autre moment
 *                                                               (un middle compte matin et soir)
 *   + EQUITE_MAX_PAR_SHIFT                                      équité, au pire
 *   + POIDS_DEJA_PROPOSE + BRUIT_MAX                            rebattre, hasard
 * (les heures dues ne peuvent que baisser ; travail(c) <= durée(c) ; un
 * contrat indicatif coûte 1 par minute <= POIDS_SUR_CONTRAT). La place vide
 * coûte strictement plus : à l'optimum, une place nécessaire n'est vide que
 * si PERSONNE ne peut y être ajouté sans enfreindre une règle dure — ce que
 * dit `raisonsBlocage`. L'inégalité tient quels que soient les poids, parce
 * que `coutPlaceVide` les relit. Une place qui a des remplaçants coûte le
 * PIRE de ses créneaux : elle n'est vide que si personne ne peut tenir aucun
 * de ses horaires. Le minimum d'une consigne se dérive de même sur les créneaux
 * qui y comptent. Ni les trous (ajouter une personne n'en crée pas) ni le
 * minimum (il ne peut que baisser) n'ont à entrer dans le pire coût ; le
 * « max des consignes » ne relit que les MAXIMUMS, sinon le minimum
 * dépendrait de lui-même.
 *
 * P2 sous P1 : `coutPlaceVide` contient le plus cher des maximums. Un trou
 * ne se compare pas à une place : il disparaît dès qu'une personne de plus
 * est là. P2 par minute (100) > heures au-delà (50) : pour un shift de
 * 8 h, une personne de trop sur un « au plus », ou 8 h de trou, pèse plus
 * qu'un 6e jour et 8 h en plus (39 000 < 48 000).
 * Mais P2 < heures dues (400 par minute) : une personne due reste placée,
 * au pire en trop sur un « au plus » (choix du 2026-10-27, gardé). Le coût
 * d'une consigne est donc PLAFONNÉ sous les heures dues de chaque créneau
 * qui y compte, dépannage et confort payés (`coutConsigne`) : sans ce
 * plafond, une période dont
 * le plus long créneau fait 10 h (60 000) laissait sans shift une personne
 * due de 2 h (48 000) (relecture adverse du 2026-10-29).
 *
 * P4 sous P3 : dépannage 10 par minute < heures au-delà 50 par minute ; avec
 * la part fixe (4 609), le dépannage reste sous les heures en plus dès 2 h
 * de shift, et sous le 6e jour jusqu'à 17 h : un titulaire qui ferait des
 * heures en plus ou un 6e jour laisse la place au dépannage. P4 sous P1 :
 * une place tenue en dépannage vaut mieux qu'une place vide (D13, D14).
 * Remplaçant (D16, option A) : POIDS_REMPLACANT < PART_FIXE_DEPANNAGE, donc
 * un titulaire change d'horaire plutôt que de laisser la place à un
 * dépannage ; il est au niveau du confort (jour habituel 2 000), qui peut
 * rarement faire préférer un horaire voisin (accepté). L'écart d'heures avec
 * le besoin ne rapporte rien (`minutesDues`, `minutesEnPlus`) : sinon un
 * remplaçant d'une heure plus long rapportait 24 000 d'heures dues et
 * passait devant l'horaire imposé partout (relecture adverse du 2026-10-30) ;
 * ses minutes réelles au-delà du contrat se paient (50 par minute). Sous
 * un trou d'une demi-heure (3 000) : changer d'horaire pour fermer un trou
 * vaut la peine, une heure en plus comprise (3 000 + 2 000 < 6 000).
 *
 * RELÈVE (chevauchement de l'équipe qui arrive et de celle qui part, D4) :
 * PAS de bonus dans le modèle. Le bonus devait être P5 ; or la part fixe du
 * dépannage est DÉRIVÉE de tout le confort d'un shift : un bonus de relève
 * l'obligeait à grandir (le modèle de toutes les semaines changeait) et
 * demandait une variable par paire de créneaux qui se chevauchent. Le coût
 * des trous pousse déjà les horaires à se toucher ; un chevauchement n'est pas
 * récompensé de plus.
 *
 * P5 sous P4, pour TOUTE durée de shift : la part fixe du dépannage dépasse
 * la somme de tout le confort qu'un shift peut faire gagner ou perdre (jour
 * habituel, repos accolés, équité au pire, départage), et un dépannage ne
 * reçoit jamais la prime de jour habituel. Avant (relecture adverse du
 * 2026-10-29), seul le coût par minute séparait les deux : sur 3 h (1 800),
 * la prime de jour habituel d'un dépannage (2 000) le faisait passer devant
 * un titulaire libre. L'équité, la plus faible, ne fait faire ni une heure
 * en plus (3 000) ni un dépannage.
 *
 * Les coefficients restent sous 1e6 (place vide de 12 h ~ 1,3e5) : sûr pour
 * HiGHS. ÉCART VOULU avec le prototype (`generateur.py`) : ses poids
 * laissaient un trou de 4 h (24 000) plutôt qu'un 6e jour + 4 h en plus
 * (27 000), et ignoraient l'équité.
 */

// P5 — confort.
/** Par jour d'écart à sa part (week-ends, soirs, matins tôt). */
export const POIDS_EQUITE = 100
/** Deux jours de repos qui se suivent (demande utilisateur du 2026-11-01 :
 * « il faut que ça soit une priorité ; à défaut, des plannings un peu
 * biscornus »). Au-dessus de tout le reste du confort (jour habituel,
 * équité), sous les contrats et les places : les poids P1 et le surplus en
 * dérivent. */
export const POIDS_REPOS_SEPARES = 8_000
/** Un jour de travail en moins que le rythme du contrat (5 jours pour un
 * contrat de 35 h ou plus, école et absences décomptées ; demande
 * utilisateur du 2026-11-01 : « 39 h en 4 jours de 10 h », c'est non).
 * Au-dessus d'une personne en plus à l'accueil (le surplus d'un shift,
 * plafonné, reste en dessous), sous les heures dues et les places. */
export const POIDS_JOUR_MANQUANT = 80_000
/** Contrats à rythme de 5 jours : 35 h et plus. */
export const RYTHME_CONTRAT_MIN = 35 * 60
/** Ouverture d'un poste de l'accueil (07:00 Réception et Club, réglage du
 * poste) : un quart d'heure sans personne sur ce poste dans la première
 * heure. « Obligatoire » (2026-11-01) : au-dessus des contrats d'un jour de
 * travail. */
export const POIDS_OUVERTURE_QUART = 40_000
/** Pas de relève (l'équipe du matin et celle de l'après-midi jamais
 * ensemble le temps réglé) : au-dessus du 6e jour et des repos accolés,
 * sous les contrats. */
export const POIDS_RELEVE = 16_000
/** Travailler un jour habituel (semaine type « travail »). */
export const POIDS_JOUR_FIXE = 2_000
// P4 — titulaire avant dépannage, horaire imposé avant remplaçant.
export const POIDS_DEPANNAGE_MINUTE = 10
/** Un shift tenu avec un AUTRE code du même cycle que celui du besoin
 * (créneau remplaçant `r…`, D5, D16 option A). Sous la part fixe d'un
 * dépannage (D13 : titulaire remplaçant avant dépannage à l'horaire imposé),
 * au niveau du confort : le confort peut rarement faire préférer un horaire
 * voisin (accepté, D16). */
export const POIDS_REMPLACANT = 2_000

/** P4 : ce que coûte un shift tenu sur le remplaçant `r` au lieu du besoin
 * de sa place : POIDS_REMPLACANT, rien de plus. L'ÉCART D'HEURES entre les
 * deux codes ne se paie pas ici mais dans la mesure du contrat
 * (`minutesDues`, `minutesEnPlus`) : un remplaçant ne rapporte jamais plus
 * d'heures dues que le besoin, et n'épargne jamais plus d'heures en plus
 * (relecture adverse du 2026-10-30 : sans cela, un remplaçant d'une heure
 * plus long rapportait 24 000 d'heures dues et passait devant le code
 * imposé partout). Un créneau qui n'est pas un remplaçant ne coûte rien. */
export function coutRemplacant(r: Creneau): number {
  return r.place === null ? 0 : POIDS_REMPLACANT
}

/** Minutes d'un shift COMPTÉES dans les heures dues (contre le manque au
 * contrat) : un remplaçant compte au plus les heures du besoin de sa place,
 * jamais plus. Un remplaçant plus long ne rapporte donc rien de plus ; un
 * plus court coûte ce qu'il ne fait pas. */
export function minutesDues(c: Creneau, besoin?: Creneau): number {
  return c.place !== null && besoin
    ? Math.min(travail(c), travail(besoin))
    : travail(c)
}

/** Minutes d'un shift COMPTÉES dans les heures en plus (au-delà du
 * contrat) : un remplaçant compte au moins les heures du besoin. Un
 * remplaçant plus court n'épargne donc rien ; un plus long paie ses minutes
 * réelles. Avec `minutesDues` : à heures de contrat égales, l'horaire imposé
 * reste TOUJOURS devant, et un remplaçant n'est posé que si l'horaire imposé
 * ne se peut pas, ou pour une raison au-dessus des contrats (P1, P2 :
 * consigne, trou). Les plafonds légaux (48 h, journée) lisent, eux, les
 * minutes réelles. */
export function minutesEnPlus(c: Creneau, besoin?: Creneau): number {
  return c.place !== null && besoin
    ? Math.max(travail(c), travail(besoin))
    : travail(c)
}

/** `minutesDues` du shift fait COURT (`raccourci` en moins) : un
 * remplaçant raccourci compte encore au plus les heures du besoin, sur ses
 * minutes réelles (un horaire de 8 h fait en 7 h sur la place d'un horaire de 7 h : 7 h). */
export function minutesDuesCourt(c: Creneau, besoin?: Creneau): number {
  return c.place !== null && besoin
    ? Math.min(travail(c) - c.raccourci, travail(besoin))
    : travail(c) - c.raccourci
}

/** `minutesEnPlus` du shift fait COURT, de même. */
export function minutesEnPlusCourt(c: Creneau, besoin?: Creneau): number {
  return c.place !== null && besoin
    ? Math.max(travail(c) - c.raccourci, travail(besoin))
    : travail(c) - c.raccourci
}

/** Le besoin d'un créneau remplaçant, cherché par son id de place. */
export type BesoinDe = (place: string) => Creneau | undefined
// P3 — contrats.
export const POIDS_SUR_CONTRAT = 50
export const POIDS_SIXIEME_JOUR = 15_000
export const POIDS_SOUS_CONTRAT = 400
// P2 — matin et soir.
/** Une personne de moins (ou de plus) qu'une consigne, par minute de la
 * période (durée du plus long créneau qui y compte ce jour-là). */
export const POIDS_PRESENCE_MINUTE = 100
/** Un quart d'heure sans personne autonome sur un poste compté dans la
 * présence, entre le premier et le dernier besoin du jour (trou entre deux
 * équipes, D10) : le prix d'une personne qui manque à une consigne, par
 * minute. Une demi-heure (3 000) vaut un changement d'horaire (2 000), un
 * quart d'heure seul (1 500) non. */
export const POIDS_TROU_QUART = 15 * POIDS_PRESENCE_MINUTE
/** Pas de la grille des trous, en minutes réelles (0, 15, 30…). */
const QUART = 15
// Départage.
export const POIDS_DEJA_PROPOSE = 5
/** Bruit de la graine : 0 à 3 par affectation. */
export const BRUIT_MAX = 3
/** Soirs et matins tôt : rattrapage compté au plus (écart à sa part sur
 * les 4 semaines d'avant, plafonné : le palier P5 ne change pas). */
export const EQUITE_RATTRAPAGE_MAX = 7
/** Le pire que coûte l'équité pour UN shift ajouté : le week-end déplace la
 * somme des écarts d'au plus 2 (son écart de 1 - part, ceux des autres de
 * part au total) ; un soir et un matin tôt, au plus le rattrapage chacun. */
export const EQUITE_MAX_PAR_SHIFT =
  2 * POIDS_EQUITE + 2 * EQUITE_RATTRAPAGE_MAX * POIDS_EQUITE

/** P4 : part fixe d'un shift en dépannage, au-dessus de la somme de TOUT le
 * confort (P5) qu'un shift peut faire gagner ou perdre, départage compris :
 * un titulaire libre passe devant, quelle que soit la durée du shift (D13).
 * Les repos accolés n'y sont plus (2026-11-01) : ils sont devenus une
 * priorité au niveau du dépannage, sous le 6e jour ; les y laisser rendait
 * le dépannage plus cher qu'un 6e jour de titulaire. */
export const PART_FIXE_DEPANNAGE =
  POIDS_JOUR_FIXE + EQUITE_MAX_PAR_SHIFT + POIDS_DEJA_PROPOSE + BRUIT_MAX + 1

/** P4 : ce que coûte un shift `c` tenu en dépannage. */
export function coutDepannage(c: Creneau) {
  return POIDS_DEPANNAGE_MINUTE * duree(c) + PART_FIXE_DEPANNAGE
}

/** P2 : une personne de moins (ou de plus) qu'une consigne, sur une
 * période dont `creneaux` sont les créneaux qui y comptent ce jour-là.
 * Proportionnel au plus long, PLAFONNÉ sous ce que rapportent les heures
 * dues de chacun, une fois payés un dépannage et tout le confort
 * (voir P2 sous P1 : une personne due reste placée). */
export function coutConsigne(
  creneaux: Creneau[],
  besoinDe: BesoinDe = () => undefined,
): number {
  if (!creneaux.length) return 0
  const long = Math.max(...creneaux.map(duree))
  // Un remplaçant ne rapporte que ses heures moins son coût de code.
  const plafond = Math.min(
    ...creneaux.map(
      (c) =>
        POIDS_SOUS_CONTRAT *
          minutesDues(c, c.place !== null ? besoinDe(c.place) : undefined) -
        coutDepannage(c) -
        coutRemplacant(c),
    ),
  )
  return Math.max(0, Math.min(POIDS_PRESENCE_MINUTE * long, plafond))
}

/** P4 (D7 du 2026-11-01) : ce que coûte un shift tenu par un EXTRA sur un
 * candidat de l'accueil. Au-dessus d'un dépannage qui ferait ce même shift
 * en heures en plus ET en 6e jour (un extra est payé 1 par minute, contrat
 * indicatif : sans cette part, il passerait devant tout le monde) ; sous la
 * place vide, qui le compte dans son pire (`pireCoutRemplir`). */
export function coutExtra(c: Creneau) {
  return (
    POIDS_SUR_CONTRAT * duree(c) + POIDS_SIXIEME_JOUR + coutDepannage(c) + 1
  )
}

/** D8 : part fixe d'une personne en plus du chiffre d'un moment, au-dessus
 * de TOUT le confort d'un shift (la même somme que le dépannage). */
export const PART_FIXE_SURPLUS = PART_FIXE_DEPANNAGE
/** D8 : par minute du plus long candidat du moment. */
export const POIDS_SURPLUS_MINUTE = POIDS_PRESENCE_MINUTE

/** D8 : une personne EN PLUS du chiffre d'un moment, dont `creneaux` sont
 * les créneaux qui y comptent ce jour-là (voir SURPLUS en tête). Au-dessus
 * du confort et des heures ordinaires (`POIDS_SURPLUS_MINUTE` par minute du
 * plus long + `PART_FIXE_SURPLUS`), PLAFONNÉ sous les heures dues de chaque
 * créneau ouvert, dépannage et confort payés, divisé par ses moments. Les
 * shifts posés (`ferme`) ne comptent pas dans le calcul : ils sont là. */
export function coutSurplus(creneaux: Creneau[]): number {
  const ouverts = creneaux.filter((c) => !c.ferme)
  if (!ouverts.length) return 0
  const long = Math.max(...ouverts.map(duree))
  const plafond = Math.min(
    ...ouverts.map(
      (c) =>
        Math.floor(
          (POIDS_SOUS_CONTRAT * travail(c) -
            coutDepannage(c) -
            PART_FIXE_DEPANNAGE) /
            Math.max(1, c.presence.length),
        ) - 1,
    ),
  )
  return Math.max(
    0,
    Math.min(POIDS_SURPLUS_MINUTE * long + PART_FIXE_SURPLUS, plafond),
  )
}

/** Le pire que coûte l'ajout d'une personne libre sur `c` (voir P1), le
 * changement d'horaire compris quand `c` est un remplaçant, un extra quand
 * `c` est un candidat de l'accueil. */
export function pireCoutRemplir(
  c: Creneau,
  presenceLaPlusChere: number,
  besoin?: Creneau,
) {
  // Heures en plus comptées pour un remplaçant : au moins celles du besoin
  // (`minutesEnPlus`), donc au plus la plus longue des deux durées.
  const enPlus =
    c.place !== null && besoin ? Math.max(duree(c), duree(besoin)) : duree(c)
  return (
    POIDS_SUR_CONTRAT * enPlus +
    POIDS_DEPANNAGE_MINUTE * duree(c) +
    PART_FIXE_DEPANNAGE +
    coutRemplacant(c) +
    (c.accueil ? coutExtra(c) : 0) +
    POIDS_SIXIEME_JOUR +
    POIDS_REPOS_SEPARES +
    presenceLaPlusChere +
    EQUITE_MAX_PAR_SHIFT +
    POIDS_DEJA_PROPOSE +
    BRUIT_MAX
  )
}

/** P1 : une personne qui manque sur une place nécessaire, strictement plus
 * que tout ce qu'il faudrait payer pour la remplir. */
export function coutPlaceVide(
  c: Creneau,
  presenceLaPlusChere: number,
  besoin?: Creneau,
) {
  return pireCoutRemplir(c, presenceLaPlusChere, besoin) + 1
}

/** P1 : une personne qui manque sur une PLACE tenue par le besoin ou l'un
 * de ses remplaçants (`membres`) : au-dessus du pire de chacun, pour que la
 * place ne reste vide que si personne ne peut tenir AUCUN des horaires. Sans
 * remplaçant, `coutPlaceVide` du besoin, inchangé. */
export function coutPlaceVideGroupe(
  membres: Creneau[],
  presenceLaPlusChere: number,
  besoinDe: BesoinDe = (place) => membres.find((m) => m.id === place),
) {
  return Math.max(
    ...membres.map((c) =>
      coutPlaceVide(
        c,
        presenceLaPlusChere,
        c.place !== null ? besoinDe(c.place) : undefined,
      ),
    ),
  )
}

/** P1 (D7) : une personne de moins que le minimum d'une consigne, dont
 * `creneaux` sont les créneaux qui y comptent ce jour-là. Même dérivation
 * que la place vide : ajouter une personne libre sur l'un d'eux coûte au
 * plus `pireCoutRemplir` (heures en plus, dépannage, remplaçant, 6e jour,
 * repos accolés, « au plus » d'une consigne, équité, départage) ; le manque
 * coûte strictement plus que le pire d'entre eux. À l'optimum, un minimum
 * n'est manqué que si personne ne peut être ajouté sur aucun créneau qui
 * compte (règle dure, ou place déjà au plus). Un shift posé à la main
 * (`ferme`) ne reçoit personne : il n'entre pas dans le calcul. */
export function coutManqueMinimum(
  creneaux: Creneau[],
  presenceLaPlusChere: number,
  besoinDe?: BesoinDe,
) {
  const ouverts = creneaux.filter((c) => !c.ferme)
  return ouverts.length
    ? coutPlaceVideGroupe(ouverts, presenceLaPlusChere, besoinDe)
    : 0
}

/** Un moment sans personne autonome sur un poste compté dans la présence,
 * entre le début du premier besoin et la fin du dernier du jour. Minutes
 * réelles depuis le lundi (`temps.ts`). */
export interface Trou {
  poste: string
  jour: number
  debut: number
  fin: number
}

/** Le résultat du générateur, avec les trous entre équipes restés. */
export type ResultatGeneration = Resultat & {
  trous: Trou[]
  /** Ouvertures restées sans personne (poste de l'accueil, première heure). */
  ouvertures: Trou[]
  /** Jours sans relève entre l'équipe du matin et celle de l'après-midi. */
  relevesManquantes: number[]
  /** Calcul qui a servi (mesure seulement, voir `generer`) : 1 = sans les
   * remplaçants non imposés, 2 = problème complet. */
  etapes: 1 | 2
}

/** Le solveur HiGHS tel que le rend `highs` (API historique). */
export interface Highs {
  solve: (
    lp: string,
    options?: Record<string, string | number | boolean>,
  ) => {
    Status: string
    /** Infini (ou absent) quand aucune solution n'est connue. */
    ObjectiveValue?: number
    Columns: Record<string, { Primal?: number }>
  }
}

export function courtOblige(s: SalarieSolveur, c: Creneau): boolean {
  return duree(c) > presenceMax(s, c) && c.raccourci > 0
}

export function reposAvecVoisins(s: SalarieSolveur, c: Creneau): boolean {
  return coupureRespectee(
    s.finServicePrecedent,
    s.debutServiceSuivant,
    c.debut,
    c.fin,
    s.reposQuotidienMin,
  )
}

export function compatible(s: SalarieSolveur, c: Creneau): boolean {
  const j = jourDe(c)
  const r = role(s, c.poste)
  return (
    // Un extra n'est placé que sur un candidat de l'accueil (D7) ; un
    // soutien y trouve toujours sa place (D5), accompagné (`construire`).
    (!s.placementManuel || c.accueil) &&
    r !== null &&
    (r !== 'soutien' || c.soutien > 0 || c.accueil) &&
    !s.indisponibilites.has(j) &&
    !s.horsContrat.has(j) &&
    dansLeContrat(s, c) &&
    !s.reposFixes.has(j) &&
    duree(c) - (courtOblige(s, c) ? c.raccourci : 0) <= presenceMax(s, c) &&
    !(s.nuitInterdite && toucheLaNuit(c)) &&
    codeDeLaFiche(s, c.typeShift) &&
    codeImposeRespecte(s, j, c.typeShift) &&
    reposAvecVoisins(s, c) &&
    (s.debutAuPlusTot === null || c.debut >= s.debutAuPlusTot)
  )
}

/** R-REPOS-HEBDO-35H possible avec ces seuls services ? */
export function reposHebdoPossible(
  s: SalarieSolveur,
  services: Creneau[],
  jours: number[],
): boolean {
  for (const d of jours) {
    if (s.joursHorsSite.has(d) || services.some((c) => jourDe(c) === d))
      continue
    const avant = services.filter((c) => jourDe(c) < d).map((c) => c.fin)
    const apres = services.filter((c) => jourDe(c) > d).map((c) => c.debut)
    const fin = avant.length ? Math.max(...avant) : s.finServicePrecedent
    const debut = apres.length ? Math.min(...apres) : s.debutServiceSuivant
    if (fin === null || debut === null || debut - fin >= s.reposHebdoMin)
      return true
  }
  return false
}

/** Petit générateur pseudo-aléatoire déterministe (mulberry32). */
function alea(graine: number): () => number {
  let a = graine >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Terme = readonly [number, string]

/** Un modèle linéaire en construction, écrit au format LP de HiGHS. */
class Modele {
  private n = 0
  readonly binaires: string[] = []
  readonly entiers: Array<[string, number, number]> = []
  readonly continues: Array<[string, number, number]> = []
  readonly contraintes: string[] = []
  readonly objectif = new Map<string, number>()
  impossible = false

  bool(): string {
    const v = `b${this.n++}`
    this.binaires.push(v)
    return v
  }

  entier(min: number, max: number): string {
    const v = `i${this.n++}`
    this.entiers.push([v, min, max])
    return v
  }

  continu(min: number, max: number): string {
    const v = `r${this.n++}`
    this.continues.push([v, min, max])
    return v
  }

  /** Σ termes (op) rhs ; une contrainte sans variable est vérifiée ici. */
  ajoute(termes: Terme[], op: '<=' | '>=' | '=', rhs: number): void {
    const somme = new Map<string, number>()
    for (const [coef, v] of termes) somme.set(v, (somme.get(v) ?? 0) + coef)
    const utiles = [...somme].filter(([, coef]) => coef !== 0)
    if (utiles.length === 0) {
      const ok = op === '<=' ? 0 <= rhs : op === '>=' ? 0 >= rhs : rhs === 0
      if (!ok) this.impossible = true
      return
    }
    this.contraintes.push(
      `${ligne(utiles.map(([v, c]) => [c, v]))} ${op} ${rhs}`,
    )
  }

  cout(coef: number, v: string): void {
    if (coef === 0) return
    this.objectif.set(v, (this.objectif.get(v) ?? 0) + coef)
  }

  lp(): string {
    const obj = [...this.objectif].map(([v, c]) => [c, v] as Terme)
    const toutes = [
      ...this.binaires,
      ...this.entiers.map((e) => e[0]),
      ...this.continues.map((e) => e[0]),
    ]
    const parts = [
      'Minimize',
      ` obj: ${obj.length ? ligne(obj) : `0 ${toutes[0]}`}`,
      'Subject To',
    ]
    this.contraintes.forEach((c, i) => parts.push(` c${i}: ${c}`))
    parts.push('Bounds')
    for (const [v, min, max] of [...this.entiers, ...this.continues]) {
      parts.push(` ${min} <= ${v} <= ${max}`)
    }
    if (this.entiers.length) {
      parts.push('General', ...enLignes(this.entiers.map((e) => e[0])))
    }
    if (this.binaires.length) parts.push('Binary', ...enLignes(this.binaires))
    parts.push('End')
    return parts.join('\n')
  }
}

function ligne(termes: Terme[]): string {
  const morceaux: string[] = []
  termes.forEach(([coef, v], i) => {
    const signe = coef < 0 ? '-' : '+'
    const abs = Math.abs(coef)
    const t = `${abs === 1 ? '' : `${abs} `}${v}`
    morceaux.push(i === 0 ? (coef < 0 ? `- ${t}` : t) : `${signe} ${t}`)
  })
  // Lignes courtes : une continuation commence par une espace.
  const lignes: string[] = []
  for (let i = 0; i < morceaux.length; i += 12) {
    lignes.push(morceaux.slice(i, i + 12).join(' '))
  }
  return lignes.join('\n  ')
}

function enLignes(noms: string[]): string[] {
  const r: string[] = []
  for (let i = 0; i < noms.length; i += 20)
    r.push(` ${noms.slice(i, i + 20).join(' ')}`)
  return r
}

/** Les termes à coefficient non nul (un shift court qui ne change pas la
 * mesure ajoute un terme nul). */
const nonNuls = (t: Terme[]) => t.filter(([k]) => k !== 0)

function intervalle(debut: number, fin: number): number[] {
  const r: number[] = []
  for (let i = debut; i < fin; i++) r.push(i)
  return r
}

interface Construit {
  modele: Modele
  x: Map<string, string>
  court: Map<string, string>
  manque: Map<string, string>
  ecarts: Array<[string, string]>
  /** Variables de trou (une par morceau de plage), voir `trousEntreEquipes`. */
  trous: Array<Trou & { v: string }>
  /** Ouvertures (première heure d'un poste de l'accueil), même forme. */
  ouvertures: Array<Trou & { v: string }>
  /** Relève manquée, une variable par jour. */
  releves: Array<{ jour: number; v: string }>
  /** Variables de manque au chiffre d'un moment (une par moment demandé),
   * avec l'indice du moment dans `Probleme.consignes`. */
  minimums: Array<{ v: string; consigne: number }>
  /** Minutes sous et au-dessus du contrat des personnes à contrat NON
   * indicatif, par personne et par semaine : [fiche, moins, plus]. */
  sousContrat: Array<[string, string, string]>
}

/** Réglages internes de la construction (tests et mesures seulement). */
export interface OptionsConstruction {
  /**
   * `false` : écrit aussi les contraintes que la réduction des remplaçants
   * retire (voir `REDUCTION DES REMPLAÇANTS` plus bas). Même espace de
   * solutions ; ne sert qu'à le prouver.
   */
  reduire?: boolean
}

export function construire(
  p: Probleme,
  options: OptionsConstruction = {},
): Construit {
  const reduire = options.reduire ?? true
  const m = new Modele()
  const nbSemaines = Math.ceil(p.nbJours / 7)
  const hasard = alea(p.graine)
  const imposees = p.imposees
  const creneaux = new Map(p.creneaux.map((c) => [c.id, c]))
  const salaries = new Map(p.salaries.map((s) => [s.id, s]))

  const x = new Map<string, string>()
  for (const s of p.salaries) {
    for (const c of p.creneaux) {
      const k = cle(s.id, c.id)
      if (imposees.has(k) || (!c.ferme && compatible(s, c))) x.set(k, m.bool())
    }
  }
  for (const k of imposees) {
    const v = x.get(k)
    if (v) m.ajoute([[1, v]], '=', 1)
  }

  const court = new Map<string, string>()
  for (const [k, v] of x) {
    const [sId, cId] = scinder(k)
    const c = creneaux.get(cId)
    const s = salaries.get(sId)
    if (!c || !s || !c.raccourci) continue
    const vc = m.bool()
    court.set(k, vc)
    if (imposees.has(k)) {
      m.ajoute([[1, vc]], '=', p.courtes.has(k) ? 1 : 0)
    } else {
      m.ajoute(
        [
          [1, vc],
          [-1, v],
        ],
        '<=',
        0,
      )
      if (s.etoileFixe.has(jourDe(c)) || courtOblige(s, c)) {
        m.ajoute(
          [
            [1, vc],
            [-1, v],
          ],
          '=',
          0,
        )
      }
    }
  }

  const ecarts: Array<[string, string]> = []
  const sousContrat: Array<[string, string, string]> = []
  const manque = new Map<string, string>()
  const minimums: Array<{ v: string; consigne: number }> = []

  // Tableau de l'accueil : les créneaux qui comptent, ce jour et à ce
  // moment (un middle dans deux moments). Le surplus se paie selon D8
  // (`coutSurplus`) ; le manque est une place nécessaire (P1, D7), dérivé
  // comme `coutPlaceVide`. Seul le surplus entre dans `presenceLaPlusChere`
  // : le coût du manque en dépend, il ne peut pas en faire partie.
  const comptent = p.consignes.map((k) =>
    p.creneaux.filter(
      (c) => c.presence.includes(k.periode) && jourDe(c) === k.jour,
    ),
  )
  const besoinDe: BesoinDe = (place) => creneaux.get(place)
  const coutsSurplus = comptent.map((cs) => coutSurplus(cs))
  const presenceLaPlusChere = Math.max(0, ...coutsSurplus)
  const coutsMinimum = comptent.map((cs) =>
    coutManqueMinimum(cs, presenceLaPlusChere, besoinDe),
  )

  // Couverture, par PLACE : un besoin `b…` et ses remplaçants `r…`
  // (`place` = id du besoin, même cycle, autre horaire permis) forment un
  // groupe. Un seul manque par groupe, au plus effectif + facultatif du
  // besoin au total ; les remplaçants n'ont aucune contrainte propre.
  const groupes = new Map<string, Creneau[]>()
  for (const c of p.creneaux) {
    // Un candidat de l'accueil n'a pas de place : le chiffre du moment
    // compte pour lui (plus bas).
    if (c.ferme || c.accueil) continue
    const g = c.place ?? c.id
    groupes.set(g, [...(groupes.get(g) ?? []), c])
  }
  for (const [g, membres] of groupes) {
    // Le besoin fixe la place ; sans lui (remplaçant orphelin), le premier.
    const tete = membres.find((c) => c.id === g) ?? membres[0]
    const autonomes: string[] = []
    const soutiens: Array<[SalarieSolveur, string, Creneau]> = []
    for (const c of membres) {
      for (const s of p.salaries) {
        const v = x.get(cle(s.id, c.id))
        if (!v) continue
        const r = role(s, c.poste)
        if (r === 'soutien') soutiens.push([s, v, c])
        else autonomes.push(v)
        // P4 : un dépannage coûte, un titulaire libre passe devant (D13).
        if (r === 'occasionnel') m.cout(coutDepannage(c), v)
        // P4 : un autre horaire du cycle coûte, l'horaire imposé passe devant
        // (D5, D13, D16), en plus du dépannage s'il y a lieu ; l'écart
        // d'heures avec le besoin est rendu (`coutRemplacant`).
        if (c.place !== null) m.cout(coutRemplacant(c), v)
      }
    }
    const vm = m.entier(0, tete.effectif)
    manque.set(tete.id, vm)
    m.ajoute(
      [...autonomes.map((v) => [1, v] as Terme), [1, vm]],
      '>=',
      tete.effectif,
    )
    m.ajoute(
      autonomes.map((v) => [1, v] as Terme),
      '<=',
      tete.effectif + tete.facultatif,
    )
    m.cout(coutPlaceVideGroupe(membres, presenceLaPlusChere, besoinDe), vm)
    if (soutiens.length) {
      const nbImposes = soutiens.filter(([s, , c]) =>
        imposees.has(cle(s.id, c.id)),
      ).length
      m.ajoute(
        soutiens.map(([, v]) => [1, v] as Terme),
        '<=',
        Math.max(tete.soutien, nbImposes),
      )
      // Soutien jamais seul : compté sur la place entière.
      for (const [s, v, c] of soutiens) {
        if (!imposees.has(cle(s.id, c.id))) {
          m.ajoute([[1, v], ...autonomes.map((a) => [-1, a] as Terme)], '<=', 0)
        }
      }
    }
  }

  // AGRÉGATS DE L'ACCUEIL (performance, 2026-11-01). Un candidat est tenu
  // par jusqu'à vingt personnes, et les lignes du chiffre d'un moment, des
  // trous et de l'accompagnement des soutiens en additionnent des dizaines :
  // écrites variable par variable, une semaine faisait 186 000 coefficients.
  // Chaque candidat reçoit donc trois sommes (continues, définies par une
  // égalité) : tous ceux qui le tiennent, les autonomes, et les autonomes
  // qui le font en version courte. Simple substitution linéaire : mêmes
  // solutions entières, même relâché, même optimum (propriété « même
  // optimum » d'accueil.test.ts, qui compare aussi à la construction sans
  // réduction). Un shift posé (`a…`) garde ses variables propres.
  const sommesAccueil = new Map<
    string,
    { tous: Terme[]; autonomes: Terme[]; courts: Terme[]; n: number }
  >()
  const sommer = (termes: Terme[]): Terme[] => {
    if (termes.length <= 1) return termes
    const v = m.continu(0, termes.length)
    m.ajoute([...termes, [-1, v]], '=', 0)
    return [[1, v]]
  }
  for (const c of p.creneaux) {
    if (!c.accueil) continue
    const tous: Terme[] = []
    const autonomes: Terme[] = []
    const courts: Terme[] = []
    for (const s of p.salaries) {
      const k = cle(s.id, c.id)
      const v = x.get(k)
      if (!v) continue
      tous.push([1, v])
      if (role(s, c.poste) === 'soutien') continue
      autonomes.push([1, v])
      const vc = court.get(k)
      if (vc) courts.push([1, vc])
    }
    if (!tous.length) continue
    const memes = autonomes.length === tous.length
    const sa = sommer(autonomes)
    sommesAccueil.set(c.id, {
      tous: memes ? sa : sommer(tous),
      autonomes: sa,
      courts: sommer(courts),
      n: tous.length,
    })
  }
  /** Les termes d'un créneau qui comptent : sa somme pour un candidat, ses
   * variables une à une sinon. */
  const termesDe = (
    c: Creneau,
    quoi: 'tous' | 'autonomes' | 'courts',
  ): Terme[] => {
    if (c.accueil) return sommesAccueil.get(c.id)?.[quoi] ?? []
    const r: Terme[] = []
    for (const s of p.salaries) {
      const k = cle(s.id, c.id)
      const v = x.get(k)
      if (!v) continue
      const soutien = role(s, c.poste) === 'soutien'
      if (quoi === 'tous') r.push([1, v])
      else if (!soutien) {
        const t = quoi === 'courts' ? court.get(k) : v
        if (t) r.push([1, t])
      }
    }
    return r
  }

  // Candidats de l'accueil : le prix du dépannage ou de l'extra (D7), et un
  // soutien jamais seul (D5) : chaque soutien non imposé <= les autonomes
  // du MÊME poste dont le créneau chevauche le sien (la règle de
  // `soutiensSeuls`, le vérificateur). Un soutien n'est pas autonome : il ne
  // s'accompagne pas lui-même.
  const parPoste = new Map<string, Creneau[]>()
  for (const c of p.creneaux)
    parPoste.set(c.poste, [...(parPoste.get(c.poste) ?? []), c])
  for (const c of p.creneaux) {
    if (!c.accueil || c.ferme) continue
    let avec: Terme[] | null = null
    for (const s of p.salaries) {
      const k = cle(s.id, c.id)
      const v = x.get(k)
      if (!v) continue
      const r = role(s, c.poste)
      if (s.placementManuel) m.cout(coutExtra(c), v)
      else if (r === 'occasionnel') m.cout(coutDepannage(c), v)
      if (r !== 'soutien' || imposees.has(k)) continue
      if (!avec) {
        avec = []
        for (const d of parPoste.get(c.poste) ?? [])
          if (d.debut < c.fin && c.debut < d.fin)
            avec.push(...termesDe(d, 'autonomes'))
        avec = sommer(avec)
      }
      m.ajoute([[1, v], ...avec.map(([k2, w]) => [-k2, w] as Terme)], '<=', 0)
    }
  }

  // Le chiffre de chaque moment (D3) : Σ des shifts qui comptent, soutiens
  // compris (D5) = N. Souple des deux côtés (le modèle reste toujours
  // réalisable) : un manque (P1) ou un surplus (D8) se paie. Le chiffre est
  // `minimum` (minimum = maximum après la migration ; s'il diffère, le
  // minimum fait foi).
  p.consignes.forEach((k, i) => {
    const n = Math.max(0, k.minimum)
    const termes: Terme[] = []
    // Le plus grand compte possible : une personne par variable.
    let possibles = 0
    for (const c of comptent[i]) {
      termes.push(...termesDe(c, 'tous'))
      if (c.accueil) possibles += sommesAccueil.get(c.id)?.n ?? 0
      else possibles += p.salaries.filter((s) => x.has(cle(s.id, c.id))).length
    }
    // Manque et surplus CONTINUS : à x entiers, leur optimum est entier
    // (max(0, N - Σ), max(0, Σ - N)) ; mesuré un peu plus régulier pour HiGHS.
    if (n > 0) {
      const vm = m.continu(0, n)
      m.ajoute([...termes, [1, vm]], '>=', n)
      m.cout(coutsMinimum[i], vm)
      minimums.push({ v: vm, consigne: i })
    }
    if (possibles > n) {
      const vp = m.continu(0, possibles)
      m.ajoute([...termes, [-1, vp]], '<=', n)
      m.cout(coutsSurplus[i], vp)
    }
  })

  const trous = trousEntreEquipes(m, p, x, court, termesDe)
  // Ouverture (2026-11-01) : la première heure de chaque poste de l'accueil
  // qui a une heure d'ouverture, tenue sur CE poste.
  const ouvertures = (p.ouvertures ?? []).flatMap((o) =>
    variablesTrous(
      m,
      p,
      x,
      court,
      termesDe,
      o.poste,
      o.jour,
      o.debut,
      o.fin,
      p.creneaux.filter((c) => c.poste === o.poste),
      POIDS_OUVERTURE_QUART,
    ),
  )
  const releves = relevesAccueil(m, p, court, termesDe)

  // Une « expression » : termes + constante.
  type Expr = { termes: Terme[]; constante: number }
  const semainesJours = new Map<string, Expr>()
  const figes = new Map<string, number>()
  const travailleDe = new Map<string, Map<number, string>>()

  for (const s of p.salaries) {
    const siens = p.creneaux.filter((c) => x.has(cle(s.id, c.id)))
    const fixes = siens.filter((c) => imposees.has(cle(s.id, c.id)))
    const xv = (c: Creneau) => x.get(cle(s.id, c.id)) as string

    const parJour = new Map<number, Creneau[]>()
    for (const c of siens) {
      const j = jourDe(c)
      parJour.set(j, [...(parJour.get(j) ?? []), c])
    }
    const travaille = new Map<number, string>()
    travailleDe.set(s.id, travaille)
    for (const [jour, liste] of parJour) {
      const nbFixes = fixes.filter((c) => jourDe(c) === jour).length
      m.ajoute(
        liste.map((c) => [1, xv(c)] as Terme),
        '<=',
        Math.max(1, nbFixes),
      )
      const t = m.bool()
      travaille.set(jour, t)
      for (const c of liste)
        m.ajoute(
          [
            [1, t],
            [-1, xv(c)],
          ],
          '>=',
          0,
        )
      m.ajoute([[1, t], ...liste.map((c) => [-1, xv(c)] as Terme)], '<=', 0)
    }

    // Chevauchement et repos quotidien : paires interdites.
    //
    // REDUCTION DES REMPLAÇANTS (B2, plan planning-cycles-2026-10-30). Les
    // créneaux remplaçants (`place !== null`) multiplient les créneaux d'un
    // même jour : écrites une à une, ces paires passaient de ~1 400 à
    // ~64 000 sur une vraie semaine. Deux réductions, qui ne changent RIEN à
    // l'ensemble des plannings permis (solutions entières) :
    //   1. Même jour, au plus un fixe ce jour-là : la contrainte du jour
    //      ci-dessus est Σ x(jour) <= 1, et toutes les x sont >= 0, donc
    //      x_a + x_b <= 1 en découle déjà. La paire n'est pas écrite.
    //   2. Jours différents (repos quotidien d'un soir au lendemain) : pour
    //      un créneau a, ses paires vers les créneaux b d'un même jour J (au
    //      plus un fixe ce jour-là, donc Σ x(J) <= 1) deviennent UNE
    //      contrainte  x_a + Σ_{b de J en conflit avec a} x_b <= 1.
    //      En entiers : x_a = 1 force chaque x_b à 0, comme les paires ;
    //      x_a = 0 laisse Σ x_b <= 1, déjà vrai par le jour J. Les paires se
    //      déduisent de l'agrégat (x_b >= 0) : rien d'interdit n'est
    //      permis, rien de permis n'est retiré. (Le relâché continu est
    //      seulement plus serré, ce qui aide HiGHS sans changer l'optimum.)
    //   La réduction 1, elle, laisse même le relâché identique.
    // Seuls les groupes qui touchent un remplaçant (ou un candidat de
    // l'accueil) sont réduits : sans eux, le modèle reste OCTET POUR OCTET celui d'avant (test « même
    // texte LP », generateur.test.ts) ; avec, l'équivalence est prouvée par
    // la propriété « même valeur optimale » du même fichier.
    const fixesDuJour = new Map<number, number>()
    for (const c of fixes)
      fixesDuJour.set(jourDe(c), (fixesDuJour.get(jourDe(c)) ?? 0) + 1)
    const auPlusUnLeJour = (j: number) => (fixesDuJour.get(j) ?? 0) <= 1
    const enConflit = (a: Creneau, b: Creneau) => {
      const [premier, second] = a.debut <= b.debut ? [a, b] : [b, a]
      return second.debut - premier.fin < s.reposQuotidienMin
    }
    // Agrégats (2) : a → jour de b → créneaux b.
    const agreges = new Map<Creneau, Map<number, Creneau[]>>()
    for (let i = 0; i < siens.length; i++) {
      for (let k = i + 1; k < siens.length; k++) {
        const a = siens[i]
        const b = siens[k]
        if (fixes.includes(a) && fixes.includes(b)) continue
        if (!enConflit(a, b)) continue
        // Les candidats de l'accueil (D1) multiplient eux aussi les créneaux
        // d'un jour : même réduction, même preuve.
        const remplacant =
          a.place !== null || b.place !== null || a.accueil || b.accueil
        if (reduire && remplacant) {
          const ja = jourDe(a)
          const jb = jourDe(b)
          if (ja === jb && auPlusUnLeJour(ja)) continue
          if (ja !== jb && auPlusUnLeJour(jb)) {
            const parJourB = agreges.get(a) ?? new Map<number, Creneau[]>()
            agreges.set(a, parJourB)
            parJourB.set(jb, [...(parJourB.get(jb) ?? []), b])
            continue
          }
        }
        m.ajoute(
          [
            [1, xv(a)],
            [1, xv(b)],
          ],
          '<=',
          1,
        )
      }
    }
    for (const [a, parJourB] of agreges) {
      for (const liste of parJourB.values()) {
        m.ajoute(
          [[1, xv(a)], ...liste.map((b) => [1, xv(b)] as Terme)],
          '<=',
          1,
        )
      }
    }

    for (let k = 0; k < nbSemaines; k++) {
      const jours = intervalle(7 * k, Math.min(7 * k + 7, p.nbJours))
      const dans = (j: number) => jours.includes(j)
      const fixesSemaine = fixes.filter((c) => dans(jourDe(c)))
      const joursFixes = new Set(fixesSemaine.map(jourDe))
      const ecole = new Set(jours.filter((j) => s.joursHorsSite.has(j)))
      const fige = new Set([...joursFixes, ...ecole]).size
      figes.set(`${k}|${s.id}`, fige)

      const nbJours: Expr = {
        termes: jours
          .filter((j) => travaille.has(j) && !ecole.has(j))
          .map((j) => [1, travaille.get(j) as string] as Terme),
        constante: ecole.size,
      }
      const borne = (e: Expr, op: '<=' | '>=', rhs: number) =>
        m.ajoute(e.termes, op, rhs - e.constante)

      // R-SIX-JOURS-MAX.
      borne(nbJours, '<=', Math.max(s.joursTravaillesMaxSemaine, fige))
      // R-REPOS-HEBDO-HCR : un 6e jour coûte.
      if (s.joursPreferesSemaine < s.joursTravaillesMaxSemaine) {
        const six = m.entier(0, 7)
        // six >= nb_jours - préférés
        m.ajoute(
          [[1, six], ...nbJours.termes.map(([c, v]) => [-c, v] as Terme)],
          '>=',
          nbJours.constante - s.joursPreferesSemaine,
        )
        m.cout(POIDS_SIXIEME_JOUR, six)
      }
      // Rythme de 5 jours (2026-11-01) : un contrat de 35 h ou plus se fait
      // en `joursPreferesSemaine` jours, absences et jours hors contrat
      // décomptés (l'école compte déjà comme un jour, `nbJours`).
      if (!s.contratIndicatif && s.minutesHebdoContrat >= RYTHME_CONTRAT_MIN) {
        const absents = jours.filter(
          (j) => s.indisponibilites.has(j) || s.horsContrat.has(j),
        ).length
        const attendu = Math.min(s.joursPreferesSemaine, jours.length) - absents
        if (attendu > nbJours.constante) {
          const ecart = m.entier(0, 7)
          m.ajoute(
            [[1, ecart], ...nbJours.termes],
            '>=',
            attendu - nbJours.constante,
          )
          m.cout(POIDS_JOUR_MANQUANT, ecart)
        }
      }
      if (s.reposDeuxSemaines) {
        const plafondDeux = 14 - s.reposDeuxSemaines
        const voisines: number[] = []
        if (k === 0 && s.joursSemainePrecedente !== null)
          voisines.push(s.joursSemainePrecedente)
        if (k === nbSemaines - 1 && s.joursSemaineSuivante !== null)
          voisines.push(s.joursSemaineSuivante)
        for (const autre of voisines)
          borne(nbJours, '<=', Math.max(plafondDeux - autre, fige))
        const prec = semainesJours.get(`${k - 1}|${s.id}`)
        if (k > 0 && prec) {
          m.ajoute(
            [...nbJours.termes, ...prec.termes],
            '<=',
            Math.max(plafondDeux, fige + (figes.get(`${k - 1}|${s.id}`) ?? 0)) -
              nbJours.constante -
              prec.constante,
          )
        }
        semainesJours.set(`${k}|${s.id}`, nbJours)
      }

      const minutes: Terme[] = []
      // Contrat : minutes comptées contre le manque et contre le surplus
      // (`minutesDues`, `minutesEnPlus`) ; elles ne diffèrent que sur un
      // remplaçant d'une autre durée que son besoin.
      const dues: Terme[] = []
      const enPlus: Terme[] = []
      for (const c of siens) {
        if (!dans(jourDe(c))) continue
        minutes.push([travail(c), xv(c)])
        const besoin = c.place !== null ? besoinDe(c.place) : undefined
        dues.push([minutesDues(c, besoin), xv(c)])
        enPlus.push([minutesEnPlus(c, besoin), xv(c)])
        const vc = court.get(cle(s.id, c.id))
        if (vc) {
          // Fait court : la variable `court` ajoute l'écart entre la mesure
          // du shift court et celle du shift long (une constante, donc
          // linéaire et exact) ; sans remplaçant, -raccourci partout.
          minutes.push([-c.raccourci, vc])
          dues.push([minutesDuesCourt(c, besoin) - minutesDues(c, besoin), vc])
          enPlus.push([
            minutesEnPlusCourt(c, besoin) - minutesEnPlus(c, besoin),
            vc,
          ])
        }
      }
      const memeMesure = dues.every(([k], i) => k === enPlus[i][0])
      // R-ECOLE-HEURES (L6222-24) : chaque jour d'école vaut une journée de
      // contrat (`journeeContrat`) ; les heures d'école de la semaine sont
      // une constante de la somme ; des fixes déjà au-delà restent tenables.
      const minutesEcole = ecole.size * s.minutesEcoleJour
      m.ajoute(
        minutes,
        '<=',
        Math.max(
          s.minutesHebdoMax - minutesEcole,
          fixesSemaine.reduce((t, c) => t + travail(c), 0),
        ),
      )

      if (s.reposConsecutifs) {
        const paires: string[] = []
        for (const j of jours.slice(0, -1)) {
          if (
            joursFixes.has(j) ||
            joursFixes.has(j + 1) ||
            ecole.has(j) ||
            ecole.has(j + 1)
          )
            continue
          const libre = m.bool()
          for (const d of [j, j + 1]) {
            const t = travaille.get(d)
            if (t)
              m.ajoute(
                [
                  [1, libre],
                  [1, t],
                ],
                '<=',
                1,
              )
          }
          paires.push(libre)
        }
        if (paires.length)
          m.ajoute(
            paires.map((v) => [1, v] as Terme),
            '>=',
            1,
          )
      }

      if (s.reposHebdoMin && siens.length) {
        reposHebdo(m, s, siens, xv, travaille, jours, fixes, reduire)
      }

      if (!s.reposConsecutifs) {
        const accoles: string[] = []
        for (const j of jours.slice(0, -1)) {
          if (ecole.has(j) || ecole.has(j + 1)) continue
          const libre = m.bool()
          for (const d of [j, j + 1]) {
            const t = travaille.get(d)
            if (t)
              m.ajoute(
                [
                  [1, libre],
                  [1, t],
                ],
                '<=',
                1,
              )
          }
          accoles.push(libre)
        }
        if (accoles.length) {
          const deux = m.bool()
          for (const a of accoles)
            m.ajoute(
              [
                [1, deux],
                [-1, a],
              ],
              '>=',
              0,
            )
          m.ajoute(
            [[1, deux], ...accoles.map((a) => [-1, a] as Terme)],
            '<=',
            0,
          )
          m.cout(-POIDS_REPOS_SEPARES, deux)
        }
      }

      for (const j of s.travailFixe) {
        const t = travaille.get(j)
        if (dans(j) && t) m.cout(-POIDS_JOUR_FIXE, t)
      }
      // Pas de prime de jour habituel pour un shift en dépannage (D13) : la
      // prime du jour est annulée sur ce shift (un shift par jour).
      for (const c of siens) {
        const j = jourDe(c)
        if (
          dans(j) &&
          s.travailFixe.has(j) &&
          role(s, c.poste) === 'occasionnel'
        )
          m.cout(POIDS_JOUR_FIXE, xv(c))
      }

      if (s.journeesCourtesMax !== null) {
        const courtes: string[] = []
        let courtesFixes = 0
        for (const c of siens) {
          if (!dans(jourDe(c))) continue
          const k2 = cle(s.id, c.id)
          if (travail(c) < s.journeePleine) {
            courtes.push(xv(c))
            if (imposees.has(k2)) courtesFixes++
          } else if (
            court.has(k2) &&
            travail(c) - c.raccourci < s.journeePleine
          ) {
            courtes.push(court.get(k2) as string)
            if (p.courtes.has(k2)) courtesFixes++
          }
        }
        m.ajoute(
          courtes.map((v) => [1, v] as Terme),
          '<=',
          Math.max(s.journeesCourtesMax, courtesFixes),
        )
      }

      // Coller au contrat : minutes - contrat = plus - moins.
      const moins = m.continu(0, 7 * 24 * 60)
      const plus = m.continu(0, 7 * 24 * 60)
      if (memeMesure) {
        m.ajoute(
          [...minutes, [-1, plus], [1, moins]],
          '=',
          s.minutesHebdoContrat,
        )
      } else {
        // Un remplaçant d'une autre durée : manque et surplus mesurés à
        // part, chacun avec ses minutes comptées. moins et plus ont un coût
        // positif : à l'optimum, moins = max(0, contrat - dues) et
        // plus = max(0, enPlus - contrat), comme l'égalité quand les deux
        // mesures coïncident. (`ecartTotalMinutes` lit donc ces minutes
        // comptées, pas les minutes réelles, sur une telle semaine.)
        m.ajoute([...nonNuls(dues), [1, moins]], '>=', s.minutesHebdoContrat)
        m.ajoute([...nonNuls(enPlus), [-1, plus]], '<=', s.minutesHebdoContrat)
      }
      ecarts.push([plus, moins])
      if (s.contratIndicatif) {
        m.cout(1, moins)
        m.cout(1, plus)
      } else {
        m.cout(POIDS_SOUS_CONTRAT, moins)
        m.cout(POIDS_SUR_CONTRAT, plus)
        sousContrat.push([s.id, moins, plus])
      }
    }
  }

  // Même personne sur deux fiches.
  const parPersonne = new Map<string, SalarieSolveur[]>()
  for (const s of p.salaries) {
    if (s.personne !== null)
      parPersonne.set(s.personne, [...(parPersonne.get(s.personne) ?? []), s])
  }
  for (const fiches of parPersonne.values()) {
    for (let i = 0; i < fiches.length; i++) {
      for (let k = i + 1; k < fiches.length; k++) {
        const s1 = fiches[i]
        const s2 = fiches[k]
        const repos = Math.max(s1.reposQuotidienMin, s2.reposQuotidienMin)
        for (const c1 of p.creneaux) {
          const v1 = x.get(cle(s1.id, c1.id))
          if (!v1) continue
          for (const c2 of p.creneaux) {
            const v2 = x.get(cle(s2.id, c2.id))
            if (!v2) continue
            if (
              imposees.has(cle(s1.id, c1.id)) &&
              imposees.has(cle(s2.id, c2.id))
            )
              continue
            const [premier, second] = c1.debut <= c2.debut ? [c1, c2] : [c2, c1]
            if (second.debut - premier.fin < repos)
              m.ajoute(
                [
                  [1, v1],
                  [1, v2],
                ],
                '<=',
                1,
              )
          }
        }
      }
    }
  }

  equite(m, p, x, travailleDe, nbSemaines)

  // Rebattre : refaire la même proposition coûte un peu.
  if (p.aEviter.size) {
    for (const [k, v] of x) {
      const [sId, cId] = scinder(k)
      const c = creneaux.get(cId)
      if (!c || imposees.has(k)) continue
      if (p.aEviter.has(cleAEviter(sId, jourDe(c), c.poste, c.typeShift))) {
        m.cout(POIDS_DEJA_PROPOSE, v)
      }
    }
  }
  // Petit bruit : à qualité égale, chaque graine donne une autre simulation.
  if (p.graine) {
    for (const v of x.values()) m.cout(Math.floor(hasard() * 4), v)
  }

  return {
    modele: m,
    x,
    court,
    manque,
    ecarts,
    trous,
    ouvertures,
    releves,
    minimums,
    sousContrat,
  }
}

/**
 * Équité (D15), au mieux, jamais obligatoire, entre personnes d'un même
 * groupe (`groupeEquite`, le poste principal). Rien de dur.
 *
 * Week-ends travaillés (samedi ou dimanche), 4 semaines d'avant comprises
 * (`equiteAvant`, `SEMAINES_EQUITE`) : chacun doit suivre sa part (ses heures dues sur celles
 * du groupe, un temps partiel en fait moins). Coût sur l'écart à cette part :
 *   total = Σ n_j ;  e_i >= n_i - part_i × total ;  e_i >= part_i × total - n_i
 * coût POIDS_EQUITE × e_i.
 *
 * Soirs et matins tôt : la même forme, mesurée sur l'hôtel de démo, rendait
 * la résolution dix fois plus longue (des milliers de plannings équivalents
 * à départager). Forme SIMPLIFIÉE, linéaire : chaque soir (matin tôt) coûte
 * POIDS_EQUITE × ce que la personne en a fait de plus que le moins chargé
 * du groupe sur les 4 semaines d'avant, chacun ramené à sa part comme pour
 * les week-ends (au plus `EQUITE_RATTRAPAGE_MAX`). La rotation se fait
 * d'une semaine à l'autre, pas dans la semaine.
 */
function equite(
  m: Modele,
  p: Probleme,
  x: Map<string, string>,
  travailleDe: Map<string, Map<number, string>>,
  nbSemaines: number,
): void {
  const groupes = new Map<string, SalarieSolveur[]>()
  for (const s of p.salaries) {
    if (s.groupeEquite === null) continue
    groupes.set(s.groupeEquite, [...(groupes.get(s.groupeEquite) ?? []), s])
  }
  for (const membres of groupes.values()) {
    if (membres.length < 2) continue
    weekendsEquitables(m, p, membres, travailleDe, nbSemaines)
    for (const [garde, avant] of [
      [(c: Creneau) => c.soir, (s: SalarieSolveur) => s.equiteAvant.soirs],
      [
        (c: Creneau) => c.matinTot,
        (s: SalarieSolveur) => s.equiteAvant.matinsTot,
      ],
    ] as const) {
      // Écart à sa part (heures dues sur celles du groupe) : sur 4 semaines,
      // un temps partiel en fait moins sans être en retard.
      const heures = membres.reduce(
        (t, s) => t + Math.max(0, s.minutesHebdoContrat),
        0,
      )
      const fait = membres.reduce((t, s) => t + avant(s), 0)
      const ecartPart = (s: SalarieSolveur) =>
        heures > 0
          ? avant(s) - (Math.max(0, s.minutesHebdoContrat) / heures) * fait
          : avant(s)
      const moins = Math.min(...membres.map(ecartPart))
      for (const s of membres) {
        const ecart =
          Math.round(
            Math.min(EQUITE_RATTRAPAGE_MAX, ecartPart(s) - moins) * 1000,
          ) / 1000
        if (ecart <= 0) continue
        for (const c of p.creneaux) {
          const v = x.get(cle(s.id, c.id))
          if (v && garde(c)) m.cout(POIDS_EQUITE * ecart, v)
        }
      }
    }
  }
}

function weekendsEquitables(
  m: Modele,
  p: Probleme,
  membres: SalarieSolveur[],
  travailleDe: Map<string, Map<number, string>>,
  nbSemaines: number,
): void {
  const heures = membres.reduce(
    (t, s) => t + Math.max(0, s.minutesHebdoContrat),
    0,
  )
  if (heures <= 0) return
  const n = membres.map((s) => {
    const termes: Terme[] = []
    const travaille = travailleDe.get(s.id) ?? new Map<number, string>()
    for (let k = 0; k < nbSemaines; k++) {
      const vars = [7 * k + 5, 7 * k + 6]
        .filter((j) => j < p.nbJours)
        .map((j) => travaille.get(j))
        .filter((v): v is string => !!v)
      if (vars.length === 1) termes.push([1, vars[0]])
      else if (vars.length === 2) {
        // we = samedi OU dimanche.
        const we = m.bool()
        for (const v of vars)
          m.ajoute(
            [
              [1, we],
              [-1, v],
            ],
            '>=',
            0,
          )
        m.ajoute([[1, we], ...vars.map((v) => [-1, v] as Terme)], '<=', 0)
        termes.push([1, we])
      }
    }
    return { termes, constante: s.equiteAvant.weekends }
  })
  if (n.every((e) => e.termes.length === 0)) return
  const total = m.continu(0, 1e6)
  m.ajoute(
    [
      [1, total],
      ...n.flatMap((e) => e.termes.map(([c, v]) => [-c, v] as Terme)),
    ],
    '=',
    n.reduce((t, e) => t + e.constante, 0),
  )
  membres.forEach((s, i) => {
    const part =
      Math.round((Math.max(0, s.minutesHebdoContrat) / heures) * 1e6) / 1e6
    const e = m.continu(0, 1e6)
    // e >= n_i - part × total
    m.ajoute(
      [[1, e], ...n[i].termes.map(([c, v]) => [-c, v] as Terme), [part, total]],
      '>=',
      n[i].constante,
    )
    // e >= part × total - n_i
    m.ajoute([[1, e], ...n[i].termes, [-part, total]], '>=', -n[i].constante)
    m.cout(POIDS_EQUITE, e)
  })
}

function reposHebdo(
  m: Modele,
  s: SalarieSolveur,
  siens: Creneau[],
  xv: (c: Creneau) => string,
  travaille: Map<number, string>,
  jours: number[],
  fixes: Creneau[],
  reduire: boolean,
): void {
  if (!reposHebdoPossible(s, fixes, jours)) return
  const minimum = s.reposHebdoMin
  const fixesDuJour = new Map<number, number>()
  for (const c of fixes)
    fixesDuJour.set(jourDe(c), (fixesDuJour.get(jourDe(c)) ?? 0) + 1)
  const auPlusUnLeJour = (j: number) => (fixesDuJour.get(j) ?? 0) <= 1
  const longs: string[] = []
  for (const d of jours) {
    if (s.joursHorsSite.has(d)) continue
    if (
      s.finServicePrecedent !== null &&
      s.debutServiceSuivant !== null &&
      s.debutServiceSuivant - s.finServicePrecedent < minimum
    ) {
      continue
    }
    const long = m.bool()
    const t = travaille.get(d)
    if (t)
      m.ajoute(
        [
          [1, long],
          [1, t],
        ],
        '<=',
        1,
      )
    const avant = siens.filter((c) => jourDe(c) < d)
    const apres = siens.filter((c) => jourDe(c) > d)
    for (const b of apres) {
      if (
        s.finServicePrecedent !== null &&
        b.debut - s.finServicePrecedent < minimum
      ) {
        m.ajoute(
          [
            [1, long],
            [1, xv(b)],
          ],
          '<=',
          1,
        )
      }
    }
    for (const a of avant) {
      if (
        s.debutServiceSuivant !== null &&
        s.debutServiceSuivant - a.fin < minimum
      ) {
        m.ajoute(
          [
            [1, long],
            [1, xv(a)],
          ],
          '<=',
          1,
        )
      }
    }
    // Triplets « long ⇒ pas a et b ». Même réduction que les paires du repos
    // quotidien (REDUCTION DES REMPLAÇANTS, `construire`) : pour un a, les b
    // d'un même jour J (au plus un fixe ce jour-là, donc Σ x(J) <= 1) en
    // conflit avec a forment UNE contrainte
    //   long + x_a + Σ_{b de J} x_b <= 2.
    // En entiers : long = x_a = 1 force chaque x_b à 0, comme les triplets ;
    // sinon le membre gauche vaut au plus 1 + Σ x(J) <= 2, déjà vrai. Chaque
    // triplet se déduit de l'agrégat. Réduit seulement si le groupe touche
    // un remplaçant : sans remplaçant, le texte LP est celui d'avant.
    for (const a of avant) {
      const parJourB = new Map<number, Creneau[]>()
      for (const b of apres) {
        if (b.debut - a.fin >= minimum) continue
        const jb = jourDe(b)
        if (
          reduire &&
          (a.place !== null || b.place !== null || a.accueil || b.accueil) &&
          auPlusUnLeJour(jb)
        ) {
          parJourB.set(jb, [...(parJourB.get(jb) ?? []), b])
          continue
        }
        m.ajoute(
          [
            [1, long],
            [1, xv(a)],
            [1, xv(b)],
          ],
          '<=',
          2,
        )
      }
      for (const liste of parJourB.values()) {
        m.ajoute(
          [[1, long], [1, xv(a)], ...liste.map((b) => [1, xv(b)] as Terme)],
          '<=',
          2,
        )
      }
    }
    longs.push(long)
  }
  if (longs.length)
    m.ajoute(
      longs.map((v) => [1, v] as Terme),
      '>=',
      1,
    )
}

/** La version courte du créneau couvre-t-elle encore [a, b] ? Elle
 * commence `raccourciDebut` plus tard et finit le reste du raccourci plus
 * tôt (même règle que `enVersionCourte` du vérificateur et `horaireDe`).
 * `raccourciDebut` à 0 : seule la fin compte, comme avant. */
function courteCouvre(c: Creneau, a: number, b: number): boolean {
  const auDebut = Math.min(Math.max(c.raccourciDebut, 0), c.raccourci)
  return c.debut + auDebut <= a && c.fin - (c.raccourci - auDebut) >= b
}

/**
 * Trous entre équipes (D10, contrat de la vague 1 §3), P2, jamais dur. MÊME
 * définition que l'oracle (`trousDuJour`, `cycles.ts`), réécrite ici sans
 * rien en reprendre :
 *   - postes regardés : ceux qui ont au moins un créneau du matin ou du soir
 *     (`presence.ts` ne les donne qu'à un poste coché ; la nuit vient des
 *     horaires de nuit et ne dit rien du poste, D15) ;
 *   - PLAGE d'un poste un jour : du plus petit début au plus grand fin des
 *     besoins `b…` (non posés, `place` nulle, effectif > 0) écrits ce jour ;
 *   - grille des quarts d'heure ABSOLUE en minutes réelles (0, 15, 30…),
 *     coupée aux bords de la plage ; un quart d'heure est tenu quand UNE
 *     présence autonome (pas un soutien) le couvre EN ENTIER ;
 *   - présences : tous les créneaux du poste (besoin, remplaçant, middle,
 *     shift posé), quel que soit le jour où ils sont écrits (la nuit de la
 *     veille couvre le petit matin), version courte appliquée (début
 *     retardé de `raccourciDebut`, fin avancée du reste, `courteCouvre`).
 * Une variable par suite de quarts d'heure où les mêmes créneaux couvrent :
 *   Σ x(autonomes qui couvrent) [- court(…) si la version courte ne couvre
 *   plus] + trou >= 1
 * coût `POIDS_TROU_QUART` par quart d'heure de la suite (au prorata d'un
 * quart coupé au bord de la plage).
 *
 * Ajouter une personne ne crée jamais de trou : la dérivation de P1
 * (`pireCoutRemplir`) n'a rien à compter.
 */
function trousEntreEquipes(
  m: Modele,
  p: Probleme,
  x: Map<string, string>,
  court: Map<string, string>,
  termesDe: (c: Creneau, quoi: 'autonomes' | 'courts') => Terme[],
): Array<Trou & { v: string }> {
  // Postes à part comptés (un besoin `b…` au matin ou au soir) ; un
  // candidat de l'accueil n'en fait pas un (ses trous sont plus bas).
  const postes = new Set(
    p.creneaux
      .filter(
        (c) =>
          !c.accueil &&
          (c.presence.includes('matin') || c.presence.includes('soir')),
      )
      .map((c) => c.poste),
  )
  const r: Array<Trou & { v: string }> = []
  for (const poste of postes) {
    const duPoste = p.creneaux.filter((c) => c.poste === poste)
    const parJour = new Map<number, Creneau[]>()
    for (const c of duPoste) {
      if (c.ferme || c.place !== null || c.effectif <= 0) continue
      parJour.set(jourDe(c), [...(parJour.get(jourDe(c)) ?? []), c])
    }
    for (const jour of [...parJour.keys()].sort((a, b) => a - b)) {
      const besoins = (parJour.get(jour) ?? []).filter((c) => c.fin > c.debut)
      if (!besoins.length) continue
      const debut = Math.min(...besoins.map((c) => c.debut))
      const fin = Math.max(...besoins.map((c) => c.fin))
      r.push(
        ...variablesTrous(
          m,
          p,
          x,
          court,
          termesDe,
          poste,
          jour,
          debut,
          fin,
          duPoste,
        ),
      )
    }
  }
  // Accueil entier (D15) : Réception et Club ensemble, du premier au dernier
  // moment demandé du jour, d'un veilleur à l'autre quand la nuit est
  // demandée (`plageAccueil`, la même définition que l'oracle).
  const candidats = p.creneaux.filter((c) => c.accueil)
  if (candidats.length) {
    const postesAccueil = new Set(candidats.map((c) => c.poste))
    const tenus = p.creneaux.filter((c) => postesAccueil.has(c.poste))
    const nuitDemandee = (j: number) =>
      p.consignes.some(
        (k) => k.jour === j && k.periode === 'nuit' && k.minimum > 0,
      )
    const jours = [...new Set(candidats.map(jourDe))].sort((a, b) => a - b)
    for (const jour of jours) {
      const demandes = new Set(
        p.consignes
          .filter((k) => k.jour === jour && k.minimum > 0)
          .map((k) => k.periode),
      )
      const plage = plageAccueil(
        candidats.filter((c) => jourDe(c) === jour),
        demandes,
        nuitDeLaVeille(candidats, jourDe, jour, nuitDemandee),
      )
      if (!plage) continue
      r.push(
        ...variablesTrous(
          m,
          p,
          x,
          court,
          termesDe,
          POSTE_ACCUEIL,
          jour,
          plage.debut,
          plage.fin,
          tenus,
        ),
      )
    }
  }
  return r
}

/**
 * Relève (demande utilisateur du 2026-11-01 : « du monde entre le shift du
 * matin et celui de l'après-midi pour transmettre les informations, une
 * demi-heure ») : chaque jour où le matin et le soir sont demandés, au moins
 * `p.releveMinutes` de suite où une personne autonome d'un horaire du MATIN
 * et une d'un horaire du SOIR (postes de l'accueil du jour) sont là
 * ensemble. Souple (`POIDS_RELEVE`). Même définition que l'oracle
 * (`relevesManquantes`, verificateur.ts).
 */
function relevesAccueil(
  m: Modele,
  p: Probleme,
  court: Map<string, string>,
  termesDe: (c: Creneau, quoi: 'autonomes' | 'courts') => Terme[],
): Array<{ jour: number; v: string }> {
  const duree = p.releveMinutes ?? 0
  if (duree <= 0) return []
  void court
  const k = Math.ceil(duree / QUART)
  const r: Array<{ jour: number; v: string }> = []
  for (const { jour, quarts, matins, soirs } of zonesReleve(p)) {
    const presents = (liste: Creneau[], a: number): Terme[] => {
      const t: Terme[] = []
      for (const c of liste) {
        if (c.debut > a || c.fin < a + QUART) continue
        t.push(...termesDe(c, 'autonomes'))
        if (!courteCouvre(c, a, a + QUART))
          t.push(...termesDe(c, 'courts').map(([n, v]) => [-n, v] as Terme))
      }
      return t
    }
    const y = quarts.map((a) => {
      const v = m.bool()
      for (const liste of [matins, soirs])
        m.ajoute(
          [[1, v], ...presents(liste, a).map(([n, w]) => [-n, w] as Terme)],
          '<=',
          0,
        )
      return v
    })
    const z: string[] = []
    for (let i = 0; i + k <= y.length; i++) {
      const v = m.bool()
      for (let t = 0; t < k; t++)
        m.ajoute(
          [
            [1, v],
            [-1, y[i + t]],
          ],
          '<=',
          0,
        )
      z.push(v)
    }
    const manque = m.continu(0, 1)
    m.ajoute([...z.map((v) => [1, v] as Terme), [1, manque]], '>=', 1)
    m.cout(POIDS_RELEVE, manque)
    r.push({ jour, v: manque })
  }
  return r
}

/** Les jours où une relève se cherche : matin et soir demandés, des
 * horaires du matin et du soir aux postes de l'accueil du jour qui se
 * chevauchent ; les quarts d'heure (grille absolue) du chevauchement
 * possible. Partagé avec l'oracle. */
export function zonesReleve(
  p: Pick<Probleme, 'creneaux' | 'consignes' | 'nbJours' | 'releveMinutes'>,
): Array<{
  jour: number
  quarts: number[]
  matins: Creneau[]
  soirs: Creneau[]
}> {
  const duree = p.releveMinutes ?? 0
  if (duree <= 0) return []
  const demande = (j: number, periode: 'matin' | 'soir') =>
    p.consignes.some(
      (c) => c.jour === j && c.periode === periode && c.minimum > 0,
    )
  const postesJour = new Set(
    p.creneaux
      .filter((c) => c.accueil && !c.presence.includes('nuit'))
      .map((c) => c.poste),
  )
  const pur = (c: Creneau, moment: 'matin' | 'soir') =>
    c.presence.length === 1 && c.presence[0] === moment
  const r: Array<{
    jour: number
    quarts: number[]
    matins: Creneau[]
    soirs: Creneau[]
  }> = []
  for (let jour = 0; jour < p.nbJours; jour++) {
    if (!demande(jour, 'matin') || !demande(jour, 'soir')) continue
    const duJour = p.creneaux.filter(
      (c) => postesJour.has(c.poste) && jourDe(c) === jour,
    )
    const matins = duJour.filter((c) => pur(c, 'matin'))
    const soirs = duJour.filter((c) => pur(c, 'soir'))
    if (!matins.length || !soirs.length) continue
    const debut =
      Math.ceil(Math.min(...soirs.map((c) => c.debut)) / QUART) * QUART
    const fin = Math.max(...matins.map((c) => c.fin))
    const quarts: number[] = []
    for (let a = debut; a + QUART <= fin; a += QUART) quarts.push(a)
    if (quarts.length * QUART < duree) continue
    r.push({ jour, quarts, matins, soirs })
  }
  return r
}

/** Les variables de trou d'une plage [debut, fin[ tenue par `tenus` (tous
 * les créneaux des postes concernés, quel que soit leur jour). */
function variablesTrous(
  m: Modele,
  p: Probleme,
  x: Map<string, string>,
  court: Map<string, string>,
  termesDe: (c: Creneau, quoi: 'autonomes' | 'courts') => Terme[],
  poste: string,
  jour: number,
  debut: number,
  fin: number,
  tenus: Creneau[],
  poidsQuart = POIDS_TROU_QUART,
): Array<Trou & { v: string }> {
  const r: Array<Trou & { v: string }> = []
  const presents = tenus.filter((c) => c.debut < fin && c.fin > debut)
  // Suites de quarts d'heure couverts par les mêmes créneaux (et la même
  // part en version courte) : une seule variable.
  const suites: Array<{ debut: number; fin: number; cle: string }> = []
  const premier = Math.floor(debut / QUART) * QUART
  for (let q = premier; q < fin; q += QUART) {
    const a = Math.max(q, debut)
    const b = Math.min(q + QUART, fin)
    const cle = presents
      .filter((c) => c.debut <= a && c.fin >= b)
      .map((c) => `${c.id}${courteCouvre(c, a, b) ? '' : '~'}`)
      .join('|')
    const derniere = suites.at(-1)
    if (derniere && derniere.cle === cle && derniere.fin === a) derniere.fin = b
    else suites.push({ debut: a, fin: b, cle })
  }
  for (const suite of suites) {
    const termes: Terme[] = []
    for (const c of presents) {
      if (c.debut > suite.debut || c.fin < suite.fin) continue
      const courte = courteCouvre(c, suite.debut, suite.fin)
      if (c.accueil) {
        // Les sommes du candidat (AGRÉGATS DE L'ACCUEIL) : ses autonomes,
        // moins ceux qui le font court quand la version courte ne couvre pas.
        termes.push(...termesDe(c, 'autonomes'))
        if (!courte)
          termes.push(
            ...termesDe(c, 'courts').map(([k, w]) => [-k, w] as Terme),
          )
        continue
      }
      for (const s of p.salaries) {
        const k = cle(s.id, c.id)
        const v = x.get(k)
        if (!v || role(s, c.poste) === 'soutien') continue
        termes.push([1, v])
        // Fait en version courte, il est parti avant la fin du quart.
        const vc = court.get(k)
        if (vc && !courte) termes.push([-1, vc])
      }
    }
    const v = m.continu(0, 1)
    m.ajoute([...termes, [1, v]], '>=', 1)
    m.cout(Math.round((poidsQuart * (suite.fin - suite.debut)) / QUART), v)
    r.push({ poste, jour, debut: suite.debut, fin: suite.fin, v })
  }
  return r
}

function scinder(k: string): [string, string] {
  const i = k.indexOf('|')
  return [k.slice(0, i), k.slice(i + 1)]
}

/** Une résolution, avec ce qu'il faut pour décider s'il faut la seconde. */
type Resolution = Omit<ResultatGeneration, 'etapes'> & {
  /** Personnes qui manquent au chiffre des moments que des remplaçants
   * peuvent tenir (un remplaçant y compte), toutes ensemble : seul ce
   * manque peut décider d'un second temps (les candidats de l'accueil
   * couvrent déjà tous ses horaires). */
  manqueMinimum: number
  /** Fiches à contrat non indicatif à qui il manque des heures dues. */
  sousContrat: Set<string>
  /** Fiches à contrat non indicatif au-dessus de leur contrat. */
  auDessusContrat: Set<string>
}

const echec = (): Resolution => ({
  statut: 'inconnu',
  affectations: [],
  manques: [],
  ecartTotalMinutes: null,
  trous: [],
  ouvertures: [],
  relevesManquantes: [],
  manqueMinimum: 0,
  sousContrat: new Set(),
  auDessusContrat: new Set(),
})

/** Plus petit temps laissé à HiGHS (secondes). */
const TEMPS_MIN = 0.05

/** Résout UNE fois le problème `p` avec HiGHS, jusqu'à `echeance` (en ms,
 * horloge `Date.now`) : le temps laissé à HiGHS est compté APRÈS la
 * construction du modèle, et borné par `plafond` secondes s'il est donné. */
function resoudreUneFois(
  p: Probleme,
  highs: Highs,
  echeance: number,
  plafond = Number.POSITIVE_INFINITY,
  complet?: Probleme,
): Resolution {
  const {
    modele,
    x,
    court,
    manque,
    ecarts,
    trous,
    ouvertures,
    releves,
    minimums,
    sousContrat,
  } = construire(p)
  if (modele.impossible) return echec()
  // Moments où un remplaçant compte (`aTenir`) : ceux du problème COMPLET,
  // pour que le temps 1 (sans remplaçants) les reconnaisse aussi.
  const remplacables = new Set(
    (complet ?? p).consignes.flatMap((k, i) =>
      (complet ?? p).creneaux.some(
        (c) =>
          c.place !== null &&
          c.presence.includes(k.periode) &&
          jourDe(c) === k.jour,
      )
        ? [i]
        : [],
    ),
  )
  // Sans variable ni place : aucun besoin, donc aucune plage, aucun trou.
  // Un moment de l'accueil demandé, ou une plage de l'accueil, se résout
  // même sans personne (2026-11-01) : l'accueil vide est un manque et un trou.
  if (
    x.size === 0 &&
    manque.size === 0 &&
    minimums.length === 0 &&
    trous.length === 0 &&
    ouvertures.length === 0
  ) {
    return {
      statut: 'optimal',
      affectations: [],
      manques: [],
      ecartTotalMinutes: 0,
      trous: [],
      ouvertures: [],
      // Personne ne peut venir : chaque relève cherchée manque.
      relevesManquantes: releves.map(({ jour }) => jour),
      manqueMinimum: 0,
      sousContrat: new Set(),
      auDessusContrat: new Set(),
    }
  }
  const tempsMax = Math.max(
    TEMPS_MIN,
    Math.min(plafond, (echeance - Date.now()) / 1000),
  )
  const solution = highs.solve(modele.lp(), {
    time_limit: tempsMax,
    mip_rel_gap: 0,
    mip_abs_gap: 0.5,
    random_seed: Math.abs(p.graine) % 2_147_483_647,
    output_flag: false,
  })
  const valeur = (v: string) =>
    Math.round(
      (solution.Columns[v] as { Primal?: number } | undefined)?.Primal ?? 0,
    )
  // Au temps limite SANS solution, HiGHS rend des colonnes à zéro et un
  // objectif infini : ce n'est pas une solution (un planning vide passerait
  // pour réalisable, sans manque).
  const aSolution =
    Object.keys(solution.Columns).length > 0 &&
    Number.isFinite(solution.ObjectiveValue)
  const statut = !aSolution
    ? 'inconnu'
    : solution.Status === 'Optimal'
      ? 'optimal'
      : /time limit|iteration limit|interrupt/i.test(solution.Status)
        ? 'realisable'
        : 'inconnu'
  if (statut === 'inconnu') return echec()
  const affectations: AffectationSolveur[] = []
  for (const [k, v] of x) {
    if (valeur(v) !== 1) continue
    const [salarieId, creneauId] = scinder(k)
    const vc = court.get(k)
    affectations.push({
      salarieId,
      creneauId,
      court: vc ? valeur(vc) === 1 : false,
    })
  }
  const manques: Manque[] = []
  for (const [creneauId, v] of manque) {
    const n = valeur(v)
    if (n) manques.push({ creneauId, manquant: n })
  }
  // Trous restés, morceaux qui se touchent réunis.
  const reunir = (liste: Array<Trou & { v: string }>): Trou[] => {
    const r: Trou[] = []
    for (const { v, ...t } of liste) {
      if (valeur(v) !== 1) continue
      const dernier = r.at(-1)
      if (
        dernier &&
        dernier.poste === t.poste &&
        dernier.jour === t.jour &&
        dernier.fin === t.debut
      )
        dernier.fin = t.fin
      else r.push(t)
    }
    return r
  }
  const restes = reunir(trous)
  return {
    statut,
    affectations,
    manques,
    ecartTotalMinutes: ecarts.reduce(
      (t, [plus, moins]) => t + valeur(plus) + valeur(moins),
      0,
    ),
    trous: restes,
    ouvertures: reunir(ouvertures),
    relevesManquantes: releves
      .filter(({ v }) => valeur(v) > 0.5)
      .map(({ jour }) => jour),
    manqueMinimum: minimums
      .filter(({ consigne }) => remplacables.has(consigne))
      .reduce((t, { v }) => t + valeur(v), 0),
    sousContrat: new Set(
      sousContrat.filter(([, v]) => valeur(v) > 0).map(([id]) => id),
    ),
    auDessusContrat: new Set(
      sousContrat.filter(([, , v]) => valeur(v) > 0).map(([id]) => id),
    ),
  }
}

/** Ce qui reste à tenir et qu'un remplaçant pourrait tenir : places
 * vides, manques aux moments où un remplaçant compte, minutes de trou d'un
 * poste à part (les trous de l'accueil entier ne se ferment pas par un
 * remplaçant : l'accueil n'en a pas). */
function aTenir(r: Resolution): [number, number] {
  return [
    r.manques.reduce((t, m) => t + m.manquant, 0) + r.manqueMinimum,
    r.trous
      .filter((k) => k.poste !== POSTE_ACCUEIL)
      .reduce((t, k) => t + k.fin - k.debut, 0),
  ]
}

const rendre = (
  { manqueMinimum: _, sousContrat: _s, auDessusContrat: _a, ...r }: Resolution,
  etapes: 1 | 2,
): ResultatGeneration => ({ ...r, etapes })

/*
 * CALCUL EN DEUX TEMPS (D5, D13 : « jouer avec les horaires » seulement quand
 * l'horaire imposé ne suffit pas). Les créneaux remplaçants (`place !== null`)
 * multiplient les variables (~385 par semaine réelle) et le temps de calcul
 * (mesuré sur 8 semaines : 3,3 s en moyenne contre 0,36 s sans), alors que
 * l'horaire exact suffit presque toujours.
 *
 * Temps 1 : le même problème SANS les remplaçants non imposés (un shift
 * posé rattaché par cycle reste : c'est un fait), en au plus
 * `PART_TEMPS_1` du budget. Puis :
 *   - pas d'optimum prouvé (temps limite, ou rien trouvé), une place
 *     nécessaire vide, un manque à un minimum de consigne ou un trou entre
 *     équipes : temps 2 sur le problème COMPLET ;
 *   - sinon, temps 2 avec les remplaçants qui peuvent servir (rien d'autre
 *     n'est ajouté) :
 *       · ceux des places tenues en DÉPANNAGE (D13 : un titulaire sur un
 *         autre horaire du cycle passe devant un dépannage à l'horaire imposé).
 *         Mesuré : sur les vraies semaines, ~8 places par semaine sont
 *         tenues par une adjointe ou un superviseur, et le problème complet
 *         n'y pose jamais de remplaçant ; leurs ~50 remplaçants (sur ~385)
 *         suffisent à en juger ;
 *       · ceux des JOURS où une personne à contrat (non indicatif) à qui il
 *         manque des heures dues est libre et pourrait tenir un créneau,
 *         et où une place à remplaçants est tenue par quelqu'un qui peut la
 *         céder sans perdre d'heures dues (extra, ou au-dessus de son
 *         contrat) : `remplacantsPourHeures`. P3 passe devant P4 : 7 h dues
 *         valent 168 000, un remplaçant 2 000. Le jour entier, pour la
 *         chaîne d'un cran : elle prend le remplaçant, OU une autre passe
 *         sur le remplaçant pour lui laisser l'horaire imposé ;
 *   - si aucun des deux, la solution du temps 1 est rendue.
 *
 * Pourquoi c'est sûr. La solution du temps 1 est une solution du problème
 * complet (remplaçants à 0 : ils n'ont aucune contrainte propre). Un
 * remplaçant coûte toujours POIDS_REMPLACANT (2 000) de plus, ne rapporte
 * jamais plus d'heures dues que le besoin ni n'épargne d'heures en plus
 * (`minutesDues`, `minutesEnPlus`), et ne sert qu'à tenir une place, un
 * minimum, fermer un trou (P1, P2), donner des heures dues (P3) ou éviter
 * un dépannage (P4 : part fixe au-dessus du remplaçant). Les cinq sont
 * regardés ci-dessus. Ce que le problème complet peut encore gagner, contre
 * au moins 2 000 par remplaçant :
 *   - P3 par une chaîne d'un jour à l'autre (une personne passe sur un
 *     remplaçant un AUTRE jour que celui où il manque des heures à
 *     l'autre), ou à travers quelqu'un qui est pile à son contrat, ou pour
 *     retirer des heures en plus ou un 6e jour à quelqu'un ;
 *   - P2 maximum d'une consigne (un horaire voisin d'une autre période) ;
 *   - P5 confort (repos accolés, équité, jours habituels), plafonné par
 *     shift sous la part fixe d'un dépannage, donc rarement plus de 2 000.
 * Dans ces cas l'optimum du problème complet PEUT différer de celui rendu :
 * « l'horaire exact tant qu'il suffit » ; chaque place reste tenue avec le
 * code demandé, rien n'est vide ni hors la loi, et aucune heure due n'est
 * perdue qu'un remplaçant du même jour aurait donnée.
 * Les poids dérivés (`coutPlaceVideGroupe`, `coutManqueMinimum`, maximum
 * des consignes) sont calculés sur les créneaux de CHAQUE problème : les
 * deux premiers ne jouent qu'en cas de manque (alors problème complet) ; le
 * maximum garde son rang P2.
 *
 * Budget : `tempsMaxSecondes` couvre les deux temps, construction des
 * modèles comprise (le temps laissé à HiGHS est compté après elle). Le
 * temps 1 n'en prend au plus que `PART_TEMPS_1` : le reste est gardé pour
 * le temps 2. Si le temps 2 n'a plus de temps ou ne trouve rien, le temps 1
 * est rendu ; une solution n'est jamais écartée pour un « rien trouvé »
 * (statut `inconnu`). Entre deux solutions, la meilleure connue : moins de
 * personnes manquantes, puis moins de minutes de trou ; à égalité, le
 * temps 2 (son problème contient celui du temps 1).
 */
/** Part du budget au plus laissée au temps 1 (le reste : au temps 2). */
export const PART_TEMPS_1 = 0.5

/** Résout le problème avec HiGHS (chargé par l'appelant : worker ou test). */
export function generer(p: Probleme, highs: Highs): ResultatGeneration {
  const echeance = Date.now() + p.tempsMaxSecondes * 1000
  const imposes = new Set([...p.imposees].map((k) => scinder(k)[1]))
  const garde = (places: ReadonlySet<string>, ids: ReadonlySet<string>) =>
    p.creneaux.filter(
      (c) =>
        c.place === null ||
        imposes.has(c.id) ||
        places.has(c.place) ||
        ids.has(c.id),
    )
  const creneaux1 = garde(new Set(), new Set())
  if (creneaux1.length === p.creneaux.length) {
    return rendre(resoudreUneFois(p, highs, echeance), 1)
  }
  const r1 = resoudreUneFois(
    { ...p, creneaux: creneaux1 },
    highs,
    echeance,
    p.tempsMaxSecondes * PART_TEMPS_1,
    p,
  )
  let creneaux2 = p.creneaux
  if (r1.statut === 'optimal') {
    const [manquants, trou] = aTenir(r1)
    if (manquants === 0 && trou === 0) {
      const places = placesEnDepannage(p, r1)
      const pourHeures = remplacantsPourHeures(p, r1)
      if (places.size === 0 && pourHeures.size === 0) return rendre(r1, 1)
      creneaux2 = garde(places, pourHeures)
    }
  }
  if ((echeance - Date.now()) / 1000 <= TEMPS_MIN) return rendre(r1, 1)
  const r2 = resoudreUneFois(
    { ...p, creneaux: creneaux2 },
    highs,
    echeance,
    Number.POSITIVE_INFINITY,
    p,
  )
  if (r2.statut === 'inconnu') return rendre(r1, 1)
  if (r2.statut === 'realisable' && r1.statut !== 'inconnu') {
    const [m1, t1] = aTenir(r1)
    const [m2, t2] = aTenir(r2)
    if (m1 < m2 || (m1 === m2 && t1 < t2)) return rendre(r1, 1)
  }
  return rendre(r2, 2)
}

/** Les remplaçants (ids de créneaux) des JOURS où des heures dues peuvent
 * être gagnées : une personne à contrat non indicatif à qui le temps 1
 * laisse un manque d'heures dues y est libre et pourrait y tenir un créneau
 * (remplaçant ou non), ET une place qui a des remplaçants y est tenue (hors
 * shift posé) par quelqu'un qui peut la céder sans perdre d'heures dues :
 * contrat indicatif (extra) ou au-dessus de son contrat. Sans ce second
 * point, un manque structurel (plus d'heures dues que de shifts) relancerait
 * le temps 2 pour rien : les heures ne feraient que changer de mains. */
function remplacantsPourHeures(p: Probleme, r: Resolution): Set<string> {
  const ids = new Set<string>()
  if (r.sousContrat.size === 0) return ids
  const creneaux = new Map(p.creneaux.map((c) => [c.id, c]))
  const salaries = new Map(p.salaries.map((s) => [s.id, s]))
  const avecRemplacants = new Set<string>()
  for (const c of p.creneaux) if (c.place !== null) avecRemplacants.add(c.place)
  const occupes = new Set<string>()
  const cedables = new Set<number>()
  for (const a of r.affectations) {
    const c = creneaux.get(a.creneauId)
    const h = salaries.get(a.salarieId)
    if (!c || !h) continue
    occupes.add(`${a.salarieId}|${jourDe(c)}`)
    if (
      avecRemplacants.has(c.place ?? c.id) &&
      !p.imposees.has(cle(a.salarieId, a.creneauId)) &&
      (h.contratIndicatif || r.auDessusContrat.has(h.id))
    )
      cedables.add(jourDe(c))
  }
  const jours = new Set<number>()
  for (const s of p.salaries) {
    if (!r.sousContrat.has(s.id)) continue
    for (const c of p.creneaux) {
      const j = jourDe(c)
      if (!cedables.has(j) || jours.has(j) || c.ferme) continue
      if (!occupes.has(`${s.id}|${j}`) && compatible(s, c)) jours.add(j)
    }
  }
  for (const c of p.creneaux)
    if (c.place !== null && jours.has(jourDe(c))) ids.add(c.id)
  return ids
}

/** Les places qui ont des remplaçants et que le temps 1 fait tenir en
 * dépannage (hors shift posé). */
function placesEnDepannage(p: Probleme, r: Resolution): Set<string> {
  const avecRemplacants = new Set<string>()
  for (const c of p.creneaux) if (c.place !== null) avecRemplacants.add(c.place)
  const creneaux = new Map(p.creneaux.map((c) => [c.id, c]))
  const salaries = new Map(p.salaries.map((s) => [s.id, s]))
  const places = new Set<string>()
  for (const a of r.affectations) {
    const c = creneaux.get(a.creneauId)
    const s = salaries.get(a.salarieId)
    if (!c || !s || p.imposees.has(cle(a.salarieId, a.creneauId))) continue
    const place = c.place ?? c.id
    if (avecRemplacants.has(place) && role(s, c.poste) === 'occasionnel')
      places.add(place)
  }
  return places
}
