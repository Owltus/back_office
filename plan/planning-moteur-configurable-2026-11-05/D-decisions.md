# Décisions — moteur réglable

Numérotées D1 à D10, jamais renumérotées.

---

## A. Questions pour l'utilisateur

Écrites pour quelqu'un qui ne connaît pas le moteur.

| #   | Question                                                                                                      | Choix                                                                                                                                       | Étape            | Ce qui en dépend                 |
| --- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------- |
| D1  | Votre app servira-t-elle un jour à un autre établissement (un autre hôtel, un restaurant) ?                   | **(A)** oui, il faut tout prévoir ; **(B)** non, je veux juste pouvoir changer mes règles moi-même                                          | 2, 9             | La taille du chantier            |
| D2  | Une même personne peut-elle travailler deux fois dans la journée, par exemple 11 h-15 h puis 18 h-23 h ?      | **(A)** oui, il le faut ; **(B)** non, jamais chez nous                                                                                     | hors plan        | Très gros chantier à part si (A) |
| D3  | Un jour où il manque une personne, que préférez-vous ?                                                        | **(A)** une case vide, chacun garde ses heures et ses repos ; **(B)** quelqu'un fait moins d'heures que son contrat, mais la case est tenue | 7                | L'ordre de ce qui cède           |
| D4  | Faut-il pouvoir dire qu'un besoin est « obligatoire » ou seulement « souhaité » ?                             | **(A)** oui, case par case ; **(B)** non, le chiffre « en plus si besoin » suffit déjà                                                      | 7                | Une case de plus dans Besoins    |
| D5  | Les heures d'un salarié se comptent-elles sur une semaine ou sur deux ?                                       | **(A)** une semaine, comme aujourd'hui ; **(B)** deux semaines (par exemple 32 h puis 46 h)                                                 | hors plan si (B) | Le calcul des heures dues        |
| D6  | Un salarié en 39 h qui a « toujours 7 h le vendredi » : faut-il choisir l'horaire précis ?                    | **(A)** non, juste « 7 h ce jour-là », le planning choisit l'horaire ; **(B)** oui, l'horaire exact                                         | 6                | La fiche salarié                 |
| D7  | Où régler la relève du soir et la passation avec le veilleur ?                                                | **(A)** dans la nouvelle page « Règles de l'établissement » ; **(B)** les laisser dans Besoins                                              | 5                | Le menu                          |
| D8  | Les passations (le soir croise le matin, le soir attend le veilleur) : obligation ou préférence ?             | **(A)** obligation, le planning refuse sinon ; **(B)** préférence très forte, comme aujourd'hui                                             | 4                | Le calcul                        |
| D9  | Un apprenti ou un stagiaire peut-il être seul à l'accueil ?                                                   | **(A)** jamais, c'est une règle fixe ; **(B)** c'est un choix de l'établissement, réglable                                                  | 4, 5             | Loi ou règle                     |
| D10 | Les jours fériés : seulement ceux de France, ou faut-il pouvoir en ajouter (Alsace, outre-mer, fête locale) ? | **(A)** France seulement ; **(B)** pouvoir en ajouter                                                                                       | 5                | Une liste de plus                |

---

## B. Réponses par défaut (réversibles, décision de l'assistant à confirmer)

| #   | Point                        | Réponse par défaut                                           | Raison                                                |
| --- | ---------------------------- | ------------------------------------------------------------ | ----------------------------------------------------- |
| B1  | La loi                       | Jamais réglable, montrée en lecture seule dans la page       | Un clic ne doit pas rendre un planning illégal        |
| B2  | Les poids du calcul          | Jamais réglables ni montrés en chiffres                      | Décision existante ; on règle la règle, pas son poids |
| B3  | Valeurs par défaut           | Exactement l'hôtel d'aujourd'hui                             | Personne ne doit voir son planning changer            |
| B4  | Défaut de la relève          | 30 min partout                                               | C'est la valeur de la page Besoins                    |
| B5  | Limites des moments          | Une seule source pour `momentPropose` et `periodeLibre`      | Elles se contredisent aujourd'hui (21 h et 22 h)      |
| B6  | Un seul veilleur             | Devient un réglage « nombre de personnes la nuit », défaut 1 | Un autre hôtel peut en avoir deux                     |
| B7  | Codes CP, JF, JFR, EC en dur | Lus par la nature du motif, plus par leur code               | Un autre établissement nomme autrement ses motifs     |

