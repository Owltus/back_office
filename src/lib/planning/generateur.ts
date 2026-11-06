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
  posteDeZone,
  zoneDuPosteTrou,
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
  rangImportance,
  role,
  toucheLaNuit,
  journeeDe,
  travail,
} from '#/lib/planning/modele.ts'
import {
  jourIsoleDe,
  rythmeHumain,
  apresContrat,
} from '#/lib/planning/regles.ts'
import {
  jourVeilleWeekend,
  REGLES_PAR_DEFAUT,
  repartit,
} from '#/lib/planning/reglesEtablissement.ts'
import type { RegleEtablissement } from '#/lib/planning/reglesEtablissement.ts'
import {
  deJourAuTableau,
  estNuit,
  MOMENTS_HOTEL,
  momentsDe,
  momentsDeJour,
  pairesDeJour,
  premierMoment,
  rangMoment,
} from '#/lib/planning/moment.ts'
import type { Moments } from '#/lib/planning/moment.ts'
import { vuesZones, zonesDesPostes } from '#/lib/planning/zones.ts'
import type {
  AffectationSolveur,
  Creneau,
  Manque,
  Probleme,
  Resultat,
  SalarieSolveur,
  SuivantePersonne,
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
 *       Entre places, l'IMPORTANCE du poste et le besoin souhaité décident
 *       (`paliersPlaces`, D11 du 2026-11-05, oui / non) : souhaité <
 *       poste non indispensable < poste indispensable.
 *   P2  un trou (entre deux équipes d'un poste à part compté, ou sur
 *       l'accueil entier, D15) : `POIDS_TROU_QUART` par quart d'heure (D10).
 *   P3  les contrats : heures dues (`POIDS_SOUS_CONTRAT`) > une personne en
 *       plus du chiffre d'un moment (`coutSurplus`, D8, plafonné sous les
 *       heures dues) > jour manquant au rythme de 5 jours > jour férié
 *       rattrapé en attente (`POIDS_JFR_EN_ATTENTE`, R-FERIE-RATTRAPE) >
 *       6e jour > heures au-delà (`POIDS_SUR_CONTRAT`).
 *   P4  le métier d'abord (D13), à heures de contrat égales (un
 *       remplaçant ne compte jamais plus d'heures dues ni moins d'heures en
 *       plus que son besoin, `minutesDues`, `minutesEnPlus`) :
 *         titulaire à l'horaire imposé              0
 *         ou à sa VERSION ÉTOILE                    0 (ses vraies minutes)
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
 * JOURNÉE ÉTOILE (décisions utilisateur du 2026-11-02, D3 à D5). Plus de
 * raccourci ni de variable « court » : un contrat de plus de 35 h fait sa
 * journée de 7 h sur un horaire qui EXISTE. Un besoin d'un horaire de 8 h a,
 * pour chaque version étoile permise au poste (`versionsEtoile`,
 * `etoile.ts`), un créneau `r…` marqué `etoile` : il tient la place comme
 * l'horaire demandé, sans `POIDS_REMPLACANT`, ses VRAIES minutes face au
 * contrat (`minutesDues`, `minutesEnPlus`), et il est là dès le premier temps
 * du calcul (voir CALCUL EN DEUX TEMPS). Trous, ouverture, relève et plage
 * d'un veilleur à l'autre se lisent sur ses vraies heures, comme tout
 * créneau. Une journée étoile coûte ce qu'elle retire au contrat : un 35 h ne
 * la prend que pour une autre raison (place, trou, plafond) ; un 39 h la
 * prend une fois (4 × 8 h + 7 h). Règles dures : au plus `journeesCourtesMax`
 * shifts de moins de 8 h par semaine (39 h : un) ; étoile FIXÉE dans la
 * fiche = ce jour-là, pas d'horaire de 8 h (`compatible`). Une version étoile
 * n'est jamais proposée à un contrat indicatif (forfait jours, extra) : ses
 * heures ne se comptent pas, un horaire plus court lui coûterait moins pour
 * rien (`compatible`).
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
 *   + POIDS_JOUR_ISOLE                                          un jour de travail isolé
 *   + 7 × POIDS_JOUR_AFFILE                                     plus de 6 jours d'affilée
 *   + 6 × POIDS_JOUR_AFFILE_CONSEILLE                           plus de 5 jours d'affilée
 *   + POIDS_MINEUR_FERIE                                        un mineur un jour férié
 *   + `coutExtra` (si `c` est un candidat de l'accueil)          un extra
 *   + le plus cher des surplus                                  une personne en plus d'un autre moment
 *   + EQUITE_MAX_PAR_SHIFT                                      équité, au pire
 *   + POIDS_ARRIVEE_MATIN_MINUTE × ARRIVEE_MATIN_MAX            arriver après l'ouverture
 *     (un matin de l'accueil)
 *   + POIDS_DEJA_PROPOSE + BRUIT_MAX                            rebattre, hasard
 *   + `pireJfr` (s'il y a un JFR à placer dans la semaine)       le JFR perdu ce jour-là,
 *                                                               sa préférence, et les heures
 *                                                               dues qu'il retirait
 *                                                               (compté avec le surplus)
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
/** Deux jours de repos qui se suivent. DUR pour le calcul depuis le
 * 2026-11-04 (décision d'une responsable : « 90 % du temps, les hôteliers
 * doivent avoir deux jours de repos consécutifs ; fais au mieux pour les
 * personnes présentes, et si je dois avoir des trous dans mes besoins, tu
 * me dis ») : chaque semaine complète a une paire de jours libres, sauf si
 * les shifts déjà posés et l'école n'en laissent aucune (voir la règle dans
 * `generer`). Une place peut donc rester vide pour elle, et l'écran le dit
 * (REPOS-SEPARES bloque, `raisonCommune`). Ce poids ne sert plus qu'au pire
 * coût d'une place (`pireCoutRemplir`, `partMoraleExtra`), où il reste une
 * borne prudente. Avant : 8 000 au confort, sacrifié dès qu'une heure, une
 * passation ou une fatigue était en jeu. */
export const POIDS_REPOS_SEPARES = 8_000
/** Un jour de travail seul entre deux jours sans travail (congé, repos,
 * absence ; demande utilisateur du 2026-11-02 : « je ne vais pas prendre 4
 * jours de congé, enchaîner avec 1 jour de travail et reprendre avec mes
 * repos »). L'école, un jour hors contrat et un jour voisin inconnu
 * comptent comme du travail : continuité avec la semaine d'à côté. DUR
 * pour le calcul depuis le 2026-11-04 (décision d'une responsable : « tu ne
 * peux pas donner des jours et redonner des jours ensuite, ce n'est ni joli
 * ni une bonne pratique »), pour un contrat de 35 h et plus
 * (`rythmeHumain`), sauf un jour posé ; ce poids ne sert plus qu'aux autres
 * et au pire coût d'une place. */
export const POIDS_JOUR_ISOLE = 4_000
/** Le dimanche d'avant travaillé, le samedi d'avant libre : sans le lundi,
 * ce dimanche resterait seul entre deux repos (2026-11-04, banc de
 * décembre : la semaine d'avant comptait sur un lundi que la suivante n'a
 * pas donné). Il ne peut plus changer : le lundi est poussé, au-dessus de
 * la fatigue et d'une heure en plus, sous les places. SOUPLE : un lundi
 * impossible (congé, repos de 11 h) ne rend jamais le modèle impossible. */
export const POIDS_DIMANCHE_SEUL = 50_000
/** LES HEURES AVANT LA FATIGUE (décision utilisateur du 2026-11-04, qui
 * renverse celle du 2026-11-03 : « le respect du nombre d'heures est très
 * important ; si on ne le respecte pas, on les paye quand même alors qu'il
 * ne les a pas faites »). Trois règles de repos : moins de 12 h entre deux
 * services (règle 3), une reprise de jour moins de 2 jours après des nuits
 * (règle 7), aucun week-end libre sur 4 semaines (règle 4). Leur poids est
 * SOUS les heures dues d'une heure de travail (`POIDS_SOUS_CONTRAT` × 60 =
 * 24 000, figé par un test) : le calcul ne retire jamais un shift pour
 * elles. Limite assumée : 20 000 valent 50 minutes dues ; pour éviter UNE
 * de ces règles, un horaire plus court de 45 minutes au plus peut être
 * préféré (deux règles : 1 h 40). À heures égales, il les évite avant le
 * 6e jour, la relève, les jours d'affilée conseillés, les repos accolés et
 * les heures en plus (jusqu'à 6 h 40) ; le rythme de 5 jours, une personne
 * en plus, l'ouverture, la passation et un mineur un jour férié passent
 * devant. Les places nécessaires
 * passent toujours devant (`coutPlaceVide` relit ces poids). Plus de 6
 * jours d'affilée reste DUR pour le calcul (PRD règle 2 : « au-delà,
 * seulement à la main »). */
export const POIDS_FATIGUE = 20_000
/** Par jour au-delà de 6 d'affilée, sur chaque fenêtre de 7 jours qui
 * traverse une semaine voisine (`JOURS_AFFILES_MAX`). DUR pour le calcul
 * depuis le 2026-11-03 ; ce poids ne sert plus qu'au pire coût d'une place
 * (`pireMoral`, `pireCoutRemplir`). Une semaine seule est déjà bornée à
 * 6 jours (R-SIX-JOURS-MAX). */
export const POIDS_JOUR_AFFILE = 12_000
/** Par jour au-delà de 5 d'affilée, sur chaque fenêtre de 6 jours qui
 * traverse une semaine voisine (`JOURS_AFFILES_CONSEILLES`, demande
 * utilisateur du 2026-11-02). DUR pour le calcul depuis le 2026-11-04
 * (décision d'une responsable : « privilégie vraiment les semaines de 5
 * jours, plus humain »), pour un contrat de 35 h et plus
 * (`rythmeHumain`) : ce poids ne sert plus qu'aux autres et au pire coût
 * d'une place. */
export const POIDS_JOUR_AFFILE_CONSEILLE = 10_000
/** Un mineur placé un jour férié (permis en hôtellerie par dérogation, à
 * éviter : décision utilisateur du 2026-11-02). Au-dessus du confort et du
 * 6e jour, sous les contrats et les places. */
export const POIDS_MINEUR_FERIE = 30_000
/** Un jour de travail en moins que le rythme du contrat (5 jours pour un
 * contrat de 35 h ou plus, école et absences décomptées ; demande
 * utilisateur du 2026-11-01 : « 39 h en 4 jours de 10 h », c'est non).
 * Au-dessus d'une personne en plus à l'accueil (le surplus d'un shift,
 * plafonné, reste en dessous), sous les heures dues et les places. */
export const POIDS_JOUR_MANQUANT = 80_000
/** R-FERIE-RATTRAPE : un jour férié travaillé à rattraper que la semaine ne
 * place pas (aucun JFR posé). Au-dessus du 6e jour et du confort, sous les
 * heures dues, les places et le jour manquant : le rattrapage ne laisse
 * jamais une place vide ni un contrat sans ses heures. */
export const POIDS_JFR_EN_ATTENTE = 20_000
/** R-FERIE-RATTRAPE : le JFR collé à un jour sans travail (repos, congé),
 * pour une coupure plus longue. Confort, sous les repos accolés. */
export const POIDS_JFR_COLLE = 1_000
/** P1 : ce que peut coûter, au pire, l'ajout d'une personne qui avait un JFR
 * ce jour-là et le perd : le rattrapage en attente, sa préférence, et les
 * heures dues que le JFR retirait (`reduction`, au plus `reductionMax`).
 * 0 sans JFR dans la semaine : les places vides gardent leur prix. */
export function pireJfr(reductionMax: number): number {
  return reductionMax > 0
    ? POIDS_JFR_EN_ATTENTE + POIDS_JFR_COLLE + POIDS_SOUS_CONTRAT * reductionMax
    : 0
}
/** Horizon glissant (2026-11-04) : une personne qui manque un jour de la
 * semaine SUIVANTE esquissée (une place qui y resterait vide). Au-dessus du
 * week-end libre et des heures d'un shift de 12 h (les places passent avant
 * les heures et la fatigue), sous les places de la semaine écrite
 * (`pireHorizon` entre dans leur coût). Valeur d'avant le 2026-11-04 : la
 * fatigue a baissé, pas les places. */
export const POIDS_PREVISION_MANQUE = 300_000
/** P1 : le pire que coûte, dans l'esquisse de la semaine suivante, un
 * shift ajouté à la semaine écrite. Il peut la priver d'un jour (jours
 * d'affilée) : un jour attendu en moins et UN manque (un jour de présence
 * ne tient qu'une place, tous groupes confondus) ; et faire perdre le
 * week-end libre couplé (règle 4). Sans esquisse : 0, le modèle d'avant. */
export function pireHorizon(suivante: Probleme['suivante']): number {
  if (!suivante) return 0
  return (
    POIDS_WEEKEND_LIBRE +
    POIDS_JOUR_MANQUANT +
    (suivante.groupes.length ? POIDS_PREVISION_MANQUE : 0)
  )
}
/** Ouverture d'un poste de l'accueil (07:00 Réception et Club, réglage du
 * poste) : un quart d'heure sans personne sur ce poste dans la première
 * heure. « Obligatoire » (2026-11-01) : au-dessus des contrats d'un jour de
 * travail. */
export const POIDS_OUVERTURE_QUART = 40_000
/** PASSATION AVEC LE VEILLEUR (décision utilisateur du 2026-11-04 : « une
 * passation pour le soir, c'est très important ; le shift finit à 23 h pour
 * le soir et celui de la nuit commence à 23 h ; il faut qu'elle soit
 * nickel »). Par nuit de l'accueil et par côté : le soir, le veilleur
 * arrive avant que le dernier du soir parte (à la minute près : une fin à
 * 23:00 pour une nuit à 23:00 suffit) ; le matin, le premier du matin
 * arrive avant que le veilleur parte. Au-dessus des heures dues d'un shift
 * de 12 h (288 000, figé par un test) : on ne laisse pas un veilleur seul
 * pour donner des heures ; sous les places (un veilleur ajouté peut en
 * manquer deux, `pireMoral`). Même définition que l'oracle
 * (`transmissions`, verificateur.ts). */
export const POIDS_PASSATION = 300_000
/** Pas de relève (l'équipe du matin et celle de l'après-midi jamais
 * ensemble le temps réglé) : au-dessus du 6e jour et des repos accolés,
 * sous les contrats. */
export const POIDS_RELEVE = 16_000
/** Travailler un jour habituel (semaine type « travail »). */
export const POIDS_JOUR_FIXE = 2_000
/** L'équipe du matin arrive à l'ouverture (2026-11-05). Mesuré sur les 18
 * semaines faites à la main (29/06 au 26/10) : à l'accueil, presque tous
 * les matins commencent à 07:00 ; le calcul en faisait arriver une partie à
 * 07:30 ou 08:00 (même journée de 7 h ou 8 h), poussé par l'équité des
 * matins tôt, et laissait une personne seule à l'ouverture. Par minute
 * d'arrivée après l'ouverture du poste ce jour-là, un horaire du matin d'un
 * poste de l'accueil, plafonné à `ARRIVEE_MATIN_MAX` minutes. Linéaire, sur
 * chaque affectation : aucune variable de plus. Confort (P5) attaché au
 * CRÉNEAU, le même pour qui le prend : il ne départage pas un titulaire et
 * un dépannage, d'où son absence de `PART_FIXE_DEPANNAGE` (il reste sous
 * cette part fixe, test de palier) ; à 60 minutes, plus que l'écart d'équité le plus
 * grand d'un shift (`EQUITE_RATTRAPAGE_MAX` × `POIDS_EQUITE`) : l'équité ne
 * départage plus que des arrivées à la même heure. */
export const POIDS_ARRIVEE_MATIN_MINUTE = 12
export const ARRIVEE_MATIN_MAX = 120
/** Personne seule à l'accueil (2026-11-05), par quart d'heure de la journée
 * de l'accueil (la plage des trous) où une seule personne autonome est là.
 * Mesuré sur les 18 semaines faites à la main : quand l'équipe ne suffit
 * pas pour les chiffres du tableau (3 le matin, 2 le soir), le calcul
 * mettait le manque au hasard, parfois tout sur le soir (« 3 et 1 » plutôt
 * que « 2 et 2 ») : de 6 à 30 soirs avec une personne seule à 21 h selon la
 * graine. Bien sous une place vide et sous une heure due : il ne crée
 * jamais de manque, il choisit OÙ il tombe. Ajouter une personne ne le fait
 * jamais payer (P1 tient sans rien ajouter). Un trou (personne) le paie
 * aussi, en plus de `POIDS_TROU_QUART`. */
export const POIDS_SEUL_QUART = 150
/** Le premier jour du contrat est travaillé (demande d'une responsable du
 * 2026-11-04 : « mes stagiaires commencent leur stage par deux jours de
 * repos »). Rien ne retenait le calcul de poser les deux repos de la
 * semaine sur l'arrivée. Prime sur le premier jour sur place de la semaine
 * où le contrat commence (`premierJourSurPlace`). Au-dessus des repos
 * accolés et du jour isolé, sous la fatigue et les heures : elle ne fait
 * que déplacer un repos. Pas de prime en dépannage, comme le jour
 * habituel (D13). */
export const POIDS_PREMIER_JOUR = 10_000

/** Premier jour (0 à `nbJours` - 1) où la personne peut être sur place
 * la semaine où son contrat commence : le jour d'entrée, ou le suivant
 * quand il est pris (absence, école, repos fixe). null : contrat commencé
 * avant cette semaine, ou aucun jour sur place. */
export function premierJourSurPlace(
  s: Pick<
    SalarieSolveur,
    'contratDebut' | 'indisponibilites' | 'joursHorsSite' | 'reposFixes'
  >,
  nbJours: number,
): number | null {
  if (s.contratDebut === null || s.contratDebut < 0) return null
  // Minutes réelles : un changement d'heure décale minuit d'une heure.
  const debut = Math.floor((s.contratDebut + 720) / 1440)
  for (let j = debut; j < Math.min(nbJours, 7); j++) {
    if (s.indisponibilites.has(j) || s.joursHorsSite.has(j)) continue
    if (s.reposFixes.has(j)) continue
    return j
  }
  return null
}

/*
 * RÈGLES MORALES (PRD `plan/planning-bonnes-pratiques/PRD.md`, partie 4 ;
 * décisions prises par l'assistant le 2026-11-02, déléguées par
 * l'utilisateur, question Q1). Ordre : la loi (dur) > les places nécessaires
 * (P1, `coutPlaceVide` les relit toutes : une place n'est jamais laissée
 * vide pour une règle morale) > les heures dues du contrat (400 par minute :
 * 96 000 pour un shift de 4 h, plus que n'importe laquelle de ces règles
 * seule ; ne pas donner ses heures à quelqu'un est aussi injuste) > ces
 * règles > le confort. Chacune est AU-DESSUS de la part fixe du dépannage
 * (`PART_FIXE_DEPANNAGE`) : un collègue en dépannage vaut mieux qu'une
 * entorse. Quand rien d'autre n'est possible, l'entorse a lieu et le
 * vérificateur la dit (alerte d'organisation). Les variables ne sont créées
 * que là où la règle peut jouer (voisins d'un jour d'école, personnes qui
 * font des nuits, semaines à plusieurs moments…) : le temps de calcul reste
 * celui d'avant à quelques dixièmes près.
 */
/** Règle 3 : par paire de services de deux jours qui se suivent séparés
 * de moins de `REPOS_CONFORT` (12 h ; les 11 h légales restent dures).
 * Fatigue (`POIDS_FATIGUE`, 2026-11-03). */
export const POIDS_REPOS_COURT = POIDS_FATIGUE
/** Règle 4 : la semaine ne donne pas de week-end complet libre (samedi ET
 * dimanche) à quelqu'un qui n'en a eu aucun les 3 semaines d'avant.
 * Fatigue (`POIDS_FATIGUE`, 2026-11-03) : au-dessus du 6e jour, un collègue
 * peut faire un 6e jour (signalé) pour que chacun ait son week-end. */
export const POIDS_WEEKEND_LIBRE = POIDS_FATIGUE
/** Règle 6 : par changement de moment (matin, middle, soir, nuit) d'un jour
 * au suivant au-delà de `CHANGEMENTS_MOMENT_MAX` dans la semaine. */
export const POIDS_MOMENT_EN_TROP = 5_000
/** Règle 6 : un jour à un moment plus tôt (soir puis matin, nuit puis jour)
 * qu'un des `MOMENT_ARRIERE_JOURS` jours d'avant, par paire de jours. */
export const POIDS_MOMENT_ARRIERE = 6_000
/** Règle 7 : par nuit au-delà de `NUITS_AFFILEES_MAX` d'affilée, sur chaque
 * fenêtre (comme les jours d'affilée). */
export const POIDS_NUIT_AFFILEE = 12_000
/** Règle 7 : un service de jour moins de `REPOS_APRES_NUITS` jours après
 * une nuit. Fatigue (`POIDS_FATIGUE`, 2026-11-03). */
export const POIDS_REPRISE_APRES_NUIT = POIDS_FATIGUE
/** Règle 13 : un 6e jour la semaine du retour d'un congé, EN PLUS du 6e jour
 * ordinaire. */
export const POIDS_RETOUR_SIXIEME = 15_000
/** Règle 13 : un repos de moins de 12 h la semaine du retour, en plus de
 * `POIDS_REPOS_COURT`. */
export const POIDS_RETOUR_REPOS_COURT = 6_000
/** Règle 13 : la reprise après le congé tombe un samedi ou un dimanche. */
export const POIDS_RETOUR_WEEKEND = 5_000
/** Règle 14 : un service qui finit après 21:00 la veille d'un jour d'école,
 * ou qui commence avant 08:00 le lendemain. */
export const POIDS_ECOLE_ABORDS = 6_000
/** Règle 17 (2026-11-03) : à l'accueil, des arrivées du soir à plus de
 * `EQUIPE_TOLERANCE` les unes des autres, une fois par jour. */
export const POIDS_EQUIPE_ARRIVEE = 4_000
/** Règle 17 : des départs du soir à plus de `EQUIPE_TOLERANCE` les uns des
 * autres (l'une reste seule la fin du soir), une fois par jour. */
export const POIDS_EQUIPE_DEPART = 3_000
/** Règle 17 : une personne du soir qui arrive sans croiser une personne du
 * matin le temps de la relève réglée, par personne (la relève du jour,
 * `POIDS_RELEVE`, n'en exige qu'une paire). */
export const POIDS_RELEVE_CHACUN = 5_000
/** Règle 12 : par minute au-delà du contrat et par heure d'avance sur le
 * moins chargé du groupe (heures en plus des 4 semaines d'avant, ramenées à
 * la part de chacun), au plus `EQUITE_HEURES_PLUS_MAX` heures comptées. */
export const POIDS_EQUITE_HEURES_PLUS = 5
export const EQUITE_HEURES_PLUS_MAX = 6
/** Règle 8 (confort, « petite préférence ») : travailler un jour de semaine
 * qui était un repos la semaine d'avant. Comptée dans la part fixe du
 * dépannage, comme tout le confort. */
export const POIDS_MEMES_REPOS = 500
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
  return r.place === null || r.etoile ? 0 : POIDS_REMPLACANT
}

/** Un remplaçant qui se mesure CONTRE son besoin (heures dues au plus,
 * heures en plus au moins, celles du besoin) : pas une version étoile, qui
 * compte ses vraies minutes (une journée de 7 h retire 1 h au contrat). */
const mesureParLeBesoin = (c: Creneau, besoin?: Creneau): besoin is Creneau =>
  c.place !== null && !c.etoile && besoin !== undefined

/** Minutes d'un shift COMPTÉES dans les heures dues (contre le manque au
 * contrat) : un remplaçant compte au plus les heures du besoin de sa place,
 * jamais plus. Un remplaçant plus long ne rapporte donc rien de plus ; un
 * plus court coûte ce qu'il ne fait pas. */
export function minutesDues(c: Creneau, besoin?: Creneau): number {
  return mesureParLeBesoin(c, besoin)
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
  return mesureParLeBesoin(c, besoin)
    ? Math.max(travail(c), travail(besoin))
    : travail(c)
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
  POIDS_JOUR_FIXE +
  POIDS_MEMES_REPOS +
  EQUITE_MAX_PAR_SHIFT +
  POIDS_DEJA_PROPOSE +
  BRUIT_MAX +
  1

/** P1 : ce que les règles morales peuvent coûter, au pire, quand on ajoute
 * un shift `c` à une personne (règles 3, 4, 6, 7, 8, 13 et 14 du PRD) : deux
 * repos courts (la veille et le lendemain, retour de congé compris), le
 * week-end libre perdu, deux changements de moment (la veille et le
 * lendemain), un retour en arrière avec
 * chacun des deux jours d'avant et des deux jours d'après, le 6e
 * jour et la reprise un week-end au retour, les deux abords de l'école, un
 * jour de repos de la semaine d'avant ; une nuit entre dans au plus 6
 * fenêtres de 6 nuits et précède au plus deux reprises de jour, un service
 * de jour suit au plus une nuit. Les heures en plus (règle 12) se comptent
 * à la minute, avec les autres (`pireCoutRemplir`). */
export function pireMoral(
  c: Creneau,
  R: RegleEtablissement = REGLES_PAR_DEFAUT,
): number {
  return (
    2 * (POIDS_REPOS_COURT + POIDS_RETOUR_REPOS_COURT) +
    POIDS_WEEKEND_LIBRE +
    2 * POIDS_MOMENT_EN_TROP +
    2 * R.repos.momentArriereJours * POIDS_MOMENT_ARRIERE +
    (estNuit(R.moments, c.moment)
      ? 6 * POIDS_NUIT_AFFILEE + 2 * POIDS_REPRISE_APRES_NUIT
      : POIDS_REPRISE_APRES_NUIT) +
    POIDS_RETOUR_SIXIEME +
    POIDS_RETOUR_WEEKEND +
    2 * POIDS_ECOLE_ABORDS +
    POIDS_MEMES_REPOS +
    // Règle 17 : une personne ajoutée au soir étale au plus ses arrivées et
    // ses départs (un coût par jour chacun), et manque au plus sa relève.
    POIDS_EQUIPE_ARRIVEE +
    POIDS_EQUIPE_DEPART +
    POIDS_RELEVE_CHACUN +
    // Un veilleur ajouté peut manquer sa passation des deux côtés.
    (c.presence.some((q) => estNuit(R.moments, q)) &&
    R.passations.passationVeilleur
      ? 2 * POIDS_PASSATION
      : 0)
  )
}

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
 * place vide, qui le compte dans son pire (`pireCoutRemplir`).
 *
 * Plus `PART_MORALE_EXTRA` (décision utilisateur du 2026-11-03 : « on ne
 * prend pas d'extra pour la justice de répartition ; un extra coûte de
 * l'argent, seulement s'il n'y a pas le choix ») : tout ce qu'un shift peut
 * coûter en règles morales, en équité et en confort à la personne qu'il
 * soulagerait. Un extra ne sert donc jamais à libérer un week-end ni à
 * équilibrer, seulement à tenir une place qui resterait vide. */
export function coutExtra(
  c: Creneau,
  R: RegleEtablissement = REGLES_PAR_DEFAUT,
) {
  return (
    POIDS_SUR_CONTRAT * duree(c) +
    POIDS_SIXIEME_JOUR +
    coutDepannage(c) +
    partMoraleExtra(c, R) +
    1
  )
}

/** Ce qu'un shift peut coûter, au pire, en règles morales (`pireMoral`),
 * en équité et en confort (repos accolés, jour isolé, jour habituel, jours
 * d'affilée) à qui le ferait : la part de `coutExtra` qui interdit de
 * prendre un extra pour le soulager. */
export function partMoraleExtra(
  c: Creneau,
  R: RegleEtablissement = REGLES_PAR_DEFAUT,
): number {
  return (
    pireMoral(c, R) +
    EQUITE_MAX_PAR_SHIFT +
    POIDS_REPOS_SEPARES +
    POIDS_JOUR_ISOLE +
    POIDS_JOUR_FIXE +
    7 * POIDS_JOUR_AFFILE +
    6 * POIDS_JOUR_AFFILE_CONSEILLE
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
  R: RegleEtablissement = REGLES_PAR_DEFAUT,
) {
  // Heures en plus comptées pour un remplaçant : au moins celles du besoin
  // (`minutesEnPlus`), donc au plus la plus longue des deux durées.
  const enPlus = mesureParLeBesoin(c, besoin)
    ? Math.max(duree(c), duree(besoin))
    : duree(c)
  return (
    (POIDS_SUR_CONTRAT + POIDS_EQUITE_HEURES_PLUS * EQUITE_HEURES_PLUS_MAX) *
      enPlus +
    pireMoral(c, R) +
    POIDS_DEPANNAGE_MINUTE * duree(c) +
    PART_FIXE_DEPANNAGE +
    coutRemplacant(c) +
    (c.accueil ? coutExtra(c, R) : 0) +
    POIDS_SIXIEME_JOUR +
    POIDS_REPOS_SEPARES +
    POIDS_JOUR_ISOLE +
    // Un jour de plus entre dans au plus 7 fenêtres de 7 jours et 6 de 6.
    7 * POIDS_JOUR_AFFILE +
    6 * POIDS_JOUR_AFFILE_CONSEILLE +
    POIDS_MINEUR_FERIE +
    presenceLaPlusChere +
    EQUITE_MAX_PAR_SHIFT +
    // Arriver après l'ouverture (2026-11-05), au plus : le premier moment
    // de jour du tableau (à l'hôtel, le matin).
    (c.moment === premierMoment(R.moments) && c.accueil
      ? POIDS_ARRIVEE_MATIN_MINUTE * ARRIVEE_MATIN_MAX
      : 0) +
    POIDS_DEJA_PROPOSE +
    BRUIT_MAX
  )
}

/** Ce que coûte un créneau du matin de l'accueil qui commence après
 * l'ouverture de son poste ce jour-là (`POIDS_ARRIVEE_MATIN_MINUTE`).
 * `ouvertureDe` : « poste|jour » → début de l'ouverture (minutes réelles). */
export function coutArriveeMatin(
  c: Creneau,
  ouvertureDe: ReadonlyMap<string, number>,
  l: Moments = MOMENTS_HOTEL,
): number {
  if (c.moment !== premierMoment(l) || !c.accueil) return 0
  const o = ouvertureDe.get(`${c.poste}|${jourDe(c)}`)
  if (o === undefined) return 0
  const retard = Math.min(ARRIVEE_MATIN_MAX, Math.max(0, c.debut - o))
  return POIDS_ARRIVEE_MATIN_MINUTE * retard
}

/** P1 : une personne qui manque sur une place nécessaire, strictement plus
 * que tout ce qu'il faudrait payer pour la remplir. */
export function coutPlaceVide(
  c: Creneau,
  presenceLaPlusChere: number,
  besoin?: Creneau,
  R: RegleEtablissement = REGLES_PAR_DEFAUT,
) {
  return pireCoutRemplir(c, presenceLaPlusChere, besoin, R) + 1
}

/** P1 : une personne qui manque sur une PLACE tenue par le besoin ou l'un
 * de ses remplaçants (`membres`) : au-dessus du pire de chacun, pour que la
 * place ne reste vide que si personne ne peut tenir AUCUN des horaires. Sans
 * remplaçant, `coutPlaceVide` du besoin, inchangé. */
export function coutPlaceVideGroupe(
  membres: Creneau[],
  presenceLaPlusChere: number,
  besoinDe: BesoinDe = (place) => membres.find((m) => m.id === place),
  R: RegleEtablissement = REGLES_PAR_DEFAUT,
) {
  return Math.max(
    ...membres.map((c) =>
      coutPlaceVide(
        c,
        presenceLaPlusChere,
        c.place !== null ? besoinDe(c.place) : undefined,
        R,
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
  R: RegleEtablissement = REGLES_PAR_DEFAUT,
) {
  const ouverts = creneaux.filter((c) => !c.ferme)
  return ouverts.length
    ? coutPlaceVideGroupe(ouverts, presenceLaPlusChere, besoinDe, R)
    : 0
}

/*
 * IMPORTANCE DES POSTES (D11, OUI / NON depuis la décision utilisateur du
 * 2026-11-05 : « soit un poste est important, soit il ne l'est pas ») et
 * BESOINS SOUHAITÉS (D4). Aucun poste n'est nommé ici : seul compte le
 * réglage « indispensable » de chaque poste. Chaque
 * place nécessaire (P1 : une place, un manque de l'accueil, un trou entre
 * deux équipes, une passation avec le veilleur) appartient à un PALIER :
 *   0  un besoin souhaité (`obligatoire = false`), quel que soit son poste ;
 *   1  une place d'un poste non indispensable (l'ancienne valeur
 *      « important » compte ici) ;
 *   2  une place d'un poste indispensable.
 * Le palier d'un manque ou d'un trou est le plus haut des postes qui le
 * tiendraient ; celui d'une passation, le plus bas de ses nuits. Son prix
 * reste le prix DÉRIVÉ d'aujourd'hui (`coutPlaceVide` : une place n'est
 * vide que si personne ne peut la tenir), plus un DÉCALAGE par palier :
 * le i-ème palier présent dans la semaine reçoit i × `pas`, où `pas`
 * dépasse le prix le plus cher d'une place d'un palier plus bas, surplus
 * de nuit compris. Donc, à une personne près, une place d'un palier plus
 * bas reste vide avant toute place d'un palier plus haut, et à palier égal
 * rien ne change. Une semaine où un seul palier est présent (tous les
 * postes au même réglage, ou un hôtel qui n'a rien réglé) a un
 * décalage nul : le modèle est celui d'avant, au caractère près.
 * Les passations : un veilleur ajouté peut en casser deux, donc les places
 * de nuit paient deux passations (D8, `extraNuit`). Le décalage d'une
 * passation la rendrait plus chère qu'un palier ; elle ne le reçoit que si
 * ses nuits sont au palier le plus haut présent (rien au-dessus à
 * dépasser), sinon elle garde le prix d'une place de son palier sans
 * décalage.
 */

/** Palier d'un besoin souhaité, et d'un poste non indispensable. */
export const RANG_SOUHAITE = 0
export const RANG_AUTRE = rangImportance(false)

/** Palier d'une place (le besoin qui la fixe). */
export const rangPlace = (c: Creneau) =>
  c.souhaite ? RANG_SOUHAITE : rangImportance(c.indispensable)

/** Palier d'un manque ou d'un trou : le plus haut des postes de ses
 * créneaux (non indispensable sans créneau). */
export const rangDe = (cs: readonly Creneau[]) =>
  cs.length
    ? Math.max(...cs.map((c) => rangImportance(c.indispensable)))
    : RANG_AUTRE

/** Une passation avec le veilleur, pour les paliers : sa clé, son prix
 * dérivé (au-delà de `POIDS_PASSATION`) et son palier. */
export interface ZonePrix {
  cle: string
  plus: number
  rang: number
}

export interface Paliers {
  /** Les paliers présents, du plus bas au plus haut. */
  presents: number[]
  /** Le pas entre deux paliers (0 : un seul palier). */
  pas: number
  /** Décalage du prix d'une place de ce palier. */
  decalage: (rang: number) => number
  /** Décalage d'une passation de ce palier (0 hors du palier le plus haut). */
  passation: (rang: number) => number
  /** Ce qu'une passation peut coûter de plus qu'un `POIDS_PASSATION`, pour
   * un veilleur d'un manque ou d'un trou de ce palier. */
  extraNuit: (rang: number) => number
}

/** Les paliers d'une semaine (voir plus haut). `prix(c)` : le prix dérivé
 * d'une place vide sur `c` (`coutPlaceVide`), lu seulement s'il y a plus
 * d'un palier. */
export function paliersPlaces(
  creneaux: readonly Creneau[],
  zones: readonly ZonePrix[],
  prix: (c: Creneau) => number,
): Paliers {
  const ouverts = creneaux.filter((c) => !c.ferme)
  const presents = [
    ...new Set([
      ...ouverts.map(rangPlace),
      ...ouverts.map((c) => rangImportance(c.indispensable)),
      ...zones.map((z) => z.rang),
    ]),
  ].sort((a, b) => a - b)
  const haut = presents.at(-1) ?? RANG_AUTRE
  const extraBas = Math.max(0, ...zones.map((z) => z.plus))
  let pas = 0
  if (presents.length > 1)
    pas = Math.max(0, ...ouverts.map(prix)) + 2 * extraBas + 1
  const decalage = (rang: number) => {
    const i = presents.findIndex((r) => r >= rang)
    return (i < 0 ? presents.length - 1 : i) * pas
  }
  const passation = (rang: number) => (rang >= haut ? decalage(haut) : 0)
  const extraHaut = Math.max(0, ...zones.map((z) => z.plus + passation(z.rang)))
  return {
    presents,
    pas,
    decalage,
    passation,
    extraNuit: (rang) => (rang >= haut ? extraHaut : extraBas),
  }
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

/** Une passation avec le veilleur : le jour où la nuit est écrite, et le
 * côté (`arrivee` : le dernier moment de jour lui passe la main ;
 * `depart` : le premier moment de jour la reprend). */
export interface Passation {
  jour: number
  cote: CotePassation
}

/** Côté d'une passation avec la nuit. */
export type CotePassation = 'arrivee' | 'depart'

/** Le résultat du générateur, avec les trous entre équipes restés. */
export type ResultatGeneration = Resultat & {
  trous: Trou[]
  /** Ouvertures restées sans personne (poste de l'accueil, première heure). */
  ouvertures: Trou[]
  /** Jours sans relève entre l'équipe du matin et celle de l'après-midi. */
  relevesManquantes: number[]
  /** Passations avec le veilleur manquées (jour de la nuit, côté). */
  passationsManquantes: Passation[]
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
    // Un extra n'est JAMAIS placé par le calcul (décision utilisateur du
    // 2026-11-03 : « on contacte un extra avant de le shifter, laisse les
    // cases vides ») : seulement posé à la main. Un soutien trouve toujours
    // sa place sur l'accueil (D5), accompagné (`construire`).
    !s.placementManuel &&
    r !== null &&
    (r !== 'soutien' || c.soutien > 0 || c.accueil) &&
    // Niveau demandé « titulaire seulement » (2026-11-05) : jamais un
    // dépannage ; un soutien garde ses places de soutien (D9).
    !(r === 'occasionnel' && c.titulaireSeul) &&
    !s.indisponibilites.has(j) &&
    !s.horsContrat.has(j) &&
    dansLeContrat(s, c) &&
    !s.reposFixes.has(j) &&
    duree(c) <= presenceMax(s, c) &&
    // Journée étoile fixée ce jour-là : pas d'horaire de 8 h (D3). Avec un
    // JFR à placer, le modèle le dit (la journée étoile saute si le JFR est
    // pris, `generer`).
    !(s.etoileFixe.has(j) && journeeDe(c) >= s.journeePleine && !s.jfr) &&
    // Une version étoile se compte en heures : pas pour un contrat indicatif.
    !(c.etoile && s.contratIndicatif) &&
    // Les journées du calcul (2026-11-04) : 35 h en 7 h, 39 h en 8 h et une
    // de 7 h ; tout autre horaire seulement posé à la main.
    (s.journeesCalcul === null || s.journeesCalcul.has(journeeDe(c))) &&
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

/** Les termes à coefficient non nul (un créneau sans travail ajoute un
 * terme nul). */
const nonNuls = (t: Terme[]) => t.filter(([k]) => k !== 0)

function intervalle(debut: number, fin: number): number[] {
  const r: number[] = []
  for (let i = debut; i < fin; i++) r.push(i)
  return r
}

interface Construit {
  modele: Modele
  x: Map<string, string>
  manque: Map<string, string>
  ecarts: Array<[string, string]>
  /** Variables de trou (une par morceau de plage), voir `trousEntreEquipes`. */
  trous: Array<Trou & { v: string }>
  /** Ouvertures (première heure d'un poste de l'accueil), même forme. */
  ouvertures: Array<Trou & { v: string }>
  /** Relève manquée, une variable par jour. */
  releves: Array<{ jour: number; v: string }>
  /** Passation avec le veilleur manquée, une variable par nuit et par côté. */
  passations: Array<Passation & { v: string }>
  /** Variables de manque au chiffre d'un moment (une par moment demandé),
   * avec l'indice du moment dans `Probleme.consignes`. */
  minimums: Array<{ v: string; consigne: number }>
  /** Minutes sous et au-dessus du contrat des personnes à contrat NON
   * indicatif, par personne et par semaine : [fiche, moins, plus]. */
  sousContrat: Array<[string, string, string]>
  /** Jours fériés rattrapés possibles (R-FERIE-RATTRAPE), une variable par
   * personne et par jour permis. */
  jfrs: Array<{ salarieId: string; jour: number; v: string }>
}

/** Réglages internes de la construction (tests et mesures seulement). */
export interface OptionsConstruction {
  /**
   * `false` : écrit aussi les contraintes que la réduction des remplaçants
   * retire (voir `REDUCTION DES REMPLAÇANTS` plus bas). Même espace de
   * solutions ; ne sert qu'à le prouver.
   */
  reduire?: boolean
  /** Affinage (2026-11-05, voir `affiner`) : ne garder que les choix que
   * `permis` accepte, borner l'objectif d'origine à `borne`, et ajouter le
   * coût des horaires de plus par personne. */
  affiner?: {
    permis: (salarieId: string, c: Creneau) => boolean
    borne: number
  }
}

export function construire(
  p: Probleme,
  options: OptionsConstruction = {},
): Construit {
  const reduire = options.reduire ?? true
  const R = p.regles ?? REGLES_PAR_DEFAUT
  const m = new Modele()
  const nbSemaines = Math.ceil(p.nbJours / 7)
  const hasard = alea(p.graine)
  const imposees = p.imposees
  const creneaux = new Map(p.creneaux.map((c) => [c.id, c]))

  const x = new Map<string, string>()
  for (const s of p.salaries) {
    for (const c of p.creneaux) {
      const k = cle(s.id, c.id)
      if (
        imposees.has(k) ||
        (!c.ferme &&
          compatible(s, c) &&
          (options.affiner?.permis(s.id, c) ?? true))
      )
        x.set(k, m.bool())
    }
  }
  for (const k of imposees) {
    const v = x.get(k)
    if (v) m.ajoute([[1, v]], '=', 1)
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
  // Chaque chiffre ne compte que les créneaux de SA zone (2026-11-06).
  const premiereZone = R.zones[0].id
  const desPostes = zonesDesPostes(p)
  const comptent = p.consignes.map((k) =>
    p.creneaux.filter(
      (c) =>
        c.presence.includes(k.periode) &&
        jourDe(c) === k.jour &&
        (c.zone ?? desPostes.get(c.poste) ?? premiereZone) ===
          (k.zone ?? premiereZone),
    ),
  )
  const besoinDe: BesoinDe = (place) => creneaux.get(place)
  const coutsSurplus = comptent.map((cs) => coutSurplus(cs))
  // Une personne ajoutée peut aussi perdre son JFR (R-FERIE-RATTRAPE) : son
  // pire est compté avec celui du surplus dans les places nécessaires.
  // Sans JFR dans la semaine, rien ne change (même texte LP qu'avant).
  const presenceLaPlusChere =
    Math.max(0, ...coutsSurplus) +
    pireJfr(Math.max(0, ...p.salaries.map((s) => s.jfr?.reduction ?? 0))) +
    // Horizon glissant : ce qu'un shift ajouté peut coûter à l'esquisse.
    pireHorizon(p.suivante)
  // CONTINUITÉ OBLIGATOIRE (D8, plus bas) : une passation avec le veilleur
  // manquée coûte aussi une place nécessaire, au-dessus de tout ce qu'il
  // faudrait payer pour ajouter quelqu'un sur un créneau qui la tiendrait
  // (un relais). Un veilleur ajouté peut en manquer deux : ce surplus
  // (`extraNuit`, au-delà de `POIDS_PASSATION` déjà dans `pireMoral`) entre
  // dans le prix des places de nuit (P1). Sans la règle : 0, rien ne change.
  const zones: ZonePrix[] = []
  if (R.passations.continuiteObligatoire)
    for (const z of zonesPassation(p)) {
      const relais = new Set<Creneau>()
      if (z.veille) for (const c of z.relais(z.veille)) relais.add(c)
      for (const n of z.nuits) for (const c of z.relais(n)) relais.add(c)
      const ouverts = [...relais].filter((c) => !c.ferme)
      const plus = ouverts.length
        ? coutPlaceVideGroupe(ouverts, presenceLaPlusChere, besoinDe, R)
        : 0
      // Le palier de la passation : celui de ses nuits (un veilleur ajouté
      // est ce qui peut la casser), le plus bas.
      const nuits = z.nuits.length ? z.nuits : [...relais]
      zones.push({
        cle: `${z.zone === premiereZone ? '' : `${z.zone}|`}${z.jour}|${z.cote}`,
        plus,
        rang: nuits.length
          ? Math.min(...nuits.map((c) => rangImportance(c.indispensable)))
          : RANG_AUTRE,
      })
    }
  // IMPORTANCE DES POSTES (D11) et besoins souhaités : `paliersPlaces`.
  const pl = paliersPlaces(p.creneaux, zones, (c) =>
    coutPlaceVide(
      c,
      presenceLaPlusChere,
      c.place !== null ? besoinDe(c.place) : undefined,
      R,
    ),
  )
  const coutPassation = new Map(
    zones.map((z) => [z.cle, POIDS_PASSATION + z.plus + pl.passation(z.rang)]),
  )
  /** Le surplus de nuit d'un manque ou d'un trou de ce palier (D8). */
  const nuitDe = (cs: Creneau[], rang: number) =>
    cs.some((c) => !c.ferme && c.presence.some((q) => estNuit(R.moments, q)))
      ? 2 * pl.extraNuit(rang)
      : 0
  const coutsMinimum = comptent.map((cs) => {
    const rang = rangDe(cs.filter((c) => !c.ferme))
    return (
      coutManqueMinimum(cs, presenceLaPlusChere, besoinDe, R) +
      nuitDe(cs, rang) +
      pl.decalage(rang)
    )
  })

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
    m.cout(
      coutPlaceVideGroupe(membres, presenceLaPlusChere, besoinDe, R) +
        pl.decalage(rangPlace(tete)),
      vm,
    )
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
  // égalité) : tous ceux qui le tiennent et les autonomes. Simple
  // substitution linéaire : mêmes
  // solutions entières, même relâché, même optimum (propriété « même
  // optimum » d'accueil.test.ts, qui compare aussi à la construction sans
  // réduction). Un shift posé (`a…`) garde ses variables propres.
  const sommesAccueil = new Map<
    string,
    { tous: Terme[]; autonomes: Terme[]; n: number }
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
    for (const s of p.salaries) {
      const v = x.get(cle(s.id, c.id))
      if (!v) continue
      tous.push([1, v])
      if (role(s, c.poste) === 'soutien') continue
      autonomes.push([1, v])
    }
    if (!tous.length) continue
    const memes = autonomes.length === tous.length
    const sa = sommer(autonomes)
    sommesAccueil.set(c.id, {
      tous: memes ? sa : sommer(tous),
      autonomes: sa,
      n: tous.length,
    })
  }
  /** Les termes d'un créneau qui comptent : sa somme pour un candidat, ses
   * variables une à une sinon. */
  const termesDe = (c: Creneau, quoi: 'tous' | 'autonomes'): Terme[] => {
    if (c.accueil) return sommesAccueil.get(c.id)?.[quoi] ?? []
    const r: Terme[] = []
    for (const s of p.salaries) {
      const v = x.get(cle(s.id, c.id))
      if (!v) continue
      if (quoi === 'tous' || role(s, c.poste) !== 'soutien') r.push([1, v])
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
      if (s.placementManuel) m.cout(coutExtra(c, R), v)
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
    // Au plus (2026-11-06) : le maximum ; un chiffre exact par défaut.
    const haut = Math.max(n, k.maximum ?? n)
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
    // La NUIT n'a jamais personne en plus (décision utilisateur du
    // 2026-11-03 : « toujours un seul night ») : plafond DUR au chiffre de
    // la nuit du tableau de l'accueil. Un deuxième veilleur (formation) se
    // pose à la main : les shifts posés relèvent le plafond, jamais le
    // calcul. Le jour reste souple (D8). `accueil.personnesNuit` n'est pas
    // lu ici : le chiffre de la nuit DIT déjà combien de personnes la nuit
    // (un plafond à part le contredirait, deux veilleurs demandés).
    if (estNuit(R.moments, k.periode)) {
      const poses = comptent[i].reduce(
        (t, c) =>
          t + p.salaries.filter((s) => imposees.has(cle(s.id, c.id))).length,
        0,
      )
      if (possibles > Math.max(haut, poses))
        m.ajoute(termes, '<=', Math.max(haut, poses))
    } else if (possibles > haut) {
      const vp = m.continu(0, possibles)
      m.ajoute([...termes, [-1, vp]], '<=', haut)
      m.cout(coutsSurplus[i], vp)
    }
  })

  // CONTINUITÉ ENTRE ÉQUIPES (D8 du 2026-11-05, `continuiteObligatoire`) :
  // un trou entre la fin d'une équipe et l'arrivée de la suivante (passation
  // avec le veilleur comprise : la plage de l'accueil va d'un veilleur à
  // l'autre) coûte une PLACE NÉCESSAIRE (P1) : plus que tout ce qu'il
  // faudrait payer pour ajouter une personne sur l'un des créneaux qui le
  // couvriraient. Jamais dur : si personne ne peut le tenir, il reste (D3).
  // Le chevauchement (relève) reste une préférence.
  const continuite = R.passations.continuiteObligatoire
    ? (couvrants: Creneau[]) => {
        const ouverts = couvrants.filter((c) => !c.ferme)
        const rang = rangDe(couvrants)
        return ouverts.length
          ? coutPlaceVideGroupe(ouverts, presenceLaPlusChere, besoinDe, R) +
              nuitDe(ouverts, rang) +
              pl.decalage(rang)
          : 0
      }
    : undefined
  const trous = trousEntreEquipes(m, p, x, termesDe, continuite)
  // Ouverture (2026-11-01) : la première heure de chaque poste de l'accueil
  // qui a une heure d'ouverture, tenue sur CE poste.
  // Fermeture (2026-11-05) : la dernière heure, symétrique, même prix.
  const ouvertures = [...(p.ouvertures ?? []), ...(p.fermetures ?? [])].flatMap(
    (o) =>
      variablesTrous(
        m,
        p,
        x,
        termesDe,
        o.poste,
        o.jour,
        o.debut,
        o.fin,
        p.creneaux.filter((c) => c.poste === o.poste),
        POIDS_OUVERTURE_QUART,
      ),
  )
  const releves = relevesAccueil(m, p, termesDe)
  const borneDe = (c: Creneau) =>
    c.accueil
      ? (sommesAccueil.get(c.id)?.n ?? 0)
      : p.salaries.filter((s) => x.has(cle(s.id, c.id))).length
  const passations = passationsVeilleur(
    m,
    p,
    termesDe,
    borneDe,
    (z) => coutPassation.get(`${z.jour}|${z.cote}`) ?? POIDS_PASSATION,
  )
  equipesSynchro(m, p, termesDe, borneDe)

  // Une « expression » : termes + constante.
  type Expr = { termes: Terme[]; constante: number }
  const semainesJours = new Map<string, Expr>()
  const figes = new Map<string, number>()
  const travailleDe = new Map<string, Map<number, string>>()
  const jfrs: Array<{ salarieId: string; jour: number; v: string }> = []
  const coefsPlus = coefsHeuresPlus(p)
  // Horizon glissant : jour de l'esquisse (nbJours + 0..6) → 1 (travaillé
  // d'office) ou la variable « travaille ». Un jour impossible est absent.
  const esquisses = new Map<string, Map<number, string | 1>>()

  for (const s of p.salaries) {
    const siens = p.creneaux.filter((c) => x.has(cle(s.id, c.id)))
    const fixes = siens.filter((c) => imposees.has(cle(s.id, c.id)))
    const xv = (c: Creneau) => x.get(cle(s.id, c.id)) as string
    const estImpose = (c: Creneau) => imposees.has(cle(s.id, c.id))

    const parJour = new Map<number, Creneau[]>()
    for (const c of siens) {
      const j = jourDe(c)
      parJour.set(j, [...(parJour.get(j) ?? []), c])
    }
    const travaille = new Map<number, string>()
    travailleDe.set(s.id, travaille)
    const esquisse = p.suivante?.personnes.get(s.id)
    const sk = esquisse ? new Map<number, string | 1>() : null
    if (esquisse && sk) {
      esquisses.set(s.id, sk)
      for (let j = 0; j < 7; j++) {
        const f = esquisse.fixes.get(j)
        if (f === 0) continue
        sk.set(p.nbJours + j, f === 1 ? 1 : m.bool())
      }
    }
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

    // R-FERIE-RATTRAPE : un jour férié rattrapé au plus, sur un jour permis
    // (`jfr.jours`, déjà sans absence, école, jour fixé ni jour passé) et
    // sans travail ce jour-là. Il compte comme un congé : `reduction` en
    // moins dans les heures dues, un jour en moins au rythme de 5 jours
    // (plus bas). Pas pris : POIDS_JFR_EN_ATTENTE (constante retirée, donc
    // un gain sur chaque variable). Collé à un jour sans travail :
    // POIDS_JFR_COLLE de mieux.
    const jfrDuJour = new Map<number, string>()
    if (s.jfr) {
      for (const d of [...s.jfr.jours].sort((a, b) => a - b)) {
        if (d < 0 || d >= p.nbJours) continue
        const v = m.bool()
        jfrDuJour.set(d, v)
        jfrs.push({ salarieId: s.id, jour: d, v })
        const t = travaille.get(d)
        if (t)
          m.ajoute(
            [
              [1, v],
              [1, t],
            ],
            '<=',
            1,
          )
        m.cout(-POIDS_JFR_EN_ATTENTE, v)
        // colle <= jfr ; colle <= 2 - t(d-1) - t(d+1) : un voisin libre.
        // Le bord du calcul compte comme du travail (semaine voisine).
        const voisins: Terme[] = []
        let constante = 0
        for (const w of [d - 1, d + 1]) {
          if (w < 0 || w >= p.nbJours) constante++
          else {
            const tw = travaille.get(w)
            if (tw) voisins.push([1, tw])
          }
        }
        if (constante + voisins.length < 2) {
          // Un voisin ne peut pas travailler : toujours collé.
          m.cout(-POIDS_JFR_COLLE, v)
          continue
        }
        const colle = m.bool()
        m.ajoute(
          [
            [1, colle],
            [-1, v],
          ],
          '<=',
          0,
        )
        m.ajoute([[1, colle], ...voisins], '<=', 2 - constante)
        m.cout(-POIDS_JFR_COLLE, colle)
      }
      if (jfrDuJour.size > 1)
        m.ajoute(
          [...jfrDuJour.values()].map((v) => [1, v] as Terme),
          '<=',
          1,
        )
    }
    const jfrTermes = (jours: number[], coef: number): Terme[] =>
      jours.flatMap((j) => {
        const v = jfrDuJour.get(j)
        return v ? [[coef, v] as Terme] : []
      })
    // Un JFR pris est une absence de la semaine : la journée étoile saute
    // (2026-11-04, `etoileSacrifiee`), toutes les journées sont pleines.
    // Sans lui, la journée étoile fixée reste sans horaire de 8 h.
    if (jfrDuJour.size && s.journeePleine > 0) {
      const pris = [...jfrDuJour.values()].map((v) => [1, v] as Terme)
      const courtes: Terme[] = []
      const pleinesEtoile: Terme[] = []
      for (const c of siens) {
        if (imposees.has(cle(s.id, c.id))) continue
        const pleine = journeeDe(c) >= s.journeePleine
        if (!pleine && s.journeesCalcul?.has(s.journeePleine))
          courtes.push([1, xv(c)])
        if (pleine && s.etoileFixe.has(jourDe(c)))
          pleinesEtoile.push([1, xv(c)])
      }
      if (courtes.length) m.ajoute([...courtes, ...pris], '<=', 1)
      for (const j of s.etoileFixe) {
        const ceJour = pleinesEtoile.filter(([, v]) =>
          siens.some((c) => xv(c) === v && jourDe(c) === j),
        )
        if (ceJour.length)
          m.ajoute(
            [...ceJour, ...pris.map(([, v]) => [-1, v] as Terme)],
            '<=',
            0,
          )
      }
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

    const arrivee = premierJourSurPlace(s, p.nbJours)
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
        // Règle 13 : la semaine du retour d'un congé, un 6e jour coûte double.
        if (k === 0 && s.retourConge !== null) m.cout(POIDS_RETOUR_SIXIEME, six)
      }
      // Rythme de 5 jours (2026-11-01) : un contrat de 35 h ou plus se fait
      // en `joursPreferesSemaine` jours, absences et jours hors contrat
      // décomptés (l'école compte déjà comme un jour, `nbJours`).
      if (
        !s.contratIndicatif &&
        s.minutesHebdoContrat >= R.repos.rythmeContratMin
      ) {
        // Jours de présence (2026-11-02) : un départ le jeudi laisse 4 jours.
        const enContrat = jours.filter((j) => !s.horsContrat.has(j))
        const absents = enContrat.filter((j) =>
          s.indisponibilites.has(j),
        ).length
        const attendu =
          Math.min(s.joursPreferesSemaine, enContrat.length) - absents
        if (attendu > nbJours.constante) {
          const ecart = m.entier(0, 7)
          // Un JFR pris compte comme un jour d'absence (R-FERIE-RATTRAPE).
          m.ajoute(
            [[1, ecart], ...nbJours.termes, ...jfrTermes(jours, 1)],
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
      }
      const memeMesure = dues.every(([k], i) => k === enPlus[i][0])
      // R-FERIE-RATTRAPE : un JFR pris retire `reduction` aux heures dues,
      // comme un congé ; écrit comme des minutes faites, dans les deux
      // mesures du contrat (jamais dans le plafond de la semaine).
      const rattrape = jfrTermes(jours, s.jfr?.reduction ?? 0).filter(
        ([coef]) => coef !== 0,
      )
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

      // Deux jours de repos qui se suivent : la loi pour un mineur
      // (R-REPOS-HEBDO-MINEUR, DANS la semaine), la règle de l'hôtel pour
      // tous les autres depuis le 2026-11-04 (`POIDS_REPOS_SEPARES`), sur
      // une semaine complète. Pour eux, le dimanche et le lundi d'à côté
      // font aussi la paire quand ce jour voisin est connu libre (un rythme
      // du mardi au samedi a ses deux repos de suite). Un jour posé ou
      // d'école ne peut pas être libre : ces paires ne comptent pas, et sans
      // aucune paire possible, rien n'est demandé (jamais de modèle
      // impossible). Une semaine type qui fixe deux repos ou plus a décidé
      // elle-même (les repos fixes passent d'abord, 2026-11-03) : rien de
      // plus. Même définition que REPOS-SEPARES (verificateur.ts).
      // Règle de l'établissement (`repos.deuxReposDeSuite`) : obligatoire
      // (dure, comme décrit), souhaitée (une paire perdue coûte
      // `POIDS_REPOS_SEPARES`) ou aucune.
      const forceDeux = R.repos.deuxReposDeSuite
      const regleHotel =
        forceDeux !== 'aucune' &&
        !s.reposConsecutifs &&
        !s.placementManuel &&
        s.reposFixes.size < 2
      if (s.reposConsecutifs || (regleHotel && jours.length === 7)) {
        const pris = (d: number) =>
          fixes.some((c) => jourDe(c) === d) || s.joursHorsSite.has(d)
        const candidats: number[][] = []
        for (const j of jours.slice(0, -1)) candidats.push([j, j + 1])
        if (regleHotel) {
          const lundi = jours[0]
          const dimanche = jours[6]
          if (lundi > 0) candidats.push([lundi - 1, lundi])
          else if (s.joursSemainePrecedente !== null && s.serieAvant === 0)
            candidats.push([lundi])
          if (dimanche + 1 < p.nbJours) candidats.push([dimanche, dimanche + 1])
          else if (s.joursSemaineSuivante !== null && s.serieApres === 0)
            candidats.push([dimanche])
        }
        const paires: string[] = []
        for (const jj of candidats) {
          if (jj.some(pris)) continue
          const libre = m.bool()
          for (const d of jj) {
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
        if (paires.length) {
          if (!s.reposConsecutifs && forceDeux === 'souhaite') {
            const perdue = m.continu(0, 1)
            m.ajoute(
              [...paires.map((v) => [1, v] as Terme), [1, perdue]],
              '>=',
              1,
            )
            m.cout(POIDS_REPOS_SEPARES, perdue)
          } else
            m.ajoute(
              paires.map((v) => [1, v] as Terme),
              '>=',
              1,
            )
        }
      }

      if (s.reposHebdoMin && siens.length) {
        reposHebdo(m, s, siens, xv, travaille, jours, fixes, reduire)
      }

      // Jours d'affilée, semaines voisines comprises : chaque fenêtre de
      // `taille` jours qui n'est pas DANS une semaine du calcul (celles-là
      // sont déjà bornées par le 6e jour et R-SIX-JOURS-MAX) compte ses
      // jours au-delà du plafond. 7 jours : plus de 6 d'affilée ; 6 jours :
      // plus de 5 (le rythme visé, 2026-11-02).
      if (k === 0) {
        for (const c of siens)
          if (s.feriesEvites.has(jourDe(c))) m.cout(POIDS_MINEUR_FERIE, xv(c))
        const debut = -s.serieAvant
        // Avec l'esquisse, la semaine suivante est DANS le calcul : ses
        // jours sont des variables (ou des faits), plus une série figée.
        const fin = p.nbJours + (sk ? 7 : s.serieApres)
        for (const [plafond, poids, conseille] of [
          [R.repos.joursAffilesMax, POIDS_JOUR_AFFILE, false],
          [R.repos.joursAffilesConseilles, POIDS_JOUR_AFFILE_CONSEILLE, true],
        ] as const) {
          const taille = plafond + 1
          for (let a = Math.max(debut, 1 - taille); a + taille <= fin; a++) {
            const derniere = a + taille - 1
            // Fenêtre tout entière dans la semaine esquissée : déjà bornée
            // par son plafond et son 6e jour (`esquisserSuivante`).
            if (sk && a >= p.nbJours) continue
            // Une fenêtre DANS une semaine est déjà bornée par le 6e jour et
            // R-SIX-JOURS-MAX, sauf la fenêtre de 6 jours d'un contrat de
            // 35 h et plus : du lundi au samedi d'affilée, c'est aussi trop
            // (relecture du 2026-11-04 : avec le dimanche et le lundi
            // suivant libres, la paire de repos le laissait passer).
            if (
              !(conseille && rythmeHumain(s, R)) &&
              a >= 0 &&
              derniere < p.nbJours &&
              Math.floor(a / 7) === Math.floor(derniere / 7)
            )
              continue
            const termes: Terme[] = []
            let constante = 0
            for (let d = a; d <= derniere; d++) {
              if (d >= p.nbJours && sk) {
                const v = sk.get(d)
                if (v === 1) constante++
                else if (v) termes.push([1, v])
              } else if (d < 0 || d >= p.nbJours) constante++
              else if (s.joursHorsSite.has(d)) constante++
              else {
                const t = travaille.get(d)
                if (t) termes.push([1, t])
              }
            }
            if (constante + termes.length <= plafond) continue
            // Plus de 6 jours d'affilée : jamais par le calcul (fatigue,
            // 2026-11-03) ; plus de 5 non plus depuis le 2026-11-04 (des
            // semaines de 5 jours, plus humain), sauf un contrat indicatif.
            // Les jours posés à la main restent des faits.
            if (!conseille || rythmeHumain(s, R)) {
              let poses = 0
              for (
                let d = Math.max(a, 0);
                d <= Math.min(derniere, p.nbJours - 1);
                d++
              )
                if (siens.some((c) => jourDe(c) === d && estImpose(c))) poses++
              m.ajoute(termes, '<=', Math.max(plafond - constante, poses, 0))
              continue
            }
            const exces = m.entier(0, taille)
            m.ajoute(
              [[1, exces], ...termes.map(([c, v]) => [-c, v] as Terme)],
              '>=',
              constante - plafond,
            )
            m.cout(poids, exces)
          }
        }
      }

      // Le dimanche d'avant, seul s'il n'y a pas de lundi
      // (`POIDS_DIMANCHE_SEUL`) : travaillé (série de 1), samedi d'avant
      // libre, lundi possible et pas déjà posé.
      if (
        k === 0 &&
        rythmeHumain(s, R) &&
        s.joursSemainePrecedente !== null &&
        s.serieAvant === 1 &&
        !s.joursHorsSite.has(0) &&
        !s.horsContrat.has(0)
      ) {
        const t0 = travaille.get(0)
        if (t0 && !fixes.some((c) => jourDe(c) === 0))
          m.cout(-POIDS_DIMANCHE_SEUL, t0)
      }

      // Jour isolé : isole >= travaille(j) - travaille(j-1) - travaille(j+1).
      // DUR depuis le 2026-11-04 (`POIDS_JOUR_ISOLE`) : travaille(j) <=
      // travaille(j-1) + travaille(j+1), d'une semaine à l'autre comprise
      // (le jour voisin connu libre compte 0, inconnu ou travaillé : rien
      // n'est demandé). Jamais sur un jour posé : le modèle reste possible
      // (ne pas travailler satisfait tout). Même définition que JOUR-ISOLE
      // (verificateur.ts).
      const isole = jourIsoleDe(s, R)
      for (const j of jours) {
        const t = travaille.get(j)
        if (!t || isole === 'aucune') continue
        if (isole === 'interdit') {
          if (fixes.some((c) => jourDe(c) === j)) continue
          const autour: Terme[] = []
          let continu = false
          for (const v of [j - 1, j + 1]) {
            // L'école et les jours après le contrat comptent comme du
            // travail ; les jours avant l'arrivée, comme du repos (aucune
            // variable : voisin libre).
            if (s.joursHorsSite.has(v) || apresContrat(s, v)) {
              continu = true
              break
            }
            if (v < 0) {
              if (s.joursSemainePrecedente === null || s.serieAvant > 0) {
                continu = true
                break
              }
              continue
            }
            // La semaine d'après se lit comme le vérificateur la lit (une
            // seule définition, relecture du 2026-11-04) : connue et libre ce
            // lundi, voisin libre ; sinon rien n'est demandé. Jamais
            // l'esquisse : son lundi n'est pas écrit, il ne peut pas tenir un
            // dimanche (le dimanche s'appuie sur le samedi).
            if (v >= p.nbJours) {
              if (s.joursSemaineSuivante === null || s.serieApres > 0) {
                continu = true
                break
              }
              continue
            }
            const tv = travaille.get(v)
            if (tv) autour.push([1, tv])
          }
          if (continu) continue
          m.ajoute(
            [[1, t], ...autour.map(([c, v]) => [-c, v] as Terme)],
            '<=',
            0,
          )
          continue
        }
        const voisins: string[] = []
        let continu = false
        for (const v of [j - 1, j + 1]) {
          if (
            v < 0 ||
            v >= p.nbJours ||
            s.joursHorsSite.has(v) ||
            s.horsContrat.has(v)
          ) {
            continu = true
            break
          }
          const tv = travaille.get(v)
          if (tv) voisins.push(tv)
        }
        // Seulement contre un jour sans travail possible (congé, absence,
        // repos fixe). Contre deux repos choisis par le calcul, la paire de
        // repos perdue coûte déjà (règle 1), et l'alerte JOUR-ISOLE le dit.
        // Mesuré le 2026-11-03 : la règle partout portait une vraie semaine
        // de 1,9 s à 4,1 s, et la seule extension aux contrats de moins de
        // 35 h laissait une semaine réelle du banc au plafond de 40 s (11 s
        // sans) ; une variable continue au lieu de booléenne, essayée,
        // faisait de même.
        if (continu || voisins.length === 2) continue
        const seul = m.bool()
        m.ajoute(
          [[1, seul], [-1, t], ...voisins.map((v) => [1, v] as Terme)],
          '>=',
          0,
        )
        m.cout(POIDS_JOUR_ISOLE, seul)
      }

      reglesMoralesSemaine(m, R, s, k, jours, siens, travaille, xv, estImpose)
      if (k === 0)
        reglesMoralesSuite(m, R, p, s, siens, parJour, travaille, xv, estImpose)

      for (const j of s.travailFixe) {
        const t = travaille.get(j)
        if (dans(j) && t) m.cout(-POIDS_JOUR_FIXE, t)
      }
      // Le premier jour du contrat est travaillé (`POIDS_PREMIER_JOUR`).
      if (k === 0 && arrivee !== null) {
        const t = travaille.get(arrivee)
        if (t) {
          m.cout(-POIDS_PREMIER_JOUR, t)
          for (const c of siens)
            if (jourDe(c) === arrivee && role(s, c.poste) === 'occasionnel')
              m.cout(POIDS_PREMIER_JOUR, xv(c))
        }
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

      // R-JOURNEE-ETOILE : au plus `journeesCourtesMax` shifts de moins de
      // 8 h dans la semaine (39 h : la journée étoile, une fois).
      if (s.journeesCourtesMax !== null) {
        const courtes: string[] = []
        let courtesFixes = 0
        for (const c of siens) {
          if (!dans(jourDe(c)) || journeeDe(c) >= s.journeePleine) continue
          courtes.push(xv(c))
          if (imposees.has(cle(s.id, c.id))) courtesFixes++
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
          [...minutes, ...rattrape, [-1, plus], [1, moins]],
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
        m.ajoute(
          [...nonNuls(dues), ...rattrape, [1, moins]],
          '>=',
          s.minutesHebdoContrat,
        )
        m.ajoute(
          [...nonNuls(enPlus), ...rattrape, [-1, plus]],
          '<=',
          s.minutesHebdoContrat,
        )
      }
      // Les journées du calcul (2026-11-04) : 35 h = 5 × 7 h, 39 h = 4 × 8 h
      // + 7 h, pas une minute de plus. Jamais d'heures en plus posées par le
      // calcul. Un shift posé plus long que la plus longue journée permise
      // (un 8 h pour un 35 h, un 9 h pour un 39 h) ajoute son surplus : le
      // reste de la semaine garde ses journées (8 h + 4 × 7 h = 36 h).
      if (s.journeesCalcul !== null) {
        const longue = Math.max(...s.journeesCalcul)
        let posees = 0
        let surplus = 0
        const journees: Terme[] = []
        for (const c of siens) {
          if (!dans(jourDe(c))) continue
          journees.push([journeeDe(c), xv(c)])
          if (!imposees.has(cle(s.id, c.id))) continue
          posees += journeeDe(c)
          surplus += Math.max(0, journeeDe(c) - longue)
        }
        m.ajoute(
          [...journees, ...rattrape],
          '<=',
          Math.max(s.minutesHebdoContrat + surplus, posees),
        )
      }
      ecarts.push([plus, moins])
      if (s.contratIndicatif) {
        m.cout(1, moins)
        m.cout(1, plus)
      } else {
        m.cout(POIDS_SOUS_CONTRAT, moins)
        m.cout(POIDS_SUR_CONTRAT, plus)
        // Règle 12 : les heures en plus vont d'abord à qui en a fait le moins.
        if (k === 0) m.cout(coefsPlus.get(s.id) ?? 0, plus)
        sousContrat.push([s.id, moins, plus])
      }
    }
    if (esquisse && sk)
      esquisserSuivante(
        m,
        p,
        s,
        esquisse,
        sk,
        travaille,
        // La nuit du vendredi au samedi rend le week-end travaillé (comme
        // `weekend()` de la règle 4 ; la veille du week-end réglé).
        siens
          .filter(
            (c) =>
              jourDe(c) === jourVeilleWeekend(R) &&
              estNuit(R.moments, c.moment),
          )
          .map(xv),
      )
  }
  // Horizon glissant : les personnes nécessaires chaque jour de la semaine
  // suivante, par groupe (accueil, poste à part). Un manque se paie
  // `POIDS_PREVISION_MANQUE` : la semaine écrite ne doit pas laisser la
  // suivante sans monde.
  // Un jour de présence ne tient qu'UNE place : une personne de plusieurs
  // groupes y est répartie (part continue par groupe, somme au plus son
  // jour) ; un jour d'école n'est pas une présence ; un shift gardé ne
  // compte que pour les groupes de son poste.
  const groupesSuivante = p.suivante?.groupes ?? []
  const parts = groupesSuivante.map(() =>
    Array.from({ length: 7 }, () => ({ termes: [] as Terme[], constante: 0 })),
  )
  for (const [id, e] of p.suivante?.personnes ?? []) {
    const sk = esquisses.get(id)
    if (!sk) continue
    for (let j = 0; j < 7; j++) {
      const v = sk.get(p.nbJours + j)
      if (!v || e.horsSite.has(j)) continue
      const garde = e.postesGardes.get(j)
      const siens = groupesSuivante
        .map((_, i) => i)
        .filter(
          (i) =>
            groupesSuivante[i].membres.has(id) &&
            (garde === undefined || groupesSuivante[i].postes.has(garde)),
        )
      if (!siens.length) continue
      if (siens.length === 1) {
        const cible = parts[siens[0]][j]
        if (v === 1) cible.constante++
        else cible.termes.push([1, v])
        continue
      }
      const ys = siens.map((i) => {
        const y = m.continu(0, 1)
        parts[i][j].termes.push([1, y])
        return [1, y] as Terme
      })
      if (v === 1) m.ajoute(ys, '<=', 1)
      else m.ajoute([...ys, [-1, v]], '<=', 0)
    }
  }
  groupesSuivante.forEach((g, i) => {
    for (let j = 0; j < 7; j++) {
      const { termes, constante } = parts[i][j]
      if (g.besoins[j] <= constante) continue
      const manqueJ = m.continu(0, g.besoins[j] - constante)
      m.ajoute([[1, manqueJ], ...termes], '>=', g.besoins[j] - constante)
      m.cout(POIDS_PREVISION_MANQUE, manqueJ)
    }
  })

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
  // L'équipe du matin arrive à l'ouverture (`POIDS_ARRIVEE_MATIN_MINUTE`).
  const ouvertureDe = new Map<string, number>()
  for (const o of p.ouvertures ?? [])
    ouvertureDe.set(`${o.poste}|${o.jour}`, o.debut)
  if (ouvertureDe.size) {
    for (const [k, v] of x) {
      const c = creneaux.get(scinder(k)[1])
      if (!c) continue
      const cout = coutArriveeMatin(c, ouvertureDe, R.moments)
      if (cout > 0) m.cout(cout, v)
    }
  }
  // Petit bruit : à qualité égale, chaque graine donne une autre simulation.
  // Pas à l'affinage : l'objectif d'origine y est borné par celui du calcul,
  // qui contient déjà son bruit (positif) ; sans bruit, le planning du
  // calcul tient donc sous la borne.
  if (p.graine && !options.affiner) {
    for (const v of x.values()) m.cout(Math.floor(hasard() * 4), v)
  }
  if (options.affiner) {
    // L'objectif d'origine ne dépasse pas la borne…
    m.ajoute(
      [...m.objectif].map(([v, c]) => [c, v] as Terme),
      '<=',
      options.affiner.borne,
    )
    // … et chaque horaire de plus qu'une personne fait à l'accueil coûte.
    for (const s of p.salaries) {
      const parHoraire = new Map<string, Map<number, Terme[]>>()
      for (const c of p.creneaux) {
        if (!c.accueil || c.typeShift === null) continue
        const v = x.get(cle(s.id, c.id))
        if (!v) continue
        const parJour =
          parHoraire.get(c.typeShift) ?? new Map<number, Terme[]>()
        const j = jourDe(c)
        parJour.set(j, [...(parJour.get(j) ?? []), [1, v]])
        parHoraire.set(c.typeShift, parJour)
      }
      if (parHoraire.size < 2) continue
      for (const parJour of parHoraire.values()) {
        const u = m.continu(0, 1)
        for (const termes of parJour.values())
          m.ajoute([...termes, [-1, u]], '<=', 0)
        m.cout(POIDS_AFFINAGE_HORAIRE, u)
      }
    }
  }

  return {
    modele: m,
    x,
    manque,
    ecarts,
    trous,
    ouvertures,
    releves,
    passations,
    minimums,
    sousContrat,
    jfrs,
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
  const R = p.regles ?? REGLES_PAR_DEFAUT
  // Ce que l'établissement répartit (2026-11-06) ; l'hôtel : week-ends,
  // soirs, matins tôt, dans cet ordre (le modèle d'avant au caractère près).
  const lineaires: Array<
    readonly [(c: Creneau) => boolean, (s: SalarieSolveur) => number]
  > = []
  if (repartit(R, 'soirs'))
    lineaires.push([(c) => c.soir, (s) => s.equiteAvant.soirs])
  if (repartit(R, 'matins_tot'))
    lineaires.push([(c) => c.matinTot, (s) => s.equiteAvant.matinsTot])
  if (repartit(R, 'nuits'))
    lineaires.push([
      (c) => estNuit(R.moments, c.moment),
      (s) => s.equiteAvant.nuits ?? 0,
    ])
  for (const membres of groupes.values()) {
    if (membres.length < 2) continue
    if (repartit(R, 'weekends'))
      weekendsEquitables(m, p, membres, travailleDe, nbSemaines)
    for (const [garde, avant] of lineaires) {
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
  const jours = (p.regles ?? REGLES_PAR_DEFAUT).equite.weekendJours
  const n = membres.map((s) => {
    const termes: Terme[] = []
    const travaille = travailleDe.get(s.id) ?? new Map<number, string>()
    for (let k = 0; k < nbSemaines; k++) {
      const vars = jours
        .map((j) => 7 * k + j)
        .filter((j) => j < p.nbJours)
        .map((j) => travaille.get(j))
        .filter((v): v is string => !!v)
      if (vars.length === 1) termes.push([1, vars[0]])
      else if (vars.length >= 2) {
        // we = un jour du week-end OU l'autre (samedi OU dimanche).
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

/** Une somme de termes réutilisée plusieurs fois : une variable continue
 * égale à la somme (même substitution que les AGRÉGATS DE L'ACCUEIL). */
/** Horizon glissant (2026-11-04) : les règles de l'esquisse de la semaine
 * suivante pour une personne. Les jours d'affilée qui la traversent sont
 * écrits avec les autres (fenêtres de 7 jours, `fin`). Ici : au plus 6
 * jours (R-SIX-JOURS-MAX), le 6e coûte (R-REPOS-HEBDO-HCR), le rythme de
 * 5 jours (`attendus`), et la règle 4 couplée : sans week-end libre les 2
 * semaines d'avant, le week-end du calcul OU celui d'après doit l'être. */
function esquisserSuivante(
  m: Modele,
  p: Probleme,
  s: SalarieSolveur,
  e: SuivantePersonne,
  sk: ReadonlyMap<number, string | 1>,
  travaille: ReadonlyMap<number, string>,
  nuitVendredi: readonly string[],
): void {
  const termes: Terme[] = []
  let constante = 0
  for (const v of sk.values()) {
    if (v === 1) constante++
    else termes.push([1, v])
  }
  if (termes.length) {
    m.ajoute(termes, '<=', Math.max(s.joursTravaillesMaxSemaine - constante, 0))
    if (s.joursPreferesSemaine < s.joursTravaillesMaxSemaine) {
      const six = m.entier(0, 7)
      m.ajoute(
        [[1, six], ...negatifs(termes)],
        '>=',
        constante - s.joursPreferesSemaine,
      )
      m.cout(POIDS_SIXIEME_JOUR, six)
    }
  }
  if (e.attendus > constante) {
    const ecart = m.entier(0, 7)
    m.ajoute([[1, ecart], ...termes], '>=', e.attendus - constante)
    m.cout(POIDS_JOUR_MANQUANT, ecart)
  }
  if (e.weekendLibreAvant !== false) return
  // Week-end du calcul (samedi 5, dimanche 6 à l'hôtel ; l'école compte
  // travaillée) et week-end d'après (nbJours + 5, + 6).
  const WE = (p.regles ?? REGLES_PAR_DEFAUT).equite.weekendJours
  const cote = (
    jours: number[],
    valeur: (j: number) => string | 1 | undefined,
  ) => {
    const vars: string[] = []
    for (const j of jours) {
      const v = valeur(j)
      if (v === 1) return 1
      if (v) vars.push(v)
    }
    if (!vars.length) return 0
    const we = m.continu(0, 1)
    for (const v of vars)
      m.ajoute(
        [
          [1, we],
          [-1, v],
        ],
        '>=',
        0,
      )
    return we
  }
  const ici = cote([...WE, -1], (j) =>
    j === -1
      ? undefined
      : s.joursHorsSite.has(j) || e.nonLibresIci.has(j)
        ? 1
        : travaille.get(j),
  )
  // La nuit du vendredi s'ajoute aux termes du week-end du calcul.
  const iciTout =
    ici === 1 || !nuitVendredi.length
      ? ici
      : (() => {
          const we = m.continu(0, 1)
          if (ici !== 0)
            m.ajoute(
              [
                [1, we],
                [-1, ici],
              ],
              '>=',
              0,
            )
          for (const v of nuitVendredi)
            m.ajoute(
              [
                [1, we],
                [-1, v],
              ],
              '>=',
              0,
            )
          return we
        })()
  const apres = cote(
    WE.map((j) => p.nbJours + j),
    (j) => (e.nonLibres.has(j - p.nbJours) ? 1 : sk.get(j)),
  )
  if (iciTout === 0 || apres === 0) return
  if (iciTout === 1 && apres === 1) return
  const w = m.continu(0, 1)
  const t: Terme[] = [[1, w]]
  let rhs = -1
  for (const c of [iciTout, apres]) {
    if (c === 1) rhs += 1
    else if (typeof c === 'string') t.push([-1, c])
  }
  m.ajoute(t, '>=', rhs)
  m.cout(POIDS_WEEKEND_LIBRE, w)
}

function sommeDe(m: Modele, termes: Terme[]): Terme[] {
  if (termes.length <= 1) return termes
  const v = m.continu(0, termes.length)
  m.ajoute([...termes, [-1, v]], '=', 0)
  return [[1, v]]
}

const negatifs = (t: Terme[]): Terme[] => t.map(([c, v]) => [-c, v] as Terme)

/**
 * Règles morales d'une semaine `k` d'une personne (PRD, partie 4) :
 *   - 8 (confort) : un jour de semaine de repos la semaine d'avant devient
 *     travaillé : `POIDS_MEMES_REPOS`, sauf si la personne, après un
 *     week-end travaillé, a cette fois le samedi et le dimanche libres ;
 *   - 4 : aucun week-end libre les 3 semaines d'avant (`weekendLibreAvant`
 *     faux) et la semaine n'en donne pas : `POIDS_WEEKEND_LIBRE` ;
 *   - 13 : la reprise après un congé (`retourConge`) tombe un samedi ou un
 *     dimanche : `POIDS_RETOUR_WEEKEND` ;
 *   - 6 : plus d'un changement de moment d'un jour au suivant dans la
 *     semaine (`POIDS_MOMENT_EN_TROP` par changement en trop) ; un jour à un moment plus tôt qu'un des deux jours
 *     d'avant (soir puis matin) : `POIDS_MOMENT_ARRIERE` par paire.
 * Les règles qui lisent la semaine d'avant ne jouent que sur la première
 * semaine du calcul.
 */
function reglesMoralesSemaine(
  m: Modele,
  R: RegleEtablissement,
  s: SalarieSolveur,
  k: number,
  jours: number[],
  siens: Creneau[],
  travaille: Map<number, string>,
  xv: (c: Creneau) => string,
  estImpose: (c: Creneau) => boolean,
): void {
  const dans = new Set(jours)
  // Les jours du week-end de l'établissement (samedi 5, dimanche 6 à
  // l'hôtel, 2026-11-06) : tous dans la semaine, aucun hors du site.
  const WE = R.equite.weekendJours
  const weekendEntier = WE.every((j) => dans.has(j) && !s.joursHorsSite.has(j))
  const veille = jourVeilleWeekend(R)
  // La nuit du vendredi au samedi rend le week-end travaillé (2026-11-03,
  // comme celle du dimanche, Q15) : on finit le samedi matin.
  // Écrite seulement quand une règle du week-end la lit (même modèle sinon).
  let nuitVendredi: Terme[] | null = null
  const weekend = (): Terme[] => {
    nuitVendredi ??= sommeDe(
      m,
      siens
        .filter((c) => jourDe(c) === veille && estNuit(R.moments, c.moment))
        .map((c) => [1, xv(c)] as Terme),
    )
    return [
      ...WE.map((j) => travaille.get(j))
        .filter((v): v is string => !!v)
        .map((t) => [1, t] as Terme),
      ...nuitVendredi,
    ]
  }
  if (k === 0) {
    // Règle 8, neutre pour le week-end (banc du 2026-11-03) : qui a
    // travaillé le week-end d'avant peut garder ses repos de la semaine OU
    // les passer au samedi et dimanche sans coût. Sans cela, un repos en
    // semaine devenait « collant » et la personne ne quittait plus le
    // travail du week-end (rotation des week-ends, règle 10).
    const repris = [...s.reposAvant]
      .filter((j) => dans.has(j))
      .map((j) => travaille.get(j))
      .filter((v): v is string => !!v)
    if (repris.length && s.weekendTravailleAvant && weekendEntier) {
      // wl <= 1 - t(samedi), wl <= 1 - t(dimanche) : week-end libre.
      const wl = m.continu(0, 1)
      for (const t of weekend()) m.ajoute([[1, wl], t], '<=', 1)
      // y >= somme des repos repris - n x wl : tout coûte, sauf contre un
      // week-end libre.
      const y = m.continu(0, repris.length)
      m.ajoute(
        [[1, y], ...repris.map((t) => [-1, t] as Terme), [repris.length, wl]],
        '>=',
        0,
      )
      m.cout(POIDS_MEMES_REPOS, y)
    } else for (const t of repris) m.cout(POIDS_MEMES_REPOS, t)
    // Week-end : samedi (5) et dimanche (6) de la première semaine. Une
    // semaine type qui fixe le week-end ne l'exempte plus (partage d'abord,
    // décision utilisateur du 2026-11-03 ; `weekendLibere` lève ses repos et
    // jours fixes cette semaine-là).
    if (s.weekendLibreAvant === false && weekendEntier) {
      const ts = weekend()
      if (ts.length === 1 && ts[0][0] === 1)
        m.cout(POIDS_WEEKEND_LIBRE, ts[0][1])
      else if (ts.length) {
        const we = m.continu(0, 1)
        for (const t of ts) m.ajoute([[1, we], ...negatifs([t])], '>=', 0)
        m.cout(POIDS_WEEKEND_LIBRE, we)
      }
    }
    if (s.retourConge !== null) {
      const r = s.retourConge
      // Jours de semaine du retour avant un jour `wd` du week-end.
      const avantDe = (wd: number): Terme[] => {
        const t: Terme[] = []
        for (let j = r; j < wd; j++) {
          const v = travaille.get(j)
          if (v && dans.has(j) && !WE.includes(j)) t.push([1, v])
        }
        return t
      }
      const fin = WE.filter((j) => j >= r && dans.has(j)).flatMap((j) => {
        const v = travaille.get(j)
        return v ? [[j, v] as const] : []
      })
      if (fin.length) {
        const w = m.continu(0, 1)
        // w >= t(week-end) - Σ t(jours de semaine du retour)
        for (const [j, t] of fin)
          m.ajoute([[1, w], [-1, t], ...avantDe(j)], '>=', 0)
        m.cout(POIDS_RETOUR_WEEKEND, w)
      }
    }
  }

  // Règle 6 : les moments de la semaine, jour par jour.
  const parRang = new Map<number, Map<number, Terme[]>>()
  for (const c of siens) {
    const j = jourDe(c)
    if (c.moment === null || !dans.has(j)) continue
    // Rang d'un moment dans la journée (`ordre`) : une semaine stable va
    // vers plus tard (règle 6 du PRD : du matin vers le soir se supporte
    // mieux que l'inverse).
    const r = rangMoment(R.moments, c.moment)
    const duJour = parRang.get(j) ?? new Map<number, Terme[]>()
    parRang.set(j, duJour)
    duJour.set(r, [...(duJour.get(r) ?? []), [1, xv(c)]])
  }
  const rangs = [
    ...new Set([...parRang.values()].flatMap((d) => [...d.keys()])),
  ].sort((a, b) => a - b)
  if (rangs.length < 2) return
  // Une semaine faite de shifts posés ne se discute pas.
  if (siens.filter((c) => dans.has(jourDe(c))).every(estImpose)) return
  for (const duJour of parRang.values())
    for (const [r, t] of duJour) duJour.set(r, sommeDe(m, t))
  const de = (j: number, garde: (r: number) => boolean): Terme[] =>
    [...(parRang.get(j) ?? [])].flatMap(([r, t]) => (garde(r) ? t : []))
  // Changements de moment d'un jour au suivant (deux jours travaillés qui
  // se suivent) : change >= Σ x(j, rang r) + Σ x(j + 1, autre rang) - 1,
  // pour chaque r ; au-delà de `CHANGEMENTS_MOMENT_MAX` dans la semaine, un
  // coût par changement. Compter les moments distincts de la semaine (un
  // maximum par moment), essayé d'abord, laissait une vraie semaine au
  // plafond de 40 s.
  const changes: string[] = []
  for (const j of jours) {
    if (!jours.includes(j + 1)) continue
    const contraintes: Terme[][] = []
    for (const r of rangs) {
      const ici = de(j, (q) => q === r)
      const autre = de(j + 1, (q) => q !== r)
      if (ici.length && autre.length) contraintes.push([...ici, ...autre])
    }
    if (!contraintes.length) continue
    const change = m.continu(0, 1)
    for (const t of contraintes)
      m.ajoute([[1, change], ...negatifs(t)], '>=', -1)
    changes.push(change)
  }
  if (changes.length > R.repos.changementsMomentMax) {
    const exces = m.continu(0, changes.length)
    m.ajoute(
      [[1, exces], ...changes.map((c) => [-1, c] as Terme)],
      '>=',
      -R.repos.changementsMomentMax,
    )
    m.cout(POIDS_MOMENT_EN_TROP, exces)
  }
  // Retour en arrière : le jour k à un moment plus tôt que le jour j, au
  // plus `MOMENT_ARRIERE_JOURS` jours avant (au-delà, plusieurs jours de
  // repos remettent l'horloge à zéro). Une variable par paire de jours :
  // arriere >= Σ x(j, rang >= r) + Σ x(k, rang < r) - 1, pour chaque r. Une
  // chaîne sur toute la semaine, essayée d'abord, multipliait le temps de
  // calcul d'une vraie semaine par cinq (7 s -> 40 s, le plafond).
  for (const j of jours) {
    for (
      let k = j + 1;
      k <= j + R.repos.momentArriereJours && jours.includes(k);
      k++
    ) {
      const contraintes: Terme[][] = []
      for (const r of rangs.slice(1)) {
        const tard = de(j, (q) => q >= r)
        const tot = de(k, (q) => q < r)
        if (tard.length && tot.length) contraintes.push([...tard, ...tot])
      }
      if (!contraintes.length) continue
      const arriere = m.continu(0, 1)
      for (const t of contraintes)
        m.ajoute([[1, arriere], ...negatifs(t)], '>=', -1)
      m.cout(POIDS_MOMENT_ARRIERE, arriere)
    }
  }
}

/**
 * Règles morales qui suivent les jours d'une personne d'un bout à l'autre du
 * calcul, semaines voisines comprises (PRD, partie 4) :
 *   - 3 : deux services de deux jours qui se suivent séparés de moins de
 *     `REPOS_CONFORT` : `POIDS_REPOS_COURT` (plus `POIDS_RETOUR_REPOS_COURT`
 *     la semaine du retour d'un congé). Une variable par heure de fin d'un
 *     jour (les services du lendemain trop tôt en dépendent) ; un shift par
 *     jour, donc y >= Σ x(fin) + Σ x(lendemain trop tôt) - 1 ;
 *   - 7 : plus de `NUITS_AFFILEES_MAX` nuits d'affilée (`POIDS_NUIT_AFFILEE`
 *     par nuit en trop et par fenêtre) ; un service de jour moins de
 *     `REPOS_APRES_NUITS` jours après une nuit (`POIDS_REPRISE_APRES_NUIT`) ;
 *   - 14 : la veille d'un jour d'école, un service qui finit après
 *     `ECOLE_VEILLE_FIN` ; le lendemain, un service qui commence avant
 *     `ECOLE_LENDEMAIN_DEBUT` (`POIDS_ECOLE_ABORDS`).
 */
function reglesMoralesSuite(
  m: Modele,
  R: RegleEtablissement,
  p: Probleme,
  s: SalarieSolveur,
  siens: Creneau[],
  parJour: Map<number, Creneau[]>,
  travaille: Map<number, string>,
  xv: (c: Creneau) => string,
  estImpose: (c: Creneau) => boolean,
): void {
  const REPOS_CONFORT = R.repos.reposConfort
  const NUITS_AFFILEES_MAX = R.repos.nuitsAffileesMax
  const REPOS_APRES_NUITS = R.repos.reposApresNuits
  const poidsCourt =
    POIDS_REPOS_COURT + (s.retourConge !== null ? POIDS_RETOUR_REPOS_COURT : 0)
  for (const [j, liste] of parJour) {
    const suivants = parJour.get(j + 1)
    if (!suivants) continue
    const parFin = new Map<number, Creneau[]>()
    for (const a of liste) parFin.set(a.fin, [...(parFin.get(a.fin) ?? []), a])
    for (const [fin, as] of parFin) {
      // Sous 11 h, la paire est déjà interdite (règle dure) : seuls les
      // services du lendemain entre 11 h et 12 h après comptent.
      const bs = suivants.filter((b) => b.debut - fin < REPOS_CONFORT)
      if (!bs.length || (as.every(estImpose) && bs.every(estImpose))) continue
      const y = m.continu(0, as.length + bs.length)
      m.ajoute(
        [
          ...as.map((a) => [1, xv(a)] as Terme),
          ...bs.map((b) => [1, xv(b)] as Terme),
          [-1, y],
        ],
        '<=',
        1,
      )
      m.cout(poidsCourt, y)
    }
  }
  for (const c of siens) {
    if (estImpose(c)) continue
    const court =
      (s.finServicePrecedent !== null &&
        c.debut - s.finServicePrecedent < REPOS_CONFORT) ||
      (s.debutServiceSuivant !== null &&
        s.debutServiceSuivant - c.fin < REPOS_CONFORT)
    if (court) m.cout(poidsCourt, xv(c))
    const j = jourDe(c)
    const finMax = s.finAvantEcole.get(j)
    if (finMax !== undefined && c.fin > finMax)
      m.cout(POIDS_ECOLE_ABORDS, xv(c))
    const debutMin = s.debutApresEcole.get(j)
    if (debutMin !== undefined && c.debut < debutMin)
      m.cout(POIDS_ECOLE_ABORDS, xv(c))
  }

  // Règle 7 : les nuits.
  const nuits = new Map<number, Terme[]>()
  for (const c of siens) {
    if (!estNuit(R.moments, c.moment)) continue
    const j = jourDe(c)
    nuits.set(j, [...(nuits.get(j) ?? []), [1, xv(c)]])
  }
  if (!nuits.size && !s.nuitsAvant.size) return
  for (const [j, t] of nuits) nuits.set(j, sommeDe(m, t))
  const taille = NUITS_AFFILEES_MAX + 1
  for (let a = 1 - taille; a + taille <= p.nbJours; a++) {
    const termes: Terme[] = []
    let constante = 0
    for (let d = a; d < a + taille; d++) {
      if (d < 0) constante += s.nuitsAvant.has(d) ? 1 : 0
      else termes.push(...(nuits.get(d) ?? []))
    }
    if (!termes.length) continue
    const possibles = constante + new Set(termes.map(([, v]) => v)).size
    if (possibles <= NUITS_AFFILEES_MAX) continue
    const exces = m.continu(0, taille)
    m.ajoute(
      [[1, exces], ...negatifs(termes)],
      '>=',
      constante - NUITS_AFFILEES_MAX,
    )
    m.cout(POIDS_NUIT_AFFILEE, exces)
  }
  for (let k = 0; k < p.nbJours; k++) {
    const t = travaille.get(k)
    if (!t) continue
    // Service de jour ce jour-là : t(k) - nuits(k).
    const jour: Terme[] = [[1, t], ...negatifs(nuits.get(k) ?? [])]
    // Les nuits des jours d'avant : une constante (semaine d'avant) ou les
    // termes du jour.
    const avant: Array<Terme[] | null> = []
    for (let d = k - REPOS_APRES_NUITS; d < k; d++) {
      if (d < 0) {
        if (s.nuitsAvant.has(d)) avant.push(null)
      } else {
        const n = nuits.get(d)
        if (n) avant.push(n)
      }
    }
    if (!avant.length) continue
    const reprise = m.continu(0, 1)
    for (const n of avant) {
      if (n === null) m.ajoute([[1, reprise], ...negatifs(jour)], '>=', 0)
      else m.ajoute([[1, reprise], ...negatifs(n), ...negatifs(jour)], '>=', -1)
    }
    m.cout(POIDS_REPRISE_APRES_NUIT, reprise)
  }
}

/** Règle 12 du PRD : coût par minute au-delà du contrat de chacun, selon
 * ses heures en plus des 4 semaines d'avant (`equiteAvant.minutesEnPlus`)
 * comparées au moins chargé de son groupe d'équité, chacun ramené à sa part
 * (ses heures de contrat sur celles du groupe), comme les soirs. Rien pour
 * un contrat indicatif ni pour un groupe d'une personne. */
export function coefsHeuresPlus(p: Probleme): Map<string, number> {
  const r = new Map<string, number>()
  const groupes = new Map<string, SalarieSolveur[]>()
  for (const s of p.salaries) {
    if (s.groupeEquite === null || s.contratIndicatif) continue
    groupes.set(s.groupeEquite, [...(groupes.get(s.groupeEquite) ?? []), s])
  }
  for (const membres of groupes.values()) {
    if (membres.length < 2) continue
    const heures = membres.reduce(
      (t, s) => t + Math.max(0, s.minutesHebdoContrat),
      0,
    )
    const fait = membres.reduce(
      (t, s) => t + (s.equiteAvant.minutesEnPlus ?? 0),
      0,
    )
    if (fait <= 0) continue
    const avance = (s: SalarieSolveur) =>
      ((s.equiteAvant.minutesEnPlus ?? 0) -
        (heures > 0
          ? (Math.max(0, s.minutesHebdoContrat) / heures) * fait
          : 0)) /
      60
    const moins = Math.min(...membres.map(avance))
    for (const s of membres) {
      const coef =
        Math.round(
          POIDS_EQUITE_HEURES_PLUS *
            Math.min(EQUITE_HEURES_PLUS_MAX, avance(s) - moins) *
            1000,
        ) / 1000
      if (coef > 0) r.set(s.id, coef)
    }
  }
  return r
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
 *   - présences : tous les créneaux du poste (besoin, remplaçant, version
 *     étoile, middle, shift posé), quel que soit le jour où ils sont écrits
 *     (la nuit de la veille couvre le petit matin), sur leurs vraies heures.
 * Une variable par suite de quarts d'heure où les mêmes créneaux couvrent :
 *   Σ x(autonomes qui couvrent) + trou >= 1
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
  termesDe: (c: Creneau, quoi: 'autonomes') => Terme[],
  continuite?: (couvrants: Creneau[]) => number,
): Array<Trou & { v: string }> {
  // Postes à part comptés (un besoin `b…` au matin ou au soir) ; un
  // candidat de l'accueil n'en fait pas un (ses trous sont plus bas).
  const L = momentsDe(p)
  const postes = new Set(
    p.creneaux
      .filter(
        (c) => !c.accueil && c.presence.some((q) => deJourAuTableau(L, q)),
      )
      .map((c) => c.poste),
  )
  const r: Array<Trou & { v: string }> = []
  for (const poste of postes) {
    const duPoste = p.creneaux.filter((c) => c.poste === poste)
    const parJour = new Map<number, Creneau[]>()
    for (const c of duPoste) {
      // Un besoin souhaité (2026-11-05) ne fait pas la plage du poste.
      if (c.ferme || c.place !== null || c.effectif <= 0 || c.souhaite) continue
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
          termesDe,
          poste,
          jour,
          debut,
          fin,
          duPoste,
          POIDS_TROU_QUART,
          0,
          Infinity,
          continuite,
        ),
      )
    }
  }
  // Chaque zone tenue en continu (D15, 2026-11-06 : par zone) : ses postes
  // ensemble, du premier au dernier moment demandé du jour, d'un veilleur à
  // l'autre quand la nuit est demandée (`plageAccueil`, la même définition
  // que l'oracle).
  for (const vue of vuesZones(p)) {
    if (!vue.zone.continue) continue
    r.push(...trousDeZone(m, p, vue.p, x, termesDe, vue.zone.id, continuite))
  }
  return r
}

/** Les trous d'une zone (`trousEntreEquipes`) : `q` est le problème vu de
 * la zone (`vuesZones`), `p` le problème entier. */
function trousDeZone(
  m: Modele,
  p: Probleme,
  q: Probleme,
  x: Map<string, string>,
  termesDe: (c: Creneau, quoi: 'autonomes') => Terme[],
  zone: string,
  continuite?: (couvrants: Creneau[]) => number,
): Array<Trou & { v: string }> {
  const r: Array<Trou & { v: string }> = []
  const L = momentsDe(p)
  const poste = posteDeZone(zone, (p.regles ?? REGLES_PAR_DEFAUT).zones[0].id)
  const candidats = q.creneaux.filter((c) => c.accueil)
  if (candidats.length) {
    const postesAccueil = new Set(candidats.map((c) => c.poste))
    const tenus = p.creneaux.filter((c) => postesAccueil.has(c.poste))
    const nuitDemandee = (j: number) =>
      q.consignes.some(
        (k) => k.jour === j && estNuit(L, k.periode) && k.minimum > 0,
      )
    const jours = [...new Set(candidats.map(jourDe))].sort((a, b) => a - b)
    for (const jour of jours) {
      const demandes = new Set(
        q.consignes
          .filter((k) => k.jour === jour && k.minimum > 0)
          .map((k) => k.periode),
      )
      const plage = plageAccueil(
        candidats.filter((c) => jourDe(c) === jour),
        demandes,
        nuitDeLaVeille(candidats, jourDe, jour, nuitDemandee, L),
        L,
      )
      if (!plage) continue
      // Personne seule : jusqu'à l'arrivée possible la plus TÔT du veilleur
      // (relecture du 2026-11-05) ; ensuite, un veilleur seul est la règle
      // (un seul veilleur la nuit), il ne se paie pas.
      const nuitsDuJour = candidats.filter(
        (c) =>
          jourDe(c) === jour &&
          c.presence.some((q) => estNuit(L, q) && demandes.has(q)),
      )
      const finSeul = nuitsDuJour.length
        ? Math.min(...nuitsDuJour.map((c) => c.debut))
        : plage.fin
      r.push(
        ...variablesTrous(
          m,
          p,
          x,
          termesDe,
          poste,
          jour,
          plage.debut,
          plage.fin,
          tenus,
          POIDS_TROU_QUART,
          POIDS_SEUL_QUART,
          finSeul,
          continuite,
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
  termesDe: (c: Creneau, quoi: 'autonomes') => Terme[],
): Array<{ jour: number; v: string }> {
  // Zone par zone, chacune sa relève (2026-11-06).
  return vuesZones(p).flatMap((v) => relevesDeZone(m, v.p, termesDe))
}

function relevesDeZone(
  m: Modele,
  p: Probleme,
  termesDe: (c: Creneau, quoi: 'autonomes') => Terme[],
): Array<{ jour: number; v: string }> {
  const duree = p.releveMinutes ?? 0
  if (duree <= 0) return []
  const k = Math.ceil(duree / QUART)
  const r: Array<{ jour: number; v: string }> = []
  for (const { jour, quarts, matins, soirs } of zonesReleve(p)) {
    const presents = (liste: Creneau[], a: number): Terme[] => {
      const t: Terme[] = []
      for (const c of liste) {
        if (c.debut > a || c.fin < a + QUART) continue
        t.push(...termesDe(c, 'autonomes'))
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

/**
 * Passation avec le veilleur (`POIDS_PASSATION`), la MÊME règle que l'oracle
 * (`transmissions`, verificateur.ts), qui juge des PRÉSENCES :
 *   - soir : le dernier du soir part à l'arrivée du PREMIER veilleur ou
 *     après (max des fins du soir >= min des débuts de nuit) ;
 *   - matin : le premier du matin arrive au départ du DERNIER veilleur ou
 *     avant (max des fins de nuit >= min des débuts du matin).
 * Pour chaque créneau de nuit n d'une zone (`zonesPassation`), avec
 * t(n) = « n est tenu » (0/1, borne × t >= ceux qui le tiennent) :
 *   manque >= t(n) - Σ relais de n - Σ nuits de la zone qui la précèdent
 *   (soir : arrivée plus tôt ; matin : départ plus tard).
 * Une nuit plus tardive est donc excusée par une plus tôt tenue, comme le
 * min de l'oracle ; deux veilleurs sur la même nuit n'en font qu'une. Le
 * lundi matin, la nuit du dimanche d'avant est un fait
 * (`Probleme.veilleDuLundi`). Un manque par zone, entre 0 et 1. Ajouter
 * quelqu'un de jour ne crée jamais de manque ; ajouter un veilleur en crée
 * au plus deux (`pireMoral`).
 */
function passationsVeilleur(
  m: Modele,
  p: Probleme,
  termesDe: (c: Creneau, quoi: 'autonomes') => Terme[],
  borne: (c: Creneau) => number,
  coutDe: (z: ZonePassation) => number = () => POIDS_PASSATION,
): Array<Passation & { v: string }> {
  const r: Array<Passation & { v: string }> = []
  const tenu = new Map<string, Terme[]>()
  const tenuDe = (n: Creneau): Terme[] => {
    const deja = tenu.get(n.id)
    if (deja) return deja
    const termes = termesDe(n, 'autonomes')
    const k = borne(n)
    let t: Terme[] = []
    if (termes.length === 1 && k <= 1) t = termes
    else if (termes.length && k > 0) {
      const b = m.bool()
      m.ajoute([[k, b], ...termes.map(([q, w]) => [-q, w] as Terme)], '>=', 0)
      t = [[1, b]]
    }
    tenu.set(n.id, t)
    return t
  }
  const moins = (cs: Creneau[]): Terme[] =>
    cs.flatMap((c) =>
      termesDe(c, 'autonomes').map(([q, w]) => [-q, w] as Terme),
    )
  for (const z of zonesPassation(p)) {
    // manque >= tenu - relais - nuits d'avant ; tenu = 1 pour la veille.
    const lignes: Array<{ termes: Terme[]; tenue: number }> = []
    if (z.veille !== null)
      lignes.push({ termes: moins(z.relais(z.veille)), tenue: 1 })
    for (const n of z.nuits) {
      const t = tenuDe(n)
      if (!t.length) continue
      lignes.push({
        termes: [...t, ...moins(z.relais(n)), ...moins(z.avant(n))],
        tenue: 0,
      })
    }
    if (!lignes.length) continue
    const v = m.continu(0, 1)
    for (const { termes, tenue } of lignes)
      m.ajoute(
        [[1, v], ...termes.map(([q, w]) => [-q, w] as Terme)],
        '>=',
        tenue,
      )
    m.cout(coutDe(z), v)

    r.push({ jour: z.jour, cote: z.cote, v })
  }
  return r
}

/** Une zone de passation avec le veilleur (`zonesPassation`). */
export interface ZonePassation {
  /** La zone (2026-11-06). */
  zone: string
  /** Jour où la nuit est écrite (-1 : le dimanche d'avant, côté départ). */
  jour: number
  cote: CotePassation
  /** Créneaux de nuit de l'accueil de ce jour (vide pour le dimanche
   * d'avant, qui est `veille`). */
  nuits: Creneau[]
  /** Le lundi matin : la nuit du dimanche d'avant (fait), sinon null. */
  veille: Pick<Creneau, 'debut' | 'fin'> | null
  /** Les créneaux de jour qui relaient une nuit : soir fini à son arrivée
   * ou après, matin arrivé à son départ ou avant. */
  relais: (n: Pick<Creneau, 'debut' | 'fin'>) => Creneau[]
  /** Les nuits de la zone qui l'excusent si elles sont tenues : arrivée
   * plus tôt (soir), départ plus tard (matin). */
  avant: (n: Creneau) => Creneau[]
}

/** Les passations à tenir avec le veilleur, par jour où une nuit de
 * l'accueil est écrite et par côté, seulement si le moment de jour qui la
 * relaie est demandé (chiffre du soir de ce jour, du matin du lendemain),
 * comme la relève : un soir non demandé n'est pas ajouté pour elle. Le
 * dernier matin (lendemain dans la semaine suivante) n'est pas cherché ; le
 * lundi matin l'est, face à `Probleme.veilleDuLundi`. */
export function zonesPassation(
  p: Pick<Probleme, 'creneaux' | 'nbJours' | 'consignes' | 'veilleDuLundi'> &
    Partial<Pick<Probleme, 'regles'>>,
): ZonePassation[] {
  // Zone par zone, chacune sa passation avec la nuit (2026-11-06).
  return vuesZones(p).flatMap((v) =>
    passationsDeZone(v.p, v.zone.id).map((z) => ({ ...z, zone: v.zone.id })),
  )
}

function passationsDeZone(
  p: Pick<Probleme, 'creneaux' | 'nbJours' | 'consignes' | 'veilleDuLundi'> &
    Partial<Pick<Probleme, 'regles'>>,
  zone: string,
): ZonePassation[] {
  // Règle de la zone : sans passation avec le veilleur, rien.
  if (!(p.regles ?? REGLES_PAR_DEFAUT).passations.passationVeilleur) return []
  const L = momentsDe(p)
  // Le premier moment de jour reprend la nuit, le dernier la lui passe (à
  // l'hôtel : le matin et le soir).
  const jourDuTableau = momentsDeJour(L)
  const premier = jourDuTableau[0] ?? null
  const dernier = jourDuTableau[jourDuTableau.length - 1] ?? null
  const deNuit = (c: Creneau) => c.presence.some((q) => estNuit(L, q))
  const postesAccueil = new Set(
    p.creneaux.filter((c) => c.accueil).map((c) => c.poste),
  )
  const deJour = p.creneaux.filter(
    (c) => postesAccueil.has(c.poste) && !deNuit(c),
  )
  const demande = (j: number, periode: string | null) =>
    periode !== null &&
    p.consignes.some(
      (k) => k.jour === j && k.periode === periode && k.minimum > 0,
    )
  const matinsDe = (j: number) =>
    deJour.filter(
      (c) =>
        jourDe(c) === j && premier !== null && c.presence.includes(premier),
    )
  const r: ZonePassation[] = []
  const veilles = p.veilleDuLundi ?? []
  if (veilles.length && demande(0, premier)) {
    const matins = matinsDe(0)
    const veille = {
      debut: Math.min(...veilles.map((c) => c.debut)),
      fin: Math.max(...veilles.map((c) => c.fin)),
    }
    if (matins.length)
      r.push({
        zone,
        jour: -1,
        cote: 'depart',
        nuits: [],
        veille,
        relais: (n) => matins.filter((c) => c.debut <= n.fin),
        avant: () => [],
      })
  }
  for (let jour = 0; jour < p.nbJours; jour++) {
    const nuits = p.creneaux.filter(
      (c) => postesAccueil.has(c.poste) && deNuit(c) && jourDe(c) === jour,
    )
    if (!nuits.length) continue
    const soirs = deJour.filter(
      (c) =>
        jourDe(c) === jour && dernier !== null && c.presence.includes(dernier),
    )
    if (soirs.length && demande(jour, dernier))
      r.push({
        zone,
        jour,
        cote: 'arrivee',
        nuits,
        veille: null,
        relais: (n) => soirs.filter((c) => c.fin >= n.debut),
        avant: (n) => nuits.filter((x) => x.debut < n.debut),
      })
    const matins = matinsDe(jour + 1)
    if (matins.length && demande(jour + 1, premier))
      r.push({
        zone,
        jour,
        cote: 'depart',
        nuits,
        veille: null,
        relais: (n) => matins.filter((c) => c.debut <= n.fin),
        avant: (n) => nuits.filter((x) => x.fin > n.fin),
      })
  }
  return r
}

/**
 * Règle 17 du PRD (demande utilisateur du 2026-11-03 : « éviter d'avoir des
 * hôteliers seuls le soir ; qu'ils restent ensemble le maximum possible, à
 * trente minutes près ; synchro comme le matin ; un changement de shift
 * parfait »). À l'accueil (`equipesAccueil`, personnes autonomes), chaque
 * jour, souple :
 *   - ARRIVÉES DU SOIR : y_t = « quelqu'un du soir commence à t » (0/1,
 *     y_t >= n_c / K) ; deux débuts pris à plus de `EQUIPE_TOLERANCE` l'un
 *     de l'autre étalent le soir : `POIDS_EQUIPE_ARRIVEE` UNE fois par jour
 *     (w >= y_t + y_u - 1 pour chaque telle paire) ;
 *   - DÉPARTS DU SOIR : la même chose sur les fins (`POIDS_EQUIPE_DEPART`) :
 *     personne ne reste seul la fin du soir ;
 *   - RELÈVE DE CHACUN (matin et soir demandés, `releveMinutes` > 0) :
 *     chaque personne du soir croise une personne du matin au moins le
 *     temps réglé (`POIDS_RELEVE_CHACUN`) :
 *       r_c >= n_c - K_c × Σ_{matins m qui la croisent assez} n_m.
 *     L'arrivée du soir suit donc les départs réels du matin, sans heure
 *     écrite en dur.
 * Le MATIN n'a pas de coût (« pour le matin c'est bien ») : l'ouverture de
 * 07:00 le regroupe déjà, et le même coût sur ses arrivées rendait une
 * semaine de l'hôtel de démo dix fois plus longue (6 s -> 60 s, le
 * plafond ; le soir seul : 11 s). Le vérificateur le signale quand même.
 * Une fenêtre fixe (premier début possible) a été essayée et écartée : elle
 * faisait payer une personne SEULE le soir et passait devant un trou.
 * Aucun horaire inventé. Même définition que l'oracle (`equipesDesynchro`,
 * verificateur.ts).
 */
function equipesSynchro(
  m: Modele,
  p: Probleme,
  termesDe: (c: Creneau, quoi: 'autonomes') => Terme[],
  borne: (c: Creneau) => number,
): void {
  // Zone par zone, chacune sa tolérance et sa relève (2026-11-06).
  for (const v of vuesZones(p)) equipesDeZone(m, v.p, termesDe, borne)
}

function equipesDeZone(
  m: Modele,
  p: Probleme,
  termesDe: (c: Creneau, quoi: 'autonomes') => Terme[],
  borne: (c: Creneau) => number,
): void {
  const R = p.releveMinutes ?? 0
  const EQUIPE_TOLERANCE = (p.regles ?? REGLES_PAR_DEFAUT).passations
    .equipeTolerance
  /** Une heure (début ou fin) prise par quelqu'un : y_t >= n_c / K. Deux

   * heures prises à plus de la tolérance l'une de l'autre : le jour est
   * étalé, `poids` une fois (w >= y_t + y_u - 1 pour chaque paire). */
  const etalement = (
    liste: Creneau[],
    heure: (c: Creneau) => number,
    poids: number,
  ) => {
    const parHeure = new Map<number, Creneau[]>()
    for (const c of liste)
      parHeure.set(heure(c), [...(parHeure.get(heure(c)) ?? []), c])
    const heures = [...parHeure.keys()].sort((a, b) => a - b)
    if (heures.length < 2 || heures.at(-1)! - heures[0] <= EQUIPE_TOLERANCE)
      return
    const y = new Map<number, string>()
    for (const t of heures) {
      const termes = parHeure.get(t)!.flatMap((c) => termesDe(c, 'autonomes'))
      const k = parHeure.get(t)!.reduce((n, c) => n + borne(c), 0)
      if (!termes.length || k <= 0) continue
      const v = m.bool()
      m.ajoute([[k, v], ...termes.map(([q, w]) => [-q, w] as Terme)], '>=', 0)
      y.set(t, v)
    }
    let w: string | null = null
    for (const [t, vt] of y)
      for (const [u, vu] of y) {
        if (u - t <= EQUIPE_TOLERANCE) continue
        if (!w) {
          w = m.continu(0, 1)
          m.cout(poids, w)
        }
        m.ajoute(
          [
            [1, w],
            [-1, vt],
            [-1, vu],
          ],
          '>=',
          -1,
        )
      }
  }
  for (const { avant: matins, apres: soirs, releve } of equipesAccueil(p)) {
    etalement(soirs, (c) => c.debut, POIDS_EQUIPE_ARRIVEE)
    etalement(soirs, (c) => c.fin, POIDS_EQUIPE_DEPART)
    if (!releve || R <= 0) continue
    for (const c of soirs) {
      const croisent = matins.filter(
        (d) => Math.min(d.fin, c.fin) - Math.max(d.debut, c.debut) >= R,
      )
      if (!croisent.length) continue
      const n = termesDe(c, 'autonomes')
      const k = borne(c)
      if (!n.length || k <= 0) continue
      const v = m.continu(0, k)
      m.ajoute(
        [
          [1, v],
          ...n.map(([q, w]) => [-q, w] as Terme),
          ...croisent.flatMap((d) =>
            termesDe(d, 'autonomes').map(([q, w]) => [k * q, w] as Terme),
          ),
        ],
        '>=',
        0,
      )
      m.cout(POIDS_RELEVE_CHACUN, v)
    }
  }
}

/** Les équipes de l'accueil, jour par jour et par paire de moments de jour
 * qui se suivent (règle 17) : les créneaux du moment d'avant pur
 * (`avant`, à l'hôtel le matin) et de celui d'après pur (`apres`, le soir)
 * des postes de l'accueil du jour (pas la nuit, pas le middle), et si la
 * relève se cherche ce jour-là (les deux moments demandés). */
export function equipesAccueil(
  p: Pick<Probleme, 'creneaux' | 'consignes' | 'nbJours'> &
    Partial<Pick<Probleme, 'regles'>>,
): Array<{
  jour: number
  moments: [string, string]
  avant: Creneau[]
  apres: Creneau[]
  releve: boolean
}> {
  return vuesZones(p).flatMap((v) => equipesUneZone(v.p))
}

function equipesUneZone(
  p: Pick<Probleme, 'creneaux' | 'consignes' | 'nbJours'> &
    Partial<Pick<Probleme, 'regles'>>,
): Array<{
  jour: number
  moments: [string, string]
  avant: Creneau[]
  apres: Creneau[]
  releve: boolean
}> {
  const L = momentsDe(p)
  const postesJour = new Set(
    p.creneaux
      .filter((c) => c.accueil && !c.presence.some((q) => estNuit(L, q)))
      .map((c) => c.poste),
  )
  const pur = (c: Creneau, moment: string) =>
    c.presence.length === 1 && c.presence[0] === moment
  const demande = (j: number, periode: string) =>
    p.consignes.some(
      (c) => c.jour === j && c.periode === periode && c.minimum > 0,
    )
  const r: Array<{
    jour: number
    moments: [string, string]
    avant: Creneau[]
    apres: Creneau[]
    releve: boolean
  }> = []
  const paires = pairesDeJour(L)
  for (let jour = 0; jour < p.nbJours; jour++) {
    const duJour = p.creneaux.filter(
      (c) => postesJour.has(c.poste) && jourDe(c) === jour,
    )
    for (const [a, b] of paires) {
      const avant = duJour.filter((c) => pur(c, a))
      const apres = duJour.filter((c) => pur(c, b))
      if (!avant.length && !apres.length) continue
      r.push({
        jour,
        moments: [a, b],
        avant,
        apres,
        releve: demande(jour, a) && demande(jour, b),
      })
    }
  }
  return r
}

/** Les jours où une relève se cherche : matin et soir demandés, des
 * horaires du matin et du soir aux postes de l'accueil du jour qui se
 * chevauchent ; les quarts d'heure (grille absolue) du chevauchement
 * possible. Partagé avec l'oracle. */
export function zonesReleve(
  p: Pick<Probleme, 'creneaux' | 'consignes' | 'nbJours' | 'releveMinutes'> &
    Partial<Pick<Probleme, 'regles'>>,
): Array<{
  jour: number
  quarts: number[]
  matins: Creneau[]
  soirs: Creneau[]
}> {
  return vuesZones(p).flatMap((v) => releveUneZone(v.p))
}

function releveUneZone(
  p: Pick<Probleme, 'creneaux' | 'consignes' | 'nbJours' | 'releveMinutes'> &
    Partial<Pick<Probleme, 'regles'>>,
): Array<{
  jour: number
  quarts: number[]
  matins: Creneau[]
  soirs: Creneau[]
}> {
  const duree = p.releveMinutes ?? 0
  if (duree <= 0) return []
  const L = momentsDe(p)
  const demande = (j: number, periode: string) =>
    p.consignes.some(
      (c) => c.jour === j && c.periode === periode && c.minimum > 0,
    )
  const postesJour = new Set(
    p.creneaux
      .filter((c) => c.accueil && !c.presence.some((q) => estNuit(L, q)))
      .map((c) => c.poste),
  )
  const pur = (c: Creneau, moment: string) =>
    c.presence.length === 1 && c.presence[0] === moment
  const r: Array<{
    jour: number
    quarts: number[]
    matins: Creneau[]
    soirs: Creneau[]
  }> = []
  const paires = pairesDeJour(L)
  for (let jour = 0; jour < p.nbJours; jour++) {
    for (const [a, b] of paires) {
      if (!demande(jour, a) || !demande(jour, b)) continue
      const duJour = p.creneaux.filter(
        (c) => postesJour.has(c.poste) && jourDe(c) === jour,
      )
      // `matins` : le moment d'avant de la paire, `soirs` celui d'après.
      const matins = duJour.filter((c) => pur(c, a))
      const soirs = duJour.filter((c) => pur(c, b))
      if (!matins.length || !soirs.length) continue
      const debut =
        Math.ceil(Math.min(...soirs.map((c) => c.debut)) / QUART) * QUART
      const fin = Math.max(...matins.map((c) => c.fin))
      const quarts: number[] = []
      for (let q = debut; q + QUART <= fin; q += QUART) quarts.push(q)
      if (quarts.length * QUART < duree) continue
      r.push({ jour, quarts, matins, soirs })
    }
  }
  return r
}

/** Les variables de trou d'une plage [debut, fin[ tenue par `tenus` (tous
 * les créneaux des postes concernés, quel que soit leur jour). */
function variablesTrous(
  m: Modele,
  p: Probleme,
  x: Map<string, string>,
  termesDe: (c: Creneau, quoi: 'autonomes') => Terme[],
  poste: string,
  jour: number,
  debut: number,
  fin: number,
  tenus: Creneau[],
  poidsQuart = POIDS_TROU_QUART,
  poidsSeul = 0,
  finSeul = Infinity,
  /** Continuité obligatoire (D8) : le prix d'une place nécessaire pour un
   * trou que ces créneaux couvriraient, en plus du prix au quart d'heure. */
  continuite?: (couvrants: Creneau[]) => number,
): Array<Trou & { v: string }> {
  const r: Array<Trou & { v: string }> = []
  const presents = tenus.filter((c) => c.debut < fin && c.fin > debut)
  // Suites de quarts d'heure couverts par les mêmes créneaux : une seule
  // variable.
  const suites: Array<{ debut: number; fin: number; cle: string }> = []
  const premier = Math.floor(debut / QUART) * QUART
  for (let q = premier; q < fin; q += QUART) {
    const a = Math.max(q, debut)
    const b = Math.min(q + QUART, fin)
    const cle = presents
      .filter((c) => c.debut <= a && c.fin >= b)
      .map((c) => c.id)
      .join('|')
    const derniere = suites.at(-1)
    if (derniere && derniere.cle === cle && derniere.fin === a) derniere.fin = b
    else suites.push({ debut: a, fin: b, cle })
  }
  for (const suite of suites) {
    const termes: Terme[] = []
    const couvrants: Creneau[] = []
    for (const c of presents) {
      if (c.debut > suite.debut || c.fin < suite.fin) continue
      couvrants.push(c)
      if (c.accueil) {
        // Les sommes du candidat (AGRÉGATS DE L'ACCUEIL) : ses autonomes.
        termes.push(...termesDe(c, 'autonomes'))
        continue
      }
      for (const s of p.salaries) {
        const v = x.get(cle(s.id, c.id))
        if (!v || role(s, c.poste) === 'soutien') continue
        termes.push([1, v])
      }
    }
    const v = m.continu(0, 1)
    m.ajoute([...termes, [1, v]], '>=', 1)
    m.cout(
      Math.round((poidsQuart * (suite.fin - suite.debut)) / QUART) +
        (continuite && termes.length ? continuite(couvrants) : 0),
      v,
    )

    r.push({ poste, jour, debut: suite.debut, fin: suite.fin, v })
    // Personne seule (`POIDS_SEUL_QUART`) : au moins deux, ou payer ; pas
    // après `finSeul` (le veilleur seul). Les suites suivent les débuts des
    // créneaux : une suite s'arrête à l'arrivée d'un veilleur.
    if (poidsSeul > 0 && suite.fin <= finSeul) {
      const seul = m.continu(0, 1)
      m.ajoute([...termes, [1, v], [1, seul]], '>=', 2)
      m.cout(Math.round((poidsSeul * (suite.fin - suite.debut)) / QUART), seul)
    }
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
  /** Valeur de l'objectif (HiGHS) ; absente sans solution. */
  objectif?: number
}

const echec = (): Resolution => ({
  statut: 'inconnu',
  affectations: [],
  manques: [],
  ecartTotalMinutes: null,
  trous: [],
  ouvertures: [],
  relevesManquantes: [],
  passationsManquantes: [],
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
  affiner?: OptionsConstruction['affiner'],
): Resolution {
  const {
    modele,
    x,
    manque,
    ecarts,
    trous,
    ouvertures,
    releves,
    passations,
    minimums,
    sousContrat,
    jfrs,
  } = construire(p, { affiner })
  if (modele.impossible) return echec()
  // Moments où un remplaçant compte (`aTenir`) : ceux du problème COMPLET,
  // pour que le temps 1 (sans remplaçants) les reconnaisse aussi. Une
  // version étoile est déjà au temps 1 : elle ne compte pas ici.
  const remplacables = new Set(
    (complet ?? p).consignes.flatMap((k, i) =>
      (complet ?? p).creneaux.some(
        (c) =>
          estRemplacant(c) &&
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
    ouvertures.length === 0 &&
    jfrs.length === 0
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
      // Personne : aucune nuit tenue, aucune passation à faire.
      passationsManquantes: [],
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
    affectations.push({ salarieId, creneauId })
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
    objectif: solution.ObjectiveValue,
    affectations,
    manques,
    ecartTotalMinutes: ecarts.reduce(
      (t, [plus, moins]) => t + valeur(plus) + valeur(moins),
      0,
    ),
    trous: restes,
    ouvertures: reunir(ouvertures),
    jfr: jfrs
      .filter(({ v }) => valeur(v) === 1)
      .map(({ salarieId, jour }) => ({ salarieId, jour })),
    relevesManquantes: releves
      .filter(({ v }) => valeur(v) > 0.5)
      .map(({ jour }) => jour),
    passationsManquantes: passations
      .filter(({ v }) => valeur(v) > 0.5)
      .map(({ jour, cote }) => ({ jour, cote })),
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

/**
 * AFFINAGE (2026-11-05), un second calcul du type « fixer puis optimiser » :
 * le calcul a décidé qui travaille, quel jour, sur quel poste et à quel
 * moment ; tout cela figé, un calcul minuscule ne choisit plus que l'horaire
 * précis de chaque shift de l'accueil dans son moment (et son poste de
 * l'accueil : Réception ou Club, l'app répartit, D2), pour qu'une personne
 * garde ses horaires d'un jour à l'autre (`POIDS_AFFINAGE_HORAIRE` par
 * horaire de plus), sans que l'objectif d'origine dépasse celui du calcul de
 * plus de `AFFINAGE_TOLERANCE`. Mesuré sur les 18 semaines faites à la main :
 * à la main, l'heure d'arrivée change entre deux jours du même moment dans
 * 23 % des cas, dans le calcul 34 %, après l'affinage 28 % (chaque semaine
 * recalculée sur le passé réel), même couverture, mêmes places, même temps ;
 * un coût dans le calcul lui-même triplait son temps, une marge de 2 000 ne
 * gagne presque rien de plus. Seulement après une solution OPTIMALE, s'il reste du
 * temps ; sinon (ou si l'affinage échoue), le planning du calcul tel quel.
 */
export const AFFINAGE_TOLERANCE = 600
/** Temps au plus de l'affinage (secondes), et jamais plus du quart du budget. */
export const AFFINAGE_PLAFOND_S = 10
export const POIDS_AFFINAGE_HORAIRE = 100
function affiner(
  p: Probleme,
  highs: Highs,
  echeance: number,
  r: Resolution,
): Resolution {
  if (AFFINAGE_TOLERANCE <= 0) return r
  if (r.statut !== 'optimal' || r.objectif === undefined) return r
  if ((echeance - Date.now()) / 1000 <= 1) return r
  const creneaux = new Map(p.creneaux.map((c) => [c.id, c]))
  // Rien à affiner sans shift de l'accueil (aucun second calcul).
  if (!r.affectations.some((a) => creneaux.get(a.creneauId)?.accueil)) return r
  const choisi = new Set(
    r.affectations.map((a) => cle(a.salarieId, a.creneauId)),
  )
  const gabarit = new Map<string, Creneau>()
  for (const a of r.affectations) {
    const c = creneaux.get(a.creneauId)
    if (c) gabarit.set(`${a.salarieId}|${jourDe(c)}`, c)
  }
  const permis = (salarieId: string, c: Creneau) => {
    if (choisi.has(cle(salarieId, c.id))) return true
    const g = gabarit.get(`${salarieId}|${jourDe(c)}`)
    return (
      !!g &&
      g.accueil &&
      c.accueil &&
      g.moment !== null &&
      g.moment === c.moment
    )
  }
  // La borne contient le bruit de la graine du calcul (0 à 3 par variable) :
  // la marge réelle peut dépasser AFFINAGE_TOLERANCE de ce bruit, toujours
  // sous une règle morale.
  const r2 = resoudreUneFois(
    p,
    highs,
    echeance,
    Math.min(AFFINAGE_PLAFOND_S, p.tempsMaxSecondes / 4),
    p,
    { permis, borne: r.objectif + AFFINAGE_TOLERANCE },
  )
  // Seulement un affinage PROUVÉ (relecture du 2026-11-05) : arrêté au temps
  // limite, il pourrait coûter la marge sans rien gagner.
  return r2.statut === 'optimal' ? { ...r2, objectif: r.objectif } : r
}

/** Ce qui reste à tenir et qu'un remplaçant pourrait tenir : places
 * vides, manques aux moments où un remplaçant compte, minutes de trou d'un
 * poste à part (les trous de l'accueil entier ne se ferment pas par un
 * remplaçant : l'accueil n'en a pas). */
function aTenir(r: Resolution): [number, number] {
  return [
    r.manques.reduce((t, m) => t + m.manquant, 0) + r.manqueMinimum,
    r.trous
      .filter((k) => zoneDuPosteTrou(k.poste, '') === null)
      .reduce((t, k) => t + k.fin - k.debut, 0),
  ]
}

const rendre = (
  {
    manqueMinimum: _,
    sousContrat: _s,
    auDessusContrat: _a,
    objectif: _o,
    ...r
  }: Resolution,
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
 * `PART_TEMPS_1` du budget. Les VERSIONS ÉTOILE (`Creneau.etoile`) y sont :
 * elles tiennent la place comme l'horaire demandé (la journée de 7 h des
 * 39 h, jamais un pis-aller), comme l'ancienne variable « court » qui
 * existait dès ce temps-là. Puis :
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

/** Un remplaçant du second temps : un créneau `r…` qui n'est pas une
 * version étoile (celle-ci est au premier temps). */
export const estRemplacant = (c: Creneau) => c.place !== null && !c.etoile

/** Résout le problème avec HiGHS (chargé par l'appelant : worker ou test). */
export function generer(p: Probleme, highs: Highs): ResultatGeneration {
  const echeance = Date.now() + p.tempsMaxSecondes * 1000
  const fini = (r: Resolution, q: Probleme, etapes: 1 | 2) =>
    rendre(affiner(q, highs, echeance, r), etapes)
  const imposes = new Set([...p.imposees].map((k) => scinder(k)[1]))
  const garde = (places: ReadonlySet<string>, ids: ReadonlySet<string>) =>
    p.creneaux.filter(
      (c) =>
        !estRemplacant(c) ||
        imposes.has(c.id) ||
        (c.place !== null && places.has(c.place)) ||
        ids.has(c.id),
    )
  const creneaux1 = garde(new Set(), new Set())
  if (creneaux1.length === p.creneaux.length) {
    return fini(resoudreUneFois(p, highs, echeance), p, 1)
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
      if (places.size === 0 && pourHeures.size === 0)
        return fini(r1, { ...p, creneaux: creneaux1 }, 1)
      creneaux2 = garde(places, pourHeures)
    }
  }
  if ((echeance - Date.now()) / 1000 <= TEMPS_MIN)
    return fini(r1, { ...p, creneaux: creneaux1 }, 1)
  const r2 = resoudreUneFois(
    { ...p, creneaux: creneaux2 },
    highs,
    echeance,
    Number.POSITIVE_INFINITY,
    p,
  )
  if (r2.statut === 'inconnu') return fini(r1, { ...p, creneaux: creneaux1 }, 1)
  if (r2.statut === 'realisable' && r1.statut !== 'inconnu') {
    const [m1, t1] = aTenir(r1)
    const [m2, t2] = aTenir(r2)
    if (m1 < m2 || (m1 === m2 && t1 < t2))
      return fini(r1, { ...p, creneaux: creneaux1 }, 1)
  }
  return fini(r2, { ...p, creneaux: creneaux2 }, 2)
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
  for (const c of p.creneaux)
    if (estRemplacant(c) && c.place !== null) avecRemplacants.add(c.place)
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
    if (estRemplacant(c) && jours.has(jourDe(c))) ids.add(c.id)
  return ids
}

/** Les places qui ont des remplaçants et que le temps 1 fait tenir en
 * dépannage (hors shift posé). */
function placesEnDepannage(p: Probleme, r: Resolution): Set<string> {
  const avecRemplacants = new Set<string>()
  for (const c of p.creneaux)
    if (estRemplacant(c) && c.place !== null) avecRemplacants.add(c.place)
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