---

## C. Révision datée

**2026-11-05, questionnaire (outil de questions).** Réponses de l'utilisateur :

- **D1 = B, avec une nuance.** « non juste pour mon hôtel mais je veux des bonnes pratiques quoi qu'il arrive dans le cas où j'ajoute ou je modifie des choses ». → Pas de multi-établissement. Mais aucune règle de l'hôtel en dur : tout réglable, défauts = l'hôtel.
- **D2 = B.** Jamais deux services dans la journée. → Hors périmètre, définitivement.
- **D3 = A.** Laisser une case vide. → Comportement actuel gardé : repos et heures avant la case.
- **D5 = A.** Une semaine. → Calcul des heures inchangé.
- **D6 = A, précisé.** « pouvoir choisir la journée dite étoile dans les paramètres des fiches employé… si choisie c'est comme cela et sinon c'est appliqué de la meilleure façon ». → Jour étoile choisi dans la fiche = imposé, horaire choisi par le planning ; sans jour choisi, le planning le place au mieux.
- **D4 = A, élargi.** « je voudrais vraiment retravailler la page Besoins avec d'autres paramètres ». Choisis : obligatoire / souhaité, niveau demandé (titulaire, dépannage, soutien), ouverture et fermeture du poste, passation entre équipes. Et : « les hôteliers sont plus importants sur les postes de Club et Réception ou la nuit, tu dois pouvoir configurer l'importance des postes pour le fonctionnement de l'établissement ». → Nouveau réglage : IMPORTANCE d'un poste (D11).
- **D8 = mixte.** « il faut a minima que les deux shifts terminent et commencent en même temps pour garantir le fonctionnement et la continuité, et au mieux se croisent et travaillent ensemble ». → Continuité (aucun trou entre la fin d'une équipe et le début de la suivante) = OBLIGATION ; chevauchement = préférence.
- **D9 = selon le niveau.** « en fonction s'ils y sont titulaires ou en dépannage, et le soutien jamais seul ; à défaut, fais soutien ». → Un apprenti ou stagiaire titulaire ou en dépannage sur le poste compte comme autonome et peut être seul ; en soutien, jamais seul (loi de l'établissement, non réglable). Niveau par défaut d'un apprenti ou stagiaire : soutien.
- **D7 = réparties.** Pas de 5e page. → Contrats et repos dans Équipe ; limites des moments dans Horaires ; passations, ouverture, importance dans Postes ou Besoins.
- **D10 = A.** France seulement.

Nouvelle décision ouverte :

| #   | Question                                   | Choix                                                                                                                                                                                                                                                                                                             | Étape |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| D11 | Comment exprimer l'importance d'un poste ? | ~~**TRANCHÉE le 2026-11-05 : trois niveaux.**~~ **RÉVISÉE le même jour : oui / non**, voir plus bas. Historique : « Indispensable » (Réception, Club, nuit), « Important », « Si possible » (Direction). Quand il manque du monde, « Si possible » reste vide en premier. Remplace la notion d'accueil implicite. | 7     |

**2026-11-05, D11 révisée (décision utilisateur).** « Je n'aime pas trop comment tu gères
l'importance des postes… soit un poste est important, soit il ne l'est pas… je voudrais que
l'application fonctionne au maximum par la configuration et non que les postes soient configurés
en dur. Imaginons demain je crée des nouveaux postes, je n'ai pas envie de devoir refabriquer un
moteur. » Non indispensables : Direction, Adjoint de direction, Supervision réception,
Responsable technique (« si pendant 2 jours il n'y en a pas, l'hôtel continue à tourner grâce aux
réceptionnistes, au Club et aux veilleurs »). Indispensables : Réception, Club, Veille de nuit.

- Un seul choix par poste, « Indispensable au fonctionnement » oui / non (interrupteur dans
  Postes). Le calcul a deux paliers : indispensable, puis le reste ; le souhaité reste dessous.
- Base : migration d'ajout `20261105130000_planning_importance_oui_non` ('important' devient
  'si_possible', défaut 'si_possible', le CHECK à trois valeurs est gardé) ; une valeur
  'important' qui resterait est lue comme non indispensable.
- Aucun poste en dur dans le moteur. La notion d'accueil (`presence`, `accueil_nuit`) reste un
  réglage À PART : elle dit qui compte dans le tableau matin / soir / nuit, l'ouverture, la
  fermeture et les passations, pas ce qui passe en premier. Pas unifiée (un poste peut être
  indispensable sans être l'accueil).
- Page Besoins refaite en sections (même demande : « plus claire », « migrer la partie Moments
  dans Besoins ») : Postes indispensables, Autres postes tenus au mieux, Moments, puis l'ordre de
  décision en repli. Un poste neuf se range tout seul selon son réglage.

**2026-11-06, A7 révisé : trois niveaux fixes (décision utilisateur).** « titulaire à placer en
priorité, est autonome, il peut avoir une autre personne avec lui si possible mais pas obligé,
donc avec lui un dépannage et/ou un soutien. Le dépannage est placé à défaut si pas de titulaire
disponible, il peut avoir un soutien avec lui. Les soutiens ne peuvent pas être seuls, obligés
avec dépannage et/ou titulaire. Je pense que tu peux le mettre en dur dans le moteur et non
paramétrable, car c'est un truc qui couvre tous les cas. » Et : « il y a des règles où tout le
monde doit faire ses heures en fonction de son contrat 35 h ou 39 h ».

- Niveaux FIXES dans le code (`niveaux.ts`), jamais réglables : renverse les niveaux de
  l'établissement d'A7 (création, ordre, cases « peut être seul » et « jamais seul »).
- Ordre de décision gardé : heures du contrat avant « titulaire avant dépannage ».
- Table `planning_niveaux` gardée et figée (PL409), plus lue ; nombre par niveau d'un besoin et
  `niveau_min` gardés.

**2026-11-06, passation entre les équipes fixe (décision utilisateur).** À propos de la section
« Passation entre les équipes » de Besoins (aucun trou entre deux équipes, passation avec la
nuit, relève 0 à 60 min, équipe du soir ensemble 15 à 60 min) : « cette notion n'a pas besoin
d'être paramétrable. Dis-toi simplement que c'est toujours, par défaut, la transition parfaite,
genre terminer à 15h00 et l'autre commence à 15h00, mais si possible de chevauchement, privilégie
le chevauchement. Donc retire le paramétrage de cela. »

- Règles FIXES aux valeurs de l'hôtel (vérifiées en base locale : continuité vraie, relève 30,
  passation vraie, tolérance 30, zone Accueil identique) : constantes `RELEVE_MINUTES` et
  `EQUIPE_TOLERANCE` de `regles.ts` ; continuité et passation avec la nuit toujours actives.
  Elles valent pour toute zone tenue en continu, pas pour une autre.
- Base inchangée : les colonnes restent, plus lues (pas de retrait).
- Écran : réglages retirés de Besoins et des zones, une phrase les dit. Renverse D8 « réglable »
  (la continuité reste obligatoire) et les réglages de relève, passation, tolérance par zone (A5).

**2026-11-09, rythme 5 jours puis 2 jours strict (décision utilisateur).** « Les repos, il faut
qu'ils soient absolument sur 2 jours d'affilée, donc c'est normal que pour la semaine de travail
ce soit le cas aussi. » Choix A strict : toujours 5 jours de travail d'affilée puis 2 jours de
repos d'affilée pour les contrats de 35 h et plus (même périmètre que `rythmeHumain`) ; les repos
retombent aux mêmes jours d'une semaine à l'autre, et une place reste à pourvoir plutôt que
d'enfreindre la règle. Constat d'origine : décembre généré montrait des semaines « TTrrTTT » et un
repos seul (stagiaire de 35 h, « r TT r TTT »).

- Réglage « Rythme 5 jours puis 2 jours strict » dans « Repos et rythme », défaut oui (colonne
  `rythme_strict`, migration d'ajout `20261109100000`). Seuil : `rythme_contrat_min`.
- Jours neutres qui coupent le rythme : école, absence décomptée, hors contrat. Une semaine type à
  deux repos fixes ou plus décide seule (comme les deux repos de suite).
- Remplace, pour ces personnes, les fenêtres de jours d'affilée (l'école y comptait comme du
  travail). Réglage à non : le calcul d'avant.
- Banc de décembre (3 graines) : places à pourvoir 9 → 13-14 (moins du double, donc défaut oui),
  repos seuls 5 → 0, heures dues manquantes 43 → 16 h, aucune infraction, 4 s au pire par semaine.

**2026-11-09 (soir), rythme 5 et 2 : l'école et les absences comptent (décision utilisateur).**
« Les jours d'école au CFA, considère-les comme des jours de travail. Là, tu fais enchaîner 4 jours
de travail et 5 jours de CFA, 2 jours de travail et 5 jours de CFA. C'est pas cool. Prends en
compte tous les autres statuts… pour que tout soit cohérent. » Révise le point « jours neutres »
ci-dessus.

- TRAVAIL : shift ; école ; absence décomptée (congé, maladie, formation, sans solde, férié chômé,
  JFR pris ou proposé, jours fériés ajoutés pour stagiaires et encadrement, absence de la semaine
  type) de 5 jours d'affilée au plus. REPOS : repos fixe, posé ou proposé, absence sans décompte,
  jour sans rien. NEUTRE : hors contrat et absence LONGUE (plus de 5 jours d'affilée, semaines
  voisines comprises). INCONNU : semaine voisine non lue. Une source : `rythmeStrict.ts`.
- Choix de l'agent, à valider : la formation n'a pas de nature à part en base (et le moteur ne
  lit aucun code) : c'est une absence décomptée, du travail jusqu'à 5 jours, neutre au-delà ; le
  JFR proposé par le calcul compte toujours comme du travail (même collé à un congé de 5 jours) ;
  un repos sur un congé en trop n'est un repos qu'une fois validé (avant, il est dans une absence
  longue, neutre) ; un jour passé vide est un repos.
- Les fenêtres de jours d'affilée restent remplacées : la règle les contient (l'école y compte
  comme du travail des deux côtés). Le plus simple.
- Moteur : les 6 jours restent durs ; les autres motifs sont payés, 8 fois le plus gros coût du
  modèle (`prixFauteRythme`) : durs, ils laissaient une semaine vide quand des faits (une semaine
  validée hors du rythme, puis une semaine de CFA) rendaient la règle impossible. Une faute déjà
  faite par les faits (3 repos connus après un bloc connu) n'est plus écrite : elle interdisait
  toute reprise.
- Banc de décembre (3 graines), matin puis soir : places à pourvoir 13-14 → 12, repos seuls 0 → 0,
  blocs hors 5 et 2 10 → 8 (tous dus à des faits), plus de bloc de 7 ou 9 jours avant une
  semaine de CFA, heures dues manquantes 8 → 29-36 h (deux apprentis hors du rythme après une
  semaine validée), aucune infraction, 12,2 s au pire par semaine.

**2026-11-09, rythme 5 et 2 : la formation compte toujours comme du travail (décision
utilisateur).** Une formation compte TOUJOURS comme du travail pour le rythme, même de deux
semaines ; elle ne devient jamais neutre, contrairement à un congé ou une maladie de plus de 5
jours. Révise le « choix de l'agent » ci-dessus pour la formation.

- Réglable, jamais lu par code : case du motif `planning_motifs.rythme_travail` (migration
  d'ajout `20261109110000`, défaut non ; le motif FO déjà en base est marqué, livraison
  `--avec-donnees`). Écran : « Compte comme du travail pour le rythme » dans le volet d'un motif
  d'absence compté dans les heures (Horaires et absences).
- Suite mêlée congé + formation : la formation ne COUPE pas la suite d'absences et n'y COMPTE
  pas. Seuls les jours de congé (ou maladie…) de la suite font sa longueur ; au-delà de 5, ils
  sont neutres, la formation reste du travail. `CCCC FF CCCC` : `nnnn TT nnnn` ; `CCC F CC` :
  5 jours de congé, du travail, 6 jours d'affilée (faute). Un congé de deux semaines coupé
  d'une journée de formation reste une absence longue.
- Une source (`statutAbsence`, `resoudreAbsences`, lus par `rythmeAutour`) pour le calcul, le
  vérificateur et les repos obligés ; « À vérifier » lit le motif d'une absence de la semaine
  type par la même fonction. Repos proposés sur un congé et prix de la règle inchangés.
  Empreintes 8874c146 et fb6eed48 inchangées (aucune formation dans les données de test).
