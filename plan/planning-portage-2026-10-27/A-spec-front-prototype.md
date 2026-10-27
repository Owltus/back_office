# Spécification fonctionnelle : frontend « Planning hôtel » (prototype)

Tous les fichiers sont lus en entier : App.tsx, api.ts, ui.tsx, occupation.ts, main.tsx, les 6 pages et les 7 fichiers de pages/planning. Pour les CSS (index.css, planning.css, gestion.css), j'ai lu les règles de mise en page.

**Fichiers concernés** (chemins absolus) :

- C:\Users\Pierre-Louis\Desktop\planning\frontend\src\App.tsx
- C:\Users\Pierre-Louis\Desktop\planning\frontend\src\api.ts
- C:\Users\Pierre-Louis\Desktop\planning\frontend\src\ui.tsx
- C:\Users\Pierre-Louis\Desktop\planning\frontend\src\occupation.ts
- C:\Users\Pierre-Louis\Desktop\planning\frontend\src\main.tsx
- C:\Users\Pierre-Louis\Desktop\planning\frontend\src\pages\PlanningPage.tsx
- C:\Users\Pierre-Louis\Desktop\planning\frontend\src\pages\EquipePage.tsx
- C:\Users\Pierre-Louis\Desktop\planning\frontend\src\pages\CalendrierEcole.tsx
- C:\Users\Pierre-Louis\Desktop\planning\frontend\src\pages\PostesPage.tsx
- C:\Users\Pierre-Louis\Desktop\planning\frontend\src\pages\HorairesPage.tsx
- C:\Users\Pierre-Louis\Desktop\planning\frontend\src\pages\BesoinsPage.tsx
- C:\Users\Pierre-Louis\Desktop\planning\frontend\src\pages\planning\CarteShift.tsx, Cellule.tsx, EditeurShift.tsx, edition.ts, MenuCase.tsx, PanneauAlertes.tsx, Validation.tsx, VueMois.tsx
- CSS : C:\Users\Pierre-Louis\Desktop\planning\frontend\src\index.css, ...\src\pages\planning.css, ...\src\pages\gestion.css

Dans la suite, les références « fichier:ligne » renvoient à ces fichiers.

---

## 0. Points à connaître avant de briefer (écarts avec la demande, code mort, anomalies)

**Fonctions demandées qui n'existent pas dans ce frontend**

1. **Pas de ligne « à pourvoir » dans la grille semaine.** Aucune ligne de besoins non pourvus n'est rendue dans le tableau. Les trous (`a_pourvoir`) n'apparaissent qu'à trois endroits :
   - le panneau « Points d'attention » (PanneauAlertes) ;
   - le toast affiché après une génération ;
   - la jauge de couverture et le badge d'alertes de la barre.

   `Carte` accepte bien `manquant` (badge « ×N », CarteShift.tsx:75) et `fantome` (carte en pointillés, CarteShift.tsx:54), mais aucun appelant ne les passe : c'est un reste d'une ancienne ligne « à pourvoir ».

2. **Pas de bouton « Horaires fixes ».** Les horaires fixes sont posés automatiquement à chaque chargement d'une semaine à venir : `api.semaineAvecFixes` fait un `POST /semaines/{lundi}/fixes` si `lundi >= lundi courant`, sinon un `GET` (api.ts:295-298). **Ouvrir une semaine future est donc une écriture.**
   - `api.fixes`, `aJoursFixes`, `avecJoursFixes` et les options `exclus` / `seulement` de `generer` ne sont jamais appelés par l'interface (api.ts:104-105, 293, 302).
3. **Pas de bouton « Vider » en vue mois.** Seul « Effacer les propositions du mois » existe. Pas de « Full auto » non plus en vue mois.
4. **Raccourcis clavier : il n'y en a pratiquement pas.** On trouve seulement :
   - `Échap` ferme un Tiroir ou le menu clic droit ;
   - `Entrée` valide (blur) les champs de renommage en ligne ;
   - `Alt` maintenu au début d'un glisser duplique un shift au lieu de le déplacer.

   Il n'y a aucun raccourci pour générer, valider ou naviguer.

5. **`api.supprimer('besoins', id)` n'est pas utilisé.** Un besoin se supprime en remettant ses trois compteurs à 0 via `reglerBesoin`.

**Anomalies probables (à trancher par le produit)**

6. **Toast trompeur au verrouillage de la semaine** (PlanningPage.tsx:407-410). `executer` avale les erreurs, donc `.then()` s'exécute aussi en cas d'échec : le toast « Semaine verrouillée » apparaît même si le serveur a refusé.
7. **La vue mois n'est pas retenue.** Le commentaire dit « le choix est retenu sur ce poste » (PlanningPage.tsx:79-81), mais rien n'est stocké : le planning s'ouvre toujours en vue mois.
8. **La génération semaine ne vérifie pas le dernier planning réalisé.** Elle ne teste que « passée » et « verrouillée ». La vue mois, elle, exclut aussi les semaines antérieures à `derniere_semaine_verrouillee` (`apresLeRealise`). Côté semaine, c'est le serveur qui refuse éventuellement.
9. **En vue mois, les compteurs et les actions ne portent pas sur le même périmètre.** Les compteurs ne comptent que les jours du mois. Valider, effacer, générer et verrouiller s'appliquent aux semaines entières, y compris les jours du mois voisin.
10. **Absence posée depuis un shift existant.** En modification d'un shift, l'éditeur propose aussi les motifs d'absence. Choisir un motif appelle `poserAbsence` sans supprimer le shift côté client ; ce qui arrive au shift dépend du serveur.
11. **Horaire spécifique avec début = fin.** Aucune validation côté client : la durée affichée est 24 h (`dureeHoraire`, api.ts:336-340).
12. **Horaires : enregistrement à chaque frappe.** Les champs heure de début et de fin enregistrent à chaque `onChange` (HorairesPage.tsx:250, 257), donc un appel serveur à chaque modification du champ.
13. **Deux textes différents pour « Le moteur ne répond pas ».** Le bandeau de App.tsx:132 dit « vérifie que… » (tutoiement), le message d'erreur réseau de api.ts:239 dit « vérifiez que… ». D'autres messages tutoient aussi (« renomme-le », « renomme-la », « Affiche tous les codes »).

---

## 1. Coquille de l'application (App.tsx)

**Navigation**

- Navigation par hash : `#planning` (par défaut), `#equipe`, `#postes`, `#horaires`, `#besoins` (App.tsx:38-51). Le hash est suivi via `hashchange`.

**Barre du haut** (sticky, 56 px de haut), de gauche à droite :

1. Emplacement **« barre-temps »**. Chaque page y pose sa navigation dans le temps, par portail `DansLaBarre cote="gauche"`.
2. Flèche **← « Revenir au planning »**, visible seulement hors de l'onglet Planning (App.tsx:111-120).
3. Emplacement **« barre-page »** : les commandes de la page (`DansLaBarre` par défaut, côté droit).
4. **Engrenage « Paramètres »**, avec l'infobulle « Paramètres : équipe, postes, horaires et absences, besoins ».
   - Il ouvre un menu de 4 entrées : Équipe, Postes, Horaires et absences, Besoins. L'entrée active est surlignée ; un voile clique-dehors referme le menu.
   - L'icône prend le style « actif » hors de l'onglet Planning (App.tsx:169-206).
5. **Bouton « Revenir aux données de l'hôtel »**, seulement si `references.mode === 'prototype'` (App.tsx:125, 211-265). Confirmation en deux clics :
   - 1er clic : l'icône passe au rouge (✓), infobulle « Cliquer encore pour tout effacer ». Le bouton se désarme seul au bout de 4 s.
   - Infobulle au repos (sur plusieurs lignes) : « Revenir aux données de l'hôtel (prototype) / Recharge l'équipe et les semaines du PDF, efface les modifications / Refusé s'il y a d'autres semaines verrouillées / Une sauvegarde est faite avant ».
   - 2e clic : `POST /demo/reinitialiser`, puis rechargement complet de la page. Le message est conservé dans `sessionStorage` (`planning-message`) et affiché après rechargement en toast info pendant 12 s : « Données de l'hôtel rétablies. Sauvegarde faite : {chemin} » ou « Données de l'hôtel rétablies (rien à sauvegarder). ».
   - En cas d'échec : toast danger de 12 s (message du serveur, à défaut « Le retour aux données de l'hôtel a échoué. »).

**Chargement des données**

- Au démarrage, 7 appels GET en parallèle : `references`, `horaires`, `postes`, `salaries`, `besoins`, `motifs`, `groupes` (App.tsx:59-75).
- En cas d'échec : bandeau rouge « Le moteur ne répond pas : vérifie que la fenêtre « Planning - API » est ouverte. » avec un bouton « Réessayer ». Pendant le chargement : « Chargement… ».
- **Rechargement au retour sur l'onglet** (`useAuRetour`, occupation.ts:47-68) : sur `visibilitychange` ou `focus`, au plus une fois toutes les 2 s. La semaine ou le mois affiché se recharge en conséquence.
- **« Aujourd'hui »** (`useAujourdhui`, occupation.ts:29-43) : date locale AAAA-MM-JJ, recalculée chaque minute et au retour sur l'onglet, pour gérer le passage de minuit.

**Filet de sécurité** (`GardeErreur`, ui.tsx:327-353, monté dans main.tsx)

- En cas d'erreur d'affichage, l'écran montre :
  - le titre « Un problème d'affichage est survenu » ;
  - le texte « L'écran n'a pas pu s'afficher. Ce qui a déjà été enregistré est conservé ; la saisie en cours dans une fiche ouverte peut être perdue. » ;
  - « Détail : … » ;
  - un bouton « Recharger ».

**Gestion des actions en cours** (`useOccupation`, occupation.ts:6-25)

- C'est un compteur d'actions en cours, pas un simple booléen.
- `occupe` grise les boutons ; `estOccupe()` permet de refuser immédiatement un second clic trop rapide.

---

## 2. Planning : vue semaine (PlanningPage.tsx + pages/planning/*)

### 2.1 État et chargement

- **Semaine initiale** : `references.lundi_prochain` (PlanningPage.tsx:78).
- **Mode initial : « mois »** (ligne 81). La vue semaine s'ouvre en cliquant sur une semaine « S45 » de la vue mois.
- **Chargement** (lignes 164-182) : `semaineAvecFixes(lundi, lundiCourant)`, avec `lundiCourant` = lundi de la semaine d'aujourd'hui.
  - Rechargé à chaque changement de semaine et à chaque changement de salariés, postes, horaires ou besoins.
  - Erreur : toast danger « La semaine ne se charge pas. ».
  - Une réponse arrivée après qu'on a quitté la semaine est ignorée (ref `lundiAffiche`). Un compteur `ecritures` empêche un chargement parti avant une écriture d'écraser la réponse de cette écriture.
- **`passee`** = lundi < lundi courant. **`pret`** = la semaine affichée est bien celle choisie (pas l'ancienne encore à l'écran). **`verrou`** = `semaine.verrouillee`.
- Tant que la semaine n'est pas chargée : carte « Chargement du planning… ».

### 2.2 Exécution d'une écriture : `executer` (lignes 146-159)

- Incrémente `ecritures`, passe la page en « occupé », appelle l'API et applique la `Semaine` renvoyée.
- Si la case touchée (`salarie_id` + `jour`) a des alertes après l'écriture (`appliquer`, lignes 114-129) :
  - alerte de nature `loi` : toast danger « **Règle HCR :** {message} » ;
  - sinon, première alerte : toast attention avec son message.
- En cas d'erreur : toast danger avec le message du serveur (défaut « L'action a échoué. »), puis `relire(lundi)` pour revenir à l'état serveur (annule l'affichage optimiste).

### 2.3 Garde-fous communs

- **`siOuverte(action)`** (lignes 396-401) :
  - semaine verrouillée : toast attention « Semaine verrouillée : planning réalisé. Le cadenas permet de la rouvrir. » ;
  - pas prête ou occupée : toast attention « Calcul en cours : réessayez dans un instant. » ;
  - sinon, l'action s'exécute.
- **`siSousContrat`** (lignes 403-404) : `siOuverte`, plus le refus des jours hors contrat avec le toast attention « Hors de son contrat ce jour-là (arrivée ou fin de contrat) : voir sa fiche. ».

### 2.4 Barre du haut, côté gauche (navigation semaine, lignes 428-466)

- **Icône calendrier** « Revenir à la vue mois » : passe en vue mois sur le mois qui contient le jeudi de la semaine affichée.
- **‹** « Semaine précédente » : lundi − 7 jours.
- **Plage de dates** « 03/11 – 09/11 » (format JJ/MM).
  - Un clic revient à la semaine en cours ; infobulle « Revenir à cette semaine ».
  - Un cadenas est affiché à côté si la semaine est verrouillée.
- **›** « Semaine suivante ».

### 2.5 Barre du haut, côté droit (vue semaine uniquement, lignes 498-659)

**Indicateurs** (affichés dès que `stats` existe) :

1. **Compteur de validation** (`CompteurValidation`, Validation.tsx:14-46) : pastilles « N proposition(s) » (icône carré pointillé), « N validé(s) » (✓ vert), « N verrouillé(s) » (cadenas).
   - Il est masqué si les trois valent 0.
   - En semaine verrouillée, tous les shifts comptent comme « verrouillés » et propositions = validés = 0.
   - Infobulle (sur plusieurs lignes) : « Proposition (pointillés) : proposée par le moteur, recalculée à chaque génération / Validé (✓) : gardé par les générations, encore modifiable à la main / Verrouillé (cadenas) : semaine réalisée, rien ne bouge / Valider : clic droit sur un shift, ✓ en tête de jour, ou le menu ⌄ ».
2. **Jauge de couverture** + « pourvues/places ».
   - La jauge est verte à 100 %, orange sinon. La couverture vaut 100 % si `places = 0`.
   - Infobulle « Couverture des besoins : {pourvues} places pourvues sur {places} ».
3. **Bouclier HCR** :
   - avec infractions : bouclier rouge suivi du nombre, infobulle « {n} infraction(s) aux règles HCR : voir les alertes » ;
   - sans infraction : bouclier vert, infobulle « Conforme aux règles HCR ».

**Actions** :

1. **Icône d'aide (?)** : infobulle sur plusieurs lignes, accessible au clavier (`tabIndex 0`) : « Glisser un shift : le déplacer (Alt : le dupliquer) / Clic droit : changer l'horaire ou la journée étoile / Clic : tout modifier / Semi-auto : posez et validez quelques shifts, ✨ complète le reste ».
2. **Cadenas** (verrouiller / déverrouiller), lignes 552-564 et 405-411.
   - Désactivé si occupé ou pas prêt. Style « actif » quand la semaine est verrouillée.
   - Infobulle : « Semaine verrouillée (planning réalisé) : cliquer pour la déverrouiller » ou « Verrouiller la semaine : plus de modification ni de génération ».
   - Action : `PUT /semaines/{lundi}/verrou {verrouillee: !verrou}`, puis toast « Semaine déverrouillée : elle se modifie de nouveau » ou « Semaine verrouillée », puis rechargement global (la dernière semaine réalisée a pu changer).
   - **Aucune confirmation.**
3. **Bouton Alertes ⚠** avec badge rouge du nombre `nbAlertes` = somme des alertes des bilans + nombre d'entrées `a_pourvoir`.
   - Infobulle « Points d'attention ({n}) » ou « Points d'attention : rien à signaler ».
   - Ouvre le PanneauAlertes (§2.13).
4. **Bouton ✨ « Compléter le planning »** (bouton principal), lignes 576-592 et 185-199.
   - Désactivé si occupé, verrouillé, pas prêt ou semaine passée.
   - Infobulle selon le cas, par ordre de priorité :
     - « Semaine passée : on ne génère pas le passé » ;
     - « Semaine verrouillée : pas de génération » ;
     - « Calcul en cours… » ;
     - sinon « Semi-auto : recalcule les propositions (nouveau tirage à chaque clic) ; le validé ne bouge pas ».
   - Pendant le calcul, l'icône devient un spinner.
   - Action : `POST /semaines/{lundi}/generer {graine: aléatoire 0..1e9}`.
   - Toast avec `trous` = somme des `manquant` :
     - s'il y a des trous : « Planning généré en {duree_ms} ms · {trous} place(s) à pourvoir » (attention) ;
     - sinon : « Planning complet généré en {duree_ms} ms » (info).
5. **Bouton ⌄ « Autres actions »**, accolé au précédent.
   - Désactivé si verrouillé, occupé ou pas prêt. Infobulle « Générer, valider, effacer » (ou « Calcul en cours… »).
   - Ouvre `MenuActions` (Validation.tsx:57-94) : un menu en groupes titrés, fermé par un voile clique-dehors.
   - Une action inactive porte `aria-disabled` (pas `disabled`) ; son infobulle donne la raison et un clic ne fait rien.
   - Contenu du menu :
     - **Générer**
       - « Full auto », aide « Repart de zéro, y compris ce qui est validé » : `generer {tout: true}`. Inactive si semaine passée : « Semaine passée : on ne génère pas le passé ».
     - **Valider**
       - « Valider toute la semaine », aide « Toutes les propositions deviennent validées » : `POST valider {epinglee: true}`. Jamais inactive.
       - « Tout remettre en proposition », aide « Plus rien de validé : la génération peut tout changer » : `POST valider {epinglee: false}`.
     - **Effacer**
       - « Effacer les propositions », aide « Garde le validé ; à partir d'aujourd'hui » si c'est la semaine en cours, sinon « Garde le validé ». Appel `DELETE /semaines/{lundi}?garder_epinglees=true`. Inactive si passée : « Semaine passée : on n'efface pas le passé ».
       - « Vider la semaine » (en rouge), aide « Supprime tous les shifts à partir d'aujourd'hui, validés compris » (semaine en cours) ou « Supprime tous les shifts, validés compris ». Appel `DELETE …?garder_epinglees=false`. Même règle d'inactivité.
   - **Aucune confirmation, même pour « Vider la semaine ».**

### 2.6 Grille : structure (lignes 677-753 ; CSS planning.css:202-400)

- Tableau à largeur fixe, `min-width: 1080px`, défilement interne (`max-height: 100vh − 96px`). L'en-tête est collant (sticky) en haut, la colonne staff (196 px) collante à gauche.
- **En-tête** :
  - 1re colonne : « {n} personnes » ;
  - une colonne par jour : nom abrégé en majuscules (« LUN ») et date JJ/MM, aujourd'hui en couleur d'accent ;
  - dernière colonne (112 px) : « Semaine / Heures ».
- **Bouton ✓ « valider le jour »** dans l'en-tête de chaque jour (lignes 696-706).
  - Visible seulement si la semaine n'est pas verrouillée **et** qu'il existe au moins un shift non validé ce jour-là.
  - Désactivé si occupé ou pas prêt.
  - Infobulle « Valider toutes les propositions du {jour} ».
  - Appel `POST valider {jour, epinglee: true}`.
- **Lignes de groupe** : nom de la catégorie + effectif (`parGroupe`, api.ts:414-427).
  - Ordre des catégories = ordre de `groupes`, puis « Sans catégorie » en dernier (groupe_id nul ou inconnu).
  - Les groupes vides sont masqués.
- **Personnes visibles** (lignes 311-315) : sous contrat au moins un jour de la semaine (`date_entree` ≤ dimanche et `date_sortie` ≥ lundi) **et** (actives **ou** ayant au moins un shift cette semaine, pour l'historique).
- En semaine verrouillée, les cases sont hachurées et le « + » est masqué (planning.css:1221-1231).

### 2.7 Colonne staff (LigneStaff, lignes 868-907)

- L'ensemble est un bouton qui **ouvre la fiche salarié** (`FicheSalarie` en tiroir, depuis le planning).
  - Infobulle : « Ouvrir la fiche », puis une ligne « ⚠ {message} » par alerte du bilan.
- **Nom complet** + icône ⚠ si la personne a des alertes : rouge si au moins une alerte `loi`, orange sinon ; l'infobulle liste les messages.
- **Pastilles de postes**, une par compétence, à la couleur du poste (planning.css:351-367) :
  - pleine = titulaire ;
  - anneau creux = dépannage (occasionnel) ;
  - contour pointillé = soutien.
  - Infobulle « {Poste} · {Titulaire|Dépannage|Soutien} ».
- **Libellé métier** (`metier`, lignes 964-978) : postes triés titulaire > occasionnel > soutien, puis renommés :
  - catégorie `veille_nuit` → « Night » ;
  - catégorie `reception` ou poste nommé « Club » → « Hôtelier » ;
  - sinon, le nom du poste.
  - Doublons supprimés, séparateur « · ».

### 2.8 Case jour × personne (Cellule.tsx, CarteShift.tsx)

- Hauteur 64 px ; les cartes s'étirent pour la remplir.
- La case est une zone de dépôt (id `case:{salarie}:{jour}`).
- Le clic droit ouvre le menu de case (`MenuCase`) via `siSousContrat`.
- **Case vide** (ni shift, ni statut) : texte italique « Non attribué ». Un bouton « + » (aria « Ajouter un shift ») apparaît au survol ; il ouvre l'éditeur en création via `siSousContrat`.

**a) Carte de shift** (`Carte`, CarteShift.tsx:33-84)

- Fond en dégradé de la couleur du **code horaire** (gris neutre `#94a3b8` si horaire spécifique), avec un liseré de 3 px à gauche.
- Contenu :
  - heure de début en grand ;
  - « → fin » en dessous ;
  - pastille de durée travaillée, pause déduite, infobulle « Heures travaillées, pause déduite ». **Masquée pour les salariés au forfait jours** (PlanningPage.tsx:350).
  - « 24:00 » s'affiche « 00:00 » (`heureAffichee`).
- Icônes :
  - ★ journée étoile ;
  - ✓ vert si validé ;
  - bouée si rôle `occasionnel` ;
  - ⚠ rouge si alerte `loi`, orange sinon.
- **Proposition** (non validée) : bordure en pointillés. **Validé** : bordure pleine + ✓.
- **Journée étoile** (`journeeEtoile`, PlanningPage.tsx:957-960) : vraie si la personne n'est pas au forfait, a plus de 35 h au contrat, et (`court` ou durée = 7 h).
- Infobulle sur plusieurs lignes :
  - « {nom horaire | Horaire spécifique} · {début}–{fin} » ;
  - nom du poste ;
  - « ★ Journée étoile : une heure de moins » ;
  - « En soutien (jamais seul) » (rôle soutien) ou « En dépannage sur ce poste » (rôle occasionnel) ;
  - « Validé : gardé lors des générations » ou « Proposition du moteur : clic droit pour valider, sinon recalculée à la prochaine génération » ;
  - « ⚠ {message} » par alerte.
- **Clic** sur la carte : ouvre l'éditeur en modification (via `siOuverte`). Elle est déplaçable (§2.9).

**b) Carte de statut** (jour sans shift, `statutDe`, PlanningPage.tsx:317-340 ; CarteStatut, CarteShift.tsx:122-149)

- Rendu commun : carte hachurée en diagonale, icône et nom en majuscules au centre.
- Règles, dans l'ordre :
  1. **Hors contrat** : jour présent dans `bilan.hors_contrat`. Nom « Hors contrat », gris, icône UserX, fixe, avec cadenas.
  2. **Absence ou école** : jour présent dans `bilan.absences`. Nom et couleur du motif (défaut « Absent »). Icône chapeau si motif école, calendrier barré sinon. Fixe si le jour est dans `absences_semaine_type`, avec un petit cadenas.
  3. **Repos** si `jourDeRepos` (api.ts:432-435) est vrai, c'est-à-dire si l'une de ces conditions tient :
     - repos fixe (`repos_fixes`) ;
     - repos déduit (`repos_deduits`) ;
     - la personne a au moins un shift dans la semaine (« planifiée ») ;
     - `minutes_contrat == 0` et elle a des absences.

     Nom « Repos », gris, icône tasse, bordure pointillée. Un repos fixe ressemble à un repos ordinaire (pas de cadenas), mais il ne se déplace pas.

  4. Sinon, **rien** (« Non attribué »). Une personne sans aucun shift dans la semaine n'est pas encore organisée : ses jours libres ne sont pas des repos.
- Infobulles :
  - repos fixe : « Repos de la semaine type : à changer dans la fiche » ;
  - autre statut fixe : « {nom} : jour fixe de la semaine type, à changer dans la fiche » ;
  - sinon : « {nom} : glisser pour déplacer, cliquer pour changer ».
- **Clic** sur un statut : ouvre l'éditeur en **création** pour ce jour (même chemin que « + », donc refusé si hors contrat), avec le contexte d'absence.
- Le glisser est désactivé si le statut est fixe.

### 2.9 Glisser-déposer (dnd-kit, lignes 201-305)

- **Activation** après 6 px de mouvement. Capteurs désactivés si la semaine est verrouillée, si une action est en cours ou si la semaine n'est pas prête.
- **Fantôme pendant le glisser** : carte inclinée de 140 px, sans animation de dépôt. L'original passe à 35 % d'opacité et les « + » sont masqués.
- **Indices pendant le glisser** (`indice`, lignes 292-305 ; couleurs planning.css:499-526). Liseré vert = ok, orange = dépannage, fond rouge = déconseillé ; renforcés sur la case survolée.
  - Cible hors contrat : déconseillé.
  - Statut en vol :
    - cible fixe : déconseillé ;
    - repos vers une autre personne : déconseillé ;
    - sinon : ok.
  - Shift en vol :
    - cible en absence ou en repos fixe : déconseillé ;
    - la personne cible ne tient pas le poste du shift : déconseillé ;
    - elle le tient en titulaire : ok ;
    - elle le tient en dépannage ou soutien : « dépannage ».
  - **Les indices sont purement visuels** : on peut déposer sur une case déconseillée, le serveur tranche.
- **Dépôt** (`finVol`). Ignoré si pas de cible, semaine verrouillée ou pas prête. Si une action est en cours : toast « Calcul en cours : réessayez dans un instant. ».

**Dépôt d'un statut** (repos ou absence non fixe)

- Même case : aucun effet.
- Cible hors contrat : toast « Hors de son contrat ce jour-là (arrivée ou fin de contrat) : voir sa fiche. ».
- Cible fixe : toast « Jour fixe de la semaine type : à changer dans la fiche. ».
- Repos vers une autre personne : toast « Un repos se déplace sur la même ligne : il s'échange avec un jour travaillé. ».
- Sinon : `POST /semaines/{lundi}/statuts/deplacer {salarie_id, jour, vers_salarie_id, vers_jour}`, puis rechargement global (les absences vivent dans les fiches). Une absence peut donc passer à une autre personne ; le serveur décide.

**Dépôt d'un shift**

- Même case : aucun effet.
- Cible hors contrat : refus (toast ci-dessus).
- **Alt** maintenu au début du glisser = **duplication** :
  - si la cible a déjà un shift : toast « Cette personne a déjà un shift ce jour-là : un seul par jour. » ;
  - sinon : `POST /semaines/{lundi}/affectations` avec les champs du shift et la nouvelle personne / le nouveau jour.
- **Sans Alt = déplacement optimiste** :
  - la carte bouge tout de suite, marquée validée (`epinglee: true`), alertes vidées ;
  - si la case cible a déjà un shift, **les deux shifts s'échangent** (l'occupant prend la place d'origine, également marqué validé) ;
  - puis `PATCH /affectations/{id} {salarie_id, jour}` ;
  - en cas de refus du serveur, la semaine est relue et la carte revient.
- Le shift peut être déposé sur n'importe quelle personne et n'importe quel jour de la semaine, y compris une case avec repos ou absence ; le serveur tranche.

### 2.10 Menu de case au clic droit (MenuCase.tsx)

- Positionné au curseur, maintenu à au moins 8 px des bords de la fenêtre.
- Fermé par : Échap, redimensionnement de la fenêtre, clic ou clic droit sur le voile.
- Ouvert via `siSousContrat` : refusé si verrouillé, occupé ou hors contrat.
- **Poste de référence** (lignes 56-60) : celui du shift, sinon le 1er poste titulaire de la personne, sinon sa 1re compétence, sinon le 1er poste de la liste.
- **Codes horaires proposés** (lignes 61-67) : ceux autorisés pour le poste (tous si le poste n'en restreint aucun), réduits aux `shifts_autorises` de la fiche s'il en reste au moins un. On y ajoute toujours le code actuel du shift. Le tout est trié par heure de début.
  - Chaque ligne affiche : pastille couleur, nom, « début–fin · durée travaillée » (pause déduite), et ✓ sur le code actuel.
  - Cliquer le code actuel ne fait rien.
  - Cliquer un autre code appelle `poserHoraire` (edition.ts:23-41) :
    - s'il y a un shift : `PATCH {type_shift_id, debut, fin, court: false}`, ce qui **retire la journée étoile** ;
    - sinon, si le jour porte une absence **non fixe** : `DELETE` de l'absence, puis `POST` d'une affectation, puis rechargement global ;
    - sinon : `POST` d'une affectation sur le poste de référence ;
    - une absence fixe ne bloque pas le `POST` côté client.
- **Bloc Validation** (si la case a un shift) :
  - « Valider ce shift », détail « gardé par les générations » ;
  - ou « Remettre en proposition », détail « recalculable ».
  - Appel `POST /semaines/{lundi}/valider {salarie_id, jour, epinglee}`.
- **Bloc Journée étoile** (`etoileProposee`, edition.ts:45-68). Affiché seulement si la case a un shift, que la personne n'est pas au forfait, a plus de 35 h, et que le code a un `raccourci > 0`.
  - Libellé « Journée étoile », détail « mettre ce jour » ou « retirer », ✓ si active.
  - Activer : un `PATCH court: false` sur chaque autre jour court de la semaine, puis `PATCH court: true` sur ce shift. La journée étoile est unique dans la semaine.
  - Désactiver : `PATCH court: false`.

### 2.11 Éditeur de shift (EditeurShift.tsx), en Tiroir latéral

**Ouverture et titres**

- Ouvert par :
  - « + » ou clic sur un statut : mode **création** ;
  - clic sur une carte : mode **modification**.
- Titre :
  - « Modifier le shift » en modification ;
  - en création : « Jour d'école » si le jour porte un motif école, « Jour d'absence » si une autre absence, sinon « Planifier le jour ».
- Sous-titre : « {Prénom Nom} · {Jour} ». En vue mois, la date est en toutes lettres, par exemple « lun. 3 nov. ».

**Valeurs par défaut** (lignes 59-89)

- Poste : celui du shift, sinon le 1er titulaire, la 1re compétence ou le 1er poste.
- Horaire initial en création : le 1er des « horaires permis ». Ce sont les codes du poste, réduits aux `shifts_autorises` de la fiche (si au moins un reste), avec en tête l'horaire de la semaine type ce jour-là.
- Sans code permis : mode « Horaire spécifique » d'emblée, 09:00–17:00.
- Validé (`epinglee`) : vrai par défaut.

**Contenu**

1. **Alertes du shift** (modification uniquement) : une ligne par alerte, en rouge si `loi`, avec un badge du code de règle s'il commence par « R- ».
2. **Bandeau absence** (création sur un jour qui en porte une) :
   - nom du motif en couleur ;
   - si l'absence est fixe : « vient de la semaine type : à changer dans sa fiche » ;
   - sinon : bouton « Retirer l'école » / « Retirer l'absence » → `DELETE /semaines/{lundi}/absences?salarie_id&jour`, puis rechargement global.
3. **Section « Horaire »**
   - Boutons de codes : badge code + nom + « début–fin » (+ « · Xh de travail » si pause > 0).
   - Liste = codes du poste choisi (**sans** le filtre de la fiche) + le code d'origine du shift.
   - Bouton « • Horaire spécifique / heures libres ».
   - Puis « **Ou une absence** » (aide « pas de travail ce jour-là » : motifs non-école) et « **Ou l'école** » (aide « formation hors établissement » : motifs école). Les groupes vides sont masqués.
   - Choisir un motif masque la section Poste et transforme le bouton principal.
   - **Interrupteur « Journée courte »**, si un code a un raccourci > 0 : « Journée courte : {début court} → {fin courte} ({durée} de travail) ». `horaireCourt` décale le début de `raccourci_debut` et avance la fin du reste.
   - **En horaire spécifique** :
     - champs heure « Début » et « Fin » (un champ vidé garde la valeur précédente) et la durée calculée ;
     - si le début vaut 00:00 ou 24:00 : interrupteur « Commence à 00:00 en fin de journée (nuit vers le lendemain) », qui bascule entre `24:00` et `00:00`. Infobulle : « Coché : le shift commence à 00:00 à la fin de ce jour, comme une nuit qui démarre le soir même. Décoché : il commence à minuit au tout début de ce jour (00:00). ».
4. **Section « Poste »** (masquée si un motif est choisi)
   - Tous les postes, ceux tenus par la personne en premier.
   - Pastille couleur, nom, et le niveau (« Titulaire », « Dépannage », « Soutien ») ou « non tenu » en grisé.
   - Changer de poste (ou de personne) : si le code choisi n'est plus permis, bascule sur le 1er permis, avec `court` remis à faux. S'il n'y en a aucun, bascule en horaire spécifique. Le code d'origine d'un shift existant reste toujours accepté.
5. **Section « Qui et quand »**
   - Liste « Membre du staff » : les personnes actives et sous contrat ce jour-là, plus la personne actuellement choisie. Suffixe « (hors contrat ce jour-là) » si besoin.
   - Liste « Jour » : Lundi … Dimanche. On peut déplacer le shift ou en créer un sur un autre jour.
   - **Contrôle de disponibilité** : si la personne choisie n'est pas disponible ce jour-là et qu'on a changé la personne ou le jour, on affiche en rouge « {Prénom} n'est pas sous contrat (ou est désactivé·e) ce jour-là : choisissez une autre personne ou un autre jour. ».
     - Le bouton principal est alors désactivé, avec l'infobulle « Pas sous contrat (ou désactivé) ce jour-là : voir sa fiche ».
   - Modification uniquement : interrupteur de validation, « Validé : les générations gardent ce shift tel quel » / « Proposition : la prochaine génération pourra le changer ».

**Pied du tiroir**

- **Supprimer** (modification uniquement) : bouton en deux temps « Supprimer » → « ✓ Confirmer la suppression » → `DELETE /affectations/{id}`.
- **« Annuler »**.
- **Bouton principal** :
  - « Poser l'école » ou « Poser l'absence » si un motif est choisi → `POST /semaines/{lundi}/absences {salarie_id, jour, type_absence_id}`, puis rechargement global ;
  - sinon « Enregistrer » (modification) → `PATCH` avec tous les champs + `epinglee` ;
  - ou « Ajouter le shift » (création) → `POST /affectations`.
- Envoi : en horaire spécifique, `type_shift_id = null` et `court = false`. `court` n'est conservé que si le code a un raccourci.
- Le tiroir se ferme immédiatement ; le résultat arrive par toast et alertes.

### 2.12 Colonne Bilan « Semaine / Heures » (lignes 928-949, 980-987)

- **Forfait jours** : « {jours} j · forfait ».
- **Sinon** : « {heures} / {heures contrat} », par exemple « 37h30 / 39h ».
- Couleur :
  - rouge si minutes > `minutes_max` ;
  - orange si différent du contrat (hors forfait) ;
  - neutre sinon.
- Mini-jauge = minutes / contrat, plafonnée à 100 %.
- Infobulle :
  - « Forfait jours : {n} jours travaillés (heures non décomptées) » ;
  - « Au-delà du maximum de {max} » ;
  - « Pile les heures du contrat » ;
  - ou « {écart} de moins que le contrat » / « {écart} de plus que le contrat ».

### 2.13 Panneau « Points d'attention » (PanneauAlertes.tsx), commun semaine et mois

- Tiroir, titre « Points d'attention », sous-titre « Ce qui manque et ce qui coince {cette semaine | en novembre} ».
- **Section « Shifts à pourvoir ({n}) »**
  - Vide : « Tous les besoins sont couverts. ».
  - Une ligne dépliable par trou, avec en résumé : pastille couleur du poste, **nom du poste**, date (« lun. 3 nov. »), « début–fin », badge « ×{manquant} » si > 1.
  - Dépliée :
    - sans raison : « Personne dans l'équipe ne tient ce poste seul. » ;
    - sinon, une ligne par candidat : « **Prénom** : » suivi de ses messages séparés par « ; », ou « disponible, au détriment de son volume horaire » s'il n'a aucun message.
- **Section « Par personne ({n}) »**
  - Vide : « Rien à signaler. ».
  - Par personne : prénom en gras, puis la liste de ses alertes (rouge si `loi`).
  - Préfixe « sem. du {lun. 3 nov.} · » s'il y a plusieurs semaines (vue mois).
  - Badge du code de règle s'il commence par « R- ».
- Panneau en lecture seule.

### 2.14 Fiche salarié depuis le planning

- Un clic sur le nom ouvre la même `FicheSalarie` que l'écran Équipe (§4.2), sur une copie de la fiche.
- Après enregistrement, `recharger()` relance le chargement de la semaine.

---

## 3. Planning : vue mois (VueMois.tsx)

### 3.1 Navigation et chargement

- **Barre gauche** (PlanningPage.tsx:468-494) :
  - ‹ « Mois précédent » ;
  - nom du mois, par exemple « novembre 2026 » (clic : « Revenir à ce mois ») ;
  - › « Mois suivant ».
- **Semaines couvertes** : tous les lundis des jours du mois.
- **Chargement séquentiel**, semaine après semaine, via `semaineAvecFixes` (horaires fixes posés sur les semaines à venir). Une semaine vide reste vide.
  - Rechargé quand les données changent.
  - Erreur : toast « Le mois ne se charge pas. ».
  - Tant que tout n'est pas chargé : « Chargement du mois… ».
- **Après chaque écriture sur une semaine**, les semaines voisines du mois (−7 et +7 jours) sont relues : le repos de 11 h passe d'une semaine à l'autre.
- Mêmes toasts d'alerte HCR que la vue semaine pour la case touchée.

### 3.2 Barre droite

- **Indicateurs** (une fois le mois chargé) :
  - Compteur de validation : uniquement les shifts dont la date tombe dans le mois. Ceux des semaines verrouillées comptent comme « verrouillés ».
  - Jauge « Couverture du mois : {p} places pourvues sur {n} » : somme des stats des semaines chargées, **semaines entières**.
  - Bouclier : « {n} infraction(s) HCR ce mois-ci » / « Conforme aux règles HCR tout le mois ».
- **Aide (?)** : « Clic : modifier le jour (horaire, poste, absence, école…) / Clic droit : changer l'horaire ou la journée étoile / Glisser un shift : le déplacer, même vers une autre semaine (Alt : le dupliquer) / Glisser un repos, une absence ou l'école : dans sa semaine ».
- **Cadenas du mois** (lignes 350-361)
  - Le mois est « verrouillé » si **toutes** ses semaines le sont. Désactivé si occupé ou pas chargé.
  - Infobulle : « Mois verrouillé (plannings réalisés) : cliquer pour le déverrouiller » / « Verrouiller tout le mois : plus de modification ni de génération ».
  - Action : `PUT verrou` sur chaque semaine du mois, dans l'ordre, y compris les semaines à cheval sur deux mois, verrouillées en entier.
  - Toast « Mois verrouillé » / « Mois déverrouillé : il se modifie de nouveau », puis rechargement global (même en cas d'arrêt en route).
- **Alertes ⚠** : badge = somme des `a_pourvoir` + alertes des bilans. Infobulle « Points d'attention du mois ({n}) ». Ouvre le PanneauAlertes avec toutes les semaines.
- **✨ « Compléter le mois »** (lignes 247-262)
  - Désactivé si occupé ou pas chargé. Infobulle « Chargement du mois… » ou « Semi-auto : recalcule les propositions du mois (nouveau tirage à chaque clic) ; le validé ne bouge pas ».
  - Logique : `generer` avec une graine nouvelle, **séquentiellement** (dans l'ordre, pour le repos de 11 h), sur les seules **semaines ouvertes** (`ouvertes()`, lignes 239-243), c'est-à-dire :
    - non verrouillées ;
    - postérieures au dernier planning réalisé (`apresLeRealise`) ;
    - dont le lundi ≥ lundi de la semaine courante.
  - L'écran se met à jour semaine par semaine.
  - Toast final : « Mois généré · {trous} place(s) à pourvoir » (attention) ou « Mois complet généré ». `trous` = somme sur toutes les semaines du mois de `places − pourvues`.
  - **Arrêt sur erreur** (`parSemaine`, lignes 212-235) : toast danger « {Libellé} : arrêt à la semaine {S45} (du {JJ/MM}). {message}[ Les {n} semaine(s) d'avant sont faites.] ». Les semaines déjà faites sont conservées.
- **Menu ⌄**. Toutes ces actions portent sur les semaines ouvertes uniquement, et aucune ne demande de confirmation.
  - **Générer**
    - « Compléter le mois », aide « Semi-auto : propose autour de ce qui est validé ».
  - **Valider**
    - « Valider les {n} proposition(s) du mois » (ou « Valider les propositions du mois »), aide « Elles deviennent validées : les générations les gardent ».
      - Inactif sans proposition : « Rien à valider : pas de proposition en attente ».
      - Toast « Propositions du mois validées ».
    - « Tout remettre en proposition », aide « Plus rien de validé : la génération peut tout changer ».
      - Inactif : « Rien de validé ce mois-ci ».
      - Toast « Le mois est remis en proposition ».
  - **Effacer**
    - « Effacer les propositions du mois », aide « Garde le validé ».
      - Inactif : « Aucune proposition à effacer ».
      - Toast « Propositions du mois effacées ».

### 3.3 Grille du mois

- **En-tête, 1re ligne** :
  - « {n} personnes » ;
  - une cellule par semaine, sur toute sa largeur dans le mois : bouton « S45 » + cadenas si la semaine est verrouillée. **Un clic ouvre la vue semaine.** Infobulle « Semaine 45 : du 3 nov. au 9 nov. [Verrouillée : planning réalisé] Cliquer pour l'ouvrir en vue semaine » ;
  - « Mois / Heures ».
- **En-tête, 2e ligne** : initiale du jour + numéro. Trait plus marqué devant chaque lundi, aujourd'hui surligné.
- **Personnes visibles** : sous contrat au moins un jour du mois **et** (actives ou ayant un shift dans le mois). Regroupées par catégorie comme en vue semaine.
- **Nom** : bouton qui ouvre la fiche. Icône ⚠ cumulant les alertes de toutes les semaines (dédoublonnées) ; infobulle « Ouvrir la fiche » + « ⚠ … ».
- **Case avec shift** : pastille de 32 px à la couleur du code, début et fin en entier sur deux lignes, ★ si journée étoile.
  - Proposition : pointillés et fond pâle. Alerte `loi` : anneau rouge.
  - Infobulle : « {lun. 3 nov.} · {nom horaire | Horaire spécifique} {début}–{fin} · {durée, absente au forfait} · {validé | proposition} », puis les alertes, puis « Cliquer pour modifier ».
- **Case vide** : infobulle « {date} · Non attribué ».
- **Bandeaux** (lignes 298-303, 764-836). Repos, absence (même motif et même origine fixe ou posée), école et hors contrat **fusionnent en un bandeau continu**, même par-dessus le changement de semaine.
  - Le bandeau est centré, avec icône et nom ; les séparateurs de semaine restent visibles derrière.
  - Chaque jour reste un segment cliquable, cliquable droit et zone de dépôt. Il est déplaçable s'il n'est ni fixe ni en semaine verrouillée.
  - Une absence fixe et une absence posée à la main font deux bandeaux distincts. Un repos fixe se fond dans le bandeau repos.
  - Infobulle d'un segment : « {période début → fin} · {nom}{précision} / Cliquer pour modifier ce jour ». Précisions :
    - absence fixe : « (semaine type, dans la fiche) » ;
    - hors contrat : « (arrivée ou fin de contrat) » ;
    - repos fixe : « de la semaine type : à changer dans la fiche ».
- **Colonne Heures** : somme des durées des shifts des jours du mois, ou « {n} j · forfait » (infobulle « Forfait jours : journées travaillées dans le mois »). Pas de comparaison au contrat.
- Semaine verrouillée : cases hachurées, curseur par défaut.

### 3.4 Interactions

- **Clic sur un jour** (`ouvrir`, lignes 496-507) :
  - semaine verrouillée : toast « Semaine verrouillée : planning réalisé. Le cadenas de la vue semaine permet de la rouvrir. » ;
  - hors contrat : toast hors contrat ;
  - occupé ou pas chargé : toast « Calcul en cours… » ;
  - sinon, l'éditeur s'ouvre, en modification s'il y a un shift, en création sinon. Mêmes callbacks qu'en vue semaine, sur la semaine concernée.
- **Clic droit** : mêmes garde-fous, puis `MenuCase` avec horaires, validation et étoile (même logique que §2.10).
- **Glisser-déposer** (lignes 365-489) :
  - seuls les shifts sont déplaçables dans les cases ; les statuts se glissent depuis les segments ;
  - tout dépôt touchant une semaine verrouillée (source ou cible) est refusé avec le toast de verrou ;
  - cible hors contrat : refus.
  - **Statut** :
    - vers une autre semaine : « Un repos, une absence ou l'école se déplace dans sa semaine. » ;
    - sur une cible fixe : « Jour fixe de la semaine type : à changer dans la fiche. » ;
    - repos vers une autre personne : « Un repos se déplace sur la même ligne : il s'échange avec un jour travaillé. » ;
    - sinon : `statuts/deplacer`, puis rechargement global.
  - **Shift** :
    - Alt = duplication : si la cible est occupée, « Cette personne a déjà un shift ce jour-là : un seul par jour. » ;
    - même semaine : `PATCH` (échange possible avec l'occupant), **non optimiste** contrairement à la vue semaine ;
    - **autre semaine** : refusé si la cible est occupée. Sinon `POST` dans la semaine cible, puis `DELETE` dans la semaine d'origine. Si la suppression échoue : toast danger « Le shift a été recopié en semaine {S}, mais n'a pas pu être retiré de la semaine {S} : il est en double, à supprimer à la main. … ».
  - Indices : mêmes règles qu'en vue semaine. En plus, pour un statut, toute case hors de sa semaine est déconseillée ; pour un shift, une case avec un motif ou fixe est déconseillée.
  - Fantôme : petite pastille (shift) ou étiquette du nom (statut).

---

## 4. Équipe (EquipePage.tsx, CalendrierEcole.tsx)

### 4.1 Liste

- En-tête « Équipe » : « {n} membres. Chaque fiche décrit le contrat, les postes tenus, la semaine type et les absences : le moteur s'en sert pour générer le planning. ».
- Boutons « Catégories » (ouvre la gestion des catégories) et « Ajouter » (fiche vierge).
- Liste groupée par catégorie, titre « {nom} {effectif} », « Sans catégorie » en dernier.
- **Carte d'une personne** (cliquable : ouvre la fiche) :
  - avatar avec initiales, à la couleur du poste principal (1er titulaire, sinon 1re compétence ; gris par défaut), texte noir ou blanc selon la luminance ;
  - nom, et postes tenus « Réception · Club » (« — » si aucun).
  - Puces :
    - contrat (libellé de `types_contrat`) ;
    - « Forfait jours » ou « {h} h » ;
    - « Mineur » ;
    - « Désactivé » ;
    - « Arrive le {date} » si l'arrivée est dans le futur ;
    - « Parti(e) le {date} » (si la date de sortie est passée) ou « Fin de contrat le {date} ».
  - La carte est grisée (« parti ») si la sortie est passée ou si la personne est désactivée.
  - Puces de compétences : pastille du poste + nom + « · Dépannage » ou « · Soutien » (rien pour titulaire). L'infobulle donne l'aide du niveau :
    - Titulaire : « Tient le poste seul, au quotidien » ;
    - Dépannage : « Peut le tenir seul, à éviter si possible » ;
    - Soutien : « En renfort uniquement, jamais seul ».

### 4.2 Fiche salarié (`FicheSalarie`), en Tiroir

- **Titre** : « Prénom Nom », ou « Nouveau membre » en création. **Sous-titre** : la catégorie, ou « Fiche du staff ».
- **Fiche vierge par défaut** (lignes 31-50) : CDI, 39 h, sans forfait, non mineur, active, semaine type entièrement en mode « Libre », aucun poste, aucune absence.
- **Pied** :
  - « Supprimer » en deux temps (fiche existante) ;
  - « Annuler » ;
  - « Enregistrer » (« Enregistrement… » pendant l'envoi), **désactivé si le prénom est vide**.
  - Un seul enregistrement à la fois (le verrou bloque le double clic).
  - Enregistrement : `POST` ou `PUT /salaries`, rechargement, toast « Fiche enregistrée », fermeture. Erreur : toast danger (défaut « La fiche n'a pas pu être enregistrée. »).
  - Suppression : `DELETE /salaries/{id}`, toast « {Prénom} a été retiré(e) de l'équipe ». Erreur : toast **attention** (défaut « {Prénom} figure dans des plannings réalisés : indiquez plutôt sa fin de contrat (ou faites évoluer son contrat). »).
- Échap ou clic sur le voile ferme **sans enregistrer**, sans avertissement.

**Section « Identité & contrat »**

- Prénom, Nom.
- **Catégorie** (« Sans catégorie » + catégories existantes).
  - En changeant, les compétences sur des postes non prévus pour la nouvelle catégorie sont **retirées**, avec le toast attention « {n} compétence(s) retirée(s) : poste non prévu pour cette catégorie ».
- **Contrat** (liste `references.types_contrat`).
  - Passer en `extra` : heures = 0 et forfait désactivé.
  - Sortir d'`extra` : heures = ancienne valeur, ou 35 si elle était à 0.
- **Heures par semaine** : nombre de 0 à 48, pas de 0,5. Le champ reste éditable même pour un extra.
- **Arrivée** (date ; infobulle « Vide : présent depuis toujours »).
- **Fin de contrat** (date, minimum = arrivée ; infobulle « Fin de CDD, démission, fin de contrat… Après cette date, plus jamais planifié(e) ; reste dans l'historique »).
- Interrupteurs :
  - « Cadre au forfait jours » ;
  - « Mineur (16-18 ans) » ;
  - « Actif » / « Désactivé : plus proposé ni affiché au planning (historique gardé) ».
- **« Faire évoluer le contrat »** (fiche existante ; infobulle « Promotion (apprenti devenu hôtelier), passage en extra, nouveau contrat… L'historique reste sur le contrat actuel. »). Ouvre le bloc « Nouveau contrat » :
  - Texte d'aide : « Le contrat actuel s'arrête la veille ; le nouveau reprend ses postes (le soutien devient titulaire hors alternance), ses congés à venir et sa semaine type. L'historique reste. ».
  - Champs :
    - « À partir du » (défaut : demain) ;
    - Contrat (défaut : CDI si apprenti, sinon le contrat actuel) ;
    - Catégorie ;
    - Heures par semaine (1 à 48, masqué pour un extra ; défaut : heures actuelles, ou 35).
  - Boutons « Annuler » et « Créer le nouveau contrat » (« Création… » pendant l'envoi).
  - **Validations** :
    - date invalide : « Indiquez la date de début du nouveau contrat. » ;
    - date ≤ arrivée : « La date doit être après l'arrivée sur le contrat actuel. » ;
    - heures ≤ 0 hors extra : « Indiquez les heures par semaine du nouveau contrat (plus de 0 h). ».
  - **Logique** (lignes 321-406) :
    1. Ancienne fiche : `date_sortie` = veille de la date choisie, sauf si elle était déjà terminée avant. Absences coupées à cette date. Enregistrée en `PUT`.
    2. Nouvelle fiche, `POST` avec `suite_de` = id de l'ancienne :
       - nouveaux contrat, catégorie et heures (0 si extra, forfait désactivé si extra) ;
       - entrée = la date choisie ; sortie conservée si elle est postérieure ;
       - active ;
       - compétences filtrées sur les postes de la nouvelle catégorie, soutien → titulaire hors alternance ;
       - absences à venir conservées, sauf l'école hors alternance ;
       - jours d'école de la semaine type remis en « Libre » hors alternance.
    3. Si la création échoue, l'ancienne fiche est réenregistrée telle quelle, avec le toast « Le nouveau contrat n'a pas pu être créé ; le contrat actuel est rétabli tel quel. … ». Si ce rétablissement échoue aussi : « … et le contrat actuel est resté fermé au {date} : remettez sa fin de contrat à la main. … ».
    4. Succès : toast « {Prénom} : nouveau contrat à partir du {date} », fermeture.

**Bloc « École »** (`CalendrierEcole`)

- Affiché si le contrat est `apprenti` ou `stagiaire` **et** qu'un motif école existe. Sinon, pour ces contrats, l'aide « Créez un motif de nature « École » dans « Horaires et absences » pour saisir son calendrier d'école. ».
- Un motif est « école » si sa nature vaut `ecole`, à défaut si son code est `EC` ou si son nom commence par « école », accents ignorés (api.ts:68-71).
- Aide : « Cliquez sur ses jours d'école. Le moteur ne la planifie jamais ces jours-là et la remplit les autres jours. ».
- **« Chaque semaine »** : 7 boutons L M M J V S D. Un bouton bascule le jour de la **semaine type** entre `absence` (motif école) et `auto`.
  - Infobulle « École ce jour-là, toutes les semaines » / « Pas d'école ce jour-là ».
- **« Semaines d'école, du lundi au vendredi »**, avec le compteur « {n} sur 26 à l'école ».
  - 26 semaines à partir du lundi courant, rangées par mois. Chaque bouton affiche « S45 » et la date.
  - États : école (5 jours), « partielle », vide.
  - Un clic remplit ou vide **du lundi au vendredi**.
  - Infobulle « Semaine du {3 nov.} : école | quelques jours d'école | à l'hôtel ».
- **Rythme** (baguette magique) : « [1–8] sem. d'école, puis [0–12] à l'hôtel, dès la [S45 (3 nov.)] » + bouton « Remplir ».
  - Applique le cycle à partir de la semaine choisie jusqu'à la fin des 26 semaines : remplit ou **efface** du lundi au vendredi.
- Stockage : les jours sont regroupés en périodes consécutives `{debut, fin, type_absence_id: école}` dans `absences`. Les périodes illisibles (en cours de saisie, plus de 3 ans) restent intactes.

**Section « Compétences »**

- Aide : « Les postes qu'elle tient, et comment. Titulaire : seule sur le poste. Dépannage : seule aussi, mais le moteur préfère un titulaire. Soutien (apprenti, stagiaire) : en renfort, jamais seule. ».
- Aucun poste : « Aucun poste : elle ne peut pas être planifiée. Ajoutez-lui au moins un poste. ».
- Une ligne par poste tenu : pastille, nom (+ « · poste à part »), choix segmenté Titulaire / Dépannage / Soutien (infobulles = aides), bouton × (infobulle « Retirer le poste « {nom} » de sa fiche »).
- Liste « + Ajouter un poste [(prévus pour « {catégorie} »)] » : seulement les postes autorisés par la catégorie et pas encore tenus.
  - Deux groupes d'options : « Postes courants » et « Postes à part (direction, supervision, technique…) ».
  - Niveau par défaut : soutien pour apprenti ou stagiaire, titulaire sinon.

**Section « Horaires autorisés »**

- Aide : « Les horaires qu'elle fait, toute la semaine : par exemple Après-midi et Middle pour quelqu'un qui ne fait jamais le matin, ou Nuit seule pour un veilleur à temps plein. », suivie de « Seuls les horaires sélectionnés lui seront proposés. » ou « Aucun sélectionné : tous les horaires sont possibles. ».
- Une puce cliquable par code horaire : « {nom} {début}–{fin} », bordure à la couleur du code quand elle est choisie.

**Section « Semaine type »** : 7 lignes (Lundi à Dimanche)

- Aide : « Libre : le moteur décide si elle travaille ; avec un horaire choisi, ce sera celui-là les jours où elle travaille (de nuit le week-end, par exemple). Travaille : elle travaille toujours ce jour-là. Repos et Absence (congé, ou école d'un apprenti) : jamais planifiée ce jour-là. ».
  - Plus, si l'étoile est possible : « ★ : journée étoile (la journée courte) fixée ce jour-là ; sans étoile, le moteur la place selon les besoins. ».
- **Mode** (choix segmenté) : Libre (`auto`), Travaille (`travail`), Repos (`repos`), Absence (`absence`).
- Mode Libre ou Travaille : liste d'horaire, avec l'option vide « Ses horaires » (si la fiche restreint) ou « Tout horaire », puis les horaires autorisés de la fiche, ou tous.
- Mode Absence : liste de **tous** les motifs, y compris l'école. Par défaut, le motif actuel ou le 1er de la liste.
- Changer de mode efface `type_shift_id` (sauf vers Travaille) et `type_absence_id` (sauf vers Absence). Le mode Libre perd aussi son horaire (lignes 290-296).
- **Étoile ★** : possible si heures > 35, pas de forfait, et contrat différent d'`extra`. Bouton visible en Libre ou Travaille.
  - **Une seule étoile par semaine** : en activer une désactive les autres.
  - Infobulle « Journée étoile fixée le {jour} : cliquer pour la laisser variable » / « Fixer la journée étoile (courte) le {jour} ».

**Section « Absences »**

- Aide : « Vacances, repos exceptionnels, sans solde, maladie : une période par ligne. Les motifs se créent dans « Horaires et absences ». ».
- Une ligne par période :
  - « Du » (date) : si elle dépasse « Au », « Au » est avancé à la même date ;
  - « Au » (minimum = Du) ;
  - Motif : motifs non-école, plus le motif actuel ;
  - bouton poubelle.
- Les périodes école sont **masquées** ici quand le bloc École les gère (alternance et motif école existant).
- « + Ajouter une absence » : période d'aujourd'hui à aujourd'hui, 1er motif non-école. Désactivé s'il n'existe aucun motif non-école.

**Section « Règles HCR appliquées »**

- Aperçu en direct : `POST /regles/apercu` avec la fiche, déclenché 250 ms après un changement de contrat, d'heures, de forfait ou de mineur.
- Liste des textes, avec un badge de code si la règle commence par « R- ». Erreur : liste vide.

### 4.3 Gestion des catégories (`GestionCategories`), en Tiroir

- Titre « Catégories du staff », sous-titre « Rangement du planning et de l'équipe, de haut en bas ». Pied : « Terminé ».
- Aide : « Range les personnes et dit quels postes elles peuvent tenir : la fiche ne propose que ceux-là (un hôtelier ne tient pas la direction). Aucun poste choisi : tous sont possibles. La catégorie de chacun se choisit dans sa fiche. ».
- Par catégorie :
  - champ nom, **renommé à la perte de focus** (Entrée = blur), ignoré si vide ou inchangé ;
  - « {n} personne(s) » ;
  - ↑ « Monter » / ↓ « Descendre », désactivés aux extrémités et pendant une écriture. Échange de deux catégories, puis `PUT` de chaque catégorie dont l'ordre change (renumérotation 0, 1, 2…) ;
  - « Supprimer » en deux temps, puis toast « Catégorie « {nom} » supprimée : ses membres passent « sans catégorie » » ;
  - puces des **postes autorisés** : chaque clic enregistre immédiatement.
- « + Ajouter une catégorie » : `POST {nom: 'Nouvelle catégorie'}`, toast « Catégorie ajoutée en dernier : renomme-la ».
- Erreurs : toast danger avec le message du serveur, puis rechargement.

---

## 5. Postes, Horaires et absences, Besoins

### 5.1 Postes (PostesPage.tsx)

- En-tête : « Postes », texte « Crée les postes dont l'hôtel a besoin. La catégorie réglementaire fixe la durée maximale d'un service selon la convention HCR. ».
- Bouton « Nouveau poste », plus une tuile « + Nouveau poste » en fin de grille. Les deux sont désactivés pendant la création.
- **Création** : nom « Nouveau poste », catégorie `autre`, couleur suivante de la palette, aucun horaire, pas à part. Toast « Poste créé : renomme-le directement sur sa carte ».
- **Carte d'un poste** (liseré haut à sa couleur). Tous les changements s'enregistrent immédiatement par `PUT` :
  - nom : à la perte de focus ou Entrée, ignoré si vide ou inchangé ;
  - « Catégorie réglementaire » : liste « {libellé} — service max {Xh} » ;
  - nuancier de couleur ;
  - interrupteur « Poste à part : proposé seulement dans la fiche de qui le tient » / « Poste courant : proposé à toute la catégorie » ;
  - « Horaires possibles » : puces des codes (infobulle « {nom} {début}–{fin} »), avec la mention « Seuls ces horaires sont proposés pour ce poste. » ou « Aucun choisi : tous les horaires sont possibles. » ;
  - chiffres : nombre de titulaires, de dépannages, de soutiens, et « besoins / sem. » = Σ effectif × durée de présence (pause **non** déduite) ;
  - « Service max {Xh} » ;
  - suppression en deux temps, avec le libellé de confirmation **« Supprimer, avec ses besoins et shifts ? »**. Toast « Poste « {nom} » supprimé ».
- Erreurs :
  - enregistrement : toast danger (défaut « Le poste n'a pas pu être enregistré. »), puis rechargement ;
  - suppression : « Le poste « {nom} » n'a pas pu être supprimé. ».

### 5.2 Horaires et absences (HorairesPage.tsx)

**Codes horaires**

- En-tête « Codes horaires », texte « Les horaires types de l'hôtel (matin, middle, après-midi, nuit…). Chacun a sa couleur, reprise sur les cartes du planning. La pause compte dans la présence mais pas dans les heures ; la journée courte finit plus tôt (39 h = 4 × 8 h + 1 × 7 h, choisie par le planning). Modifier un horaire met à jour les shifts déjà posés avec ce code. ».
- Bouton « Nouveau code » + tuile « Nouveau code horaire ».
- **Création** : code `X`, nom « Nouvel horaire », 09:00–17:45, pause 45 min, raccourci 60, raccourci au début 0. Toast « Code horaire créé ».
- **Carte d'un code** :
  - badge du code : 4 caractères maximum, mis en **MAJUSCULES**, enregistré à la perte de focus ;
  - nom (perte de focus ou Entrée) ;
  - heure de début → heure de fin, enregistrées **à chaque changement** ;
  - badge de durée travaillée (infobulle « Temps de travail, pause déduite ») ;
  - « Pause [0–180, pas de 5] min » ;
  - « Journée courte [0–240, pas de 15] min de moins » ;
  - si raccourci > 0 : « dont [0–raccourci] min au début », plafonné au raccourci (infobulle « Minutes retirées au début : la journée courte commence plus tard ») ;
  - « 🌙 Finit le lendemain » si fin ≤ début ;
  - nuancier ;
  - « Utilisé dans {n} besoin(s) » ou « Non utilisé » ;
  - suppression en deux temps, toast « Code « {nom} » supprimé ».
  - Erreurs : « Le code horaire n'a pas pu être enregistré. » (puis rechargement) / « Le code « {nom} » n'a pas pu être supprimé. ».
- **Frise « Journée type »** : graduations de 0 h à 24 h toutes les 3 h, une barre par code. Un horaire de nuit est coupé en deux barres. Libellé « {code} · {nom} », infobulle avec les heures.

**Motifs (« Absences et école »)**

- Texte : « Chaque motif a sa couleur, se pose sur une case du planning comme un horaire et s'utilise dans les fiches. Absences : vacances, repos exceptionnels, sans solde, maladie… École : la formation hors établissement des apprentis, qui n'est pas une absence. ».
- Deux groupes, « Absences » et « École ». Le groupe École est masqué s'il est vide ; la tuile « Nouveau motif » est dans le groupe Absences.
- **Création** : code `AB`, nom « Nouveau motif », compté dans les heures, nature absence. Toast « Motif créé ». Anti-double-clic.
- **Carte d'un motif** :
  - code (4 caractères, majuscules) et nom ;
  - **Nature**, choix segmenté :
    - « Absence » (infobulle « Absence : vacances, repos exceptionnel, sans solde, maladie… », aide « La personne est absente ce jour-là. ») ;
    - « École » (« École – formation hors établissement (apprentis) », aide « Formation hors établissement : comptée comme du travail, ce n'est pas une absence. ») ;
  - nuancier ;
  - case à cocher « Compté dans les heures » (infobulle « Un jour de ce motif vaut une journée de travail : il est retiré des heures dues de la semaine ») ;
  - « Utilisé par {n} personne(s) » (absences ou semaine type) ou « Non utilisé » ;
  - suppression en deux temps, toast « Motif « {nom} » supprimé ».
  - Erreurs : « Le motif n'a pas pu être enregistré. » / « Le motif « {nom} » n'a pas pu être supprimé. ».

### 5.3 Besoins (BesoinsPage.tsx)

- En-tête : « La semaine type de l'hôtel : pour chaque poste et chaque code horaire, le nombre minimum de personnes autonomes, les places de soutien pour stagiaires et apprentis, et les places « en plus », facultatives (un middle quand il y a du travail). ».
- Encadré de rappel (bouclier) : « Les effectifs minimum sont garantis par le moteur : 1 personne en réception et 1 au club le matin et l'après-midi, 1 veilleur la nuit. Les places « en plus » ne sont jamais à pourvoir : le planning les remplit seulement si quelqu'un manque d'heures. Les profils « soutien » viennent en plus, jamais seuls. ».
- **Une carte par poste** :
  - nom du poste + badge « {Xh} de présence / semaine » (Σ effectif × durée, pause non déduite) ;
  - bouton « Afficher tous les codes (+{n cachés}) » / « Masquer les codes non utilisés ».
- **Lignes du tableau** : les codes autorisés pour le poste qui ont au moins un besoin (ou tous si on les affiche), plus les lignes « Horaire spécifique » (besoins sans code, regroupés par début et fin). Tri par heure de début.
  - Vide : « Aucun besoin pour ce poste. Affiche tous les codes pour en ajouter. ».
  - Colonne Horaire : badge du code (ou « — »), nom, « début–fin ».
- **Cellule par jour** (Lun. à Dim.) :
  - **Compteur effectif minimum** de 0 à 20. Créer un besoin (passer de 0 à 1 sans besoin existant) **ouvre par défaut 1 place de soutien**.
  - « − +{n} soutien + » : de 0 à 5, visible si le besoin existe ou si effectif > 0 (infobulle « Places de soutien »).
  - « − +{n} en plus + » : renfort de 0 à 5, toujours visible, en grisé s'il vaut 0 (infobulle « Places en plus, facultatives : jamais à pourvoir »).
- **« ⇉ Toute la semaine »** en fin de ligne (infobulle « Recopier le réglage du lundi sur toute la semaine ») : recopie effectif, soutien et renfort du lundi sur mardi → dimanche.
- **Enregistrement** : mise à jour optimiste locale, puis un `POST /besoins/regler` **par jour**. Avec 0 / 0 / 0, le besoin est supprimé côté local ; le serveur renvoie `null`.
  - Erreur : toast danger « Le besoin n'a pas pu être enregistré ». Rechargement global dans tous les cas.

---

## 6. Composants partagés (ui.tsx)

- **`Infobulles`** (lignes 27-96) : une seule infobulle pour toute l'application.
  - Tout élément portant `data-tip="…"` l'affiche au survol **ou au focus**, après 300 ms. Les `\n` donnent plusieurs lignes ; largeur maximale 280 px.
  - Placée au-dessus de l'élément, ou en dessous s'il est à moins de 70 px du haut. Recadrée horizontalement dans la fenêtre, la flèche restant sur l'élément.
  - Masquée sur clic, défilement ou touche clavier. Remplace l'attribut `title` natif partout.
- **`DansLaBarre` / `ContexteBarre`** (lignes 102-110) : portail vers les emplacements gauche et droit de la barre du haut.
- **`Tiroir`** (lignes 114-151) : panneau latéral droit de 560 px maximum, avec un voile sombre.
  - En-tête : titre, sous-titre et bouton × « Fermer ». Puis le corps, et un pied facultatif.
  - Échap ou clic sur le voile ferme.
  - Utilisé par : éditeur de shift, fiche salarié, catégories, panneau d'alertes.
- **Toasts** (`FournisseurToasts` / `useNotifier`, lignes 155-182) : `notifier(texte, ton='info', durée=4500 ms)`.
  - Tons : `info` (neutre), `attention` (orange), `danger` (rouge ; **au moins 7 s** d'affichage).
  - **3 toasts au maximum** à l'écran (les plus anciens sont retirés), en bas au centre, largeur maximale 460 px, `aria-live="polite"`.
  - Le texte accepte du JSX (« **Règle HCR :** … »).
- **`Segmente`** (lignes 186-211) : groupe radio de boutons, avec l'infobulle `titre` par option. Utilisé pour le niveau de compétence, le mode du jour de la semaine type et la nature d'un motif.
- **`Compteur`** (lignes 213-237) : − valeur +, bornes min et max (0 à 20 par défaut), boutons désactivés aux bornes. Utilisé pour l'effectif des besoins.
- **`Nuancier`** (lignes 239-260) : 12 couleurs de la `PALETTE` (lignes 18-21), la couleur choisie mise en évidence, plus un sélecteur libre « Autre couleur ». Utilisé pour les postes, les codes horaires et les motifs.
- **`Interrupteur`** (lignes 262-277) : case à cocher avec un libellé. Utilisé dans la fiche, l'éditeur de shift et les postes.
- **`BoutonSupprimer`** (lignes 281-321) : suppression en deux temps, sans boîte de dialogue du navigateur.
  - Lien rouge « Supprimer », puis bouton rouge « ✓ Confirmer la suppression » (libellés paramétrables).
  - Se désarme seul après 4 s. Désactivé tant que la promesse n'a pas répondu.
- **`GardeErreur`** : voir §1.
- **Utilitaires de api.ts** utiles au portage :
  - `heures()` : « 7h », « 7h30 » ;
  - `dateCourte` : « JJ/MM » ;
  - `numeroSemaine` (ISO) ;
  - `texteSur` : texte noir ou blanc selon la luminance, seuil 0,62 ;
  - `heureAffichee` : 24:00 → 00:00 ;
  - `horaireCourt`, `horairesDuPoste`, `postesDuGroupe`, `parGroupe`, `jourDeRepos`, `sousContrat`, `disponibleLe`, `estEcole`, `apresLeRealise`.
  - `messageErreur` : le `detail` du serveur, ou une liste 422 « champ : msg ; … ».
  - Erreur réseau : « Le moteur ne répond pas : vérifiez que la fenêtre « Planning - API » est ouverte. ».
  - Erreur HTTP sans détail : « Le serveur a refusé l'action (erreur {status}). ».

---

## 7. Appels API (api.ts:255-319, préfixe `/api`, JSON)

| Fonction                | Méthode et chemin                                                | Paramètres                                                                               | Écran / déclencheur                                                                                        |
| ----------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| references              | GET /references                                                  | —                                                                                        | App, chargement et rechargement                                                                            |
| horaires                | GET /horaires                                                    | —                                                                                        | App                                                                                                        |
| postes                  | GET /postes                                                      | —                                                                                        | App                                                                                                        |
| salaries                | GET /salaries                                                    | —                                                                                        | App                                                                                                        |
| besoins                 | GET /besoins                                                     | —                                                                                        | App                                                                                                        |
| motifs                  | GET /motifs                                                      | —                                                                                        | App                                                                                                        |
| groupes                 | GET /groupes                                                     | —                                                                                        | App                                                                                                        |
| enregistrer('salaries') | POST /salaries ou PUT /salaries/{id}                             | fiche complète (+ `suite_de`)                                                            | Fiche : Enregistrer ; évolution de contrat (PUT de l'ancienne, POST de la nouvelle, PUT de rétablissement) |
| enregistrer('groupes')  | POST / PUT /groupes                                              | {nom, ordre, postes_autorises}                                                           | Catégories : ajouter, renommer, monter/descendre, postes autorisés                                         |
| enregistrer('postes')   | POST / PUT /postes                                               | {nom, categorie, couleur, horaires_autorises, a_part}                                    | Postes : création et chaque modification                                                                   |
| enregistrer('horaires') | POST / PUT /horaires                                             | {code, nom, debut, fin, couleur, pause, raccourci, raccourci_debut}                      | Horaires : création et chaque modification                                                                 |
| enregistrer('motifs')   | POST / PUT /motifs                                               | {code, nom, couleur, decompte, nature}                                                   | Motifs : création et chaque modification                                                                   |
| supprimer               | DELETE /{ressource}/{id}                                         | salaries, groupes, postes, horaires, motifs (besoins jamais utilisé)                     | Boutons Supprimer correspondants                                                                           |
| apercuRegles            | POST /regles/apercu                                              | fiche (sans id)                                                                          | Fiche : section « Règles HCR appliquées » (250 ms après un changement)                                     |
| reglerBesoin            | POST /besoins/regler                                             | {poste_id, jour, type_shift_id, debut, fin, effectif, soutien, renfort} → Besoin ou null | Besoins : chaque compteur, « Toute la semaine » (un appel par jour)                                        |
| semaine                 | GET /semaines/{lundi}                                            | —                                                                                        | Relecture après échec (semaine et mois) ; chargement d'une semaine passée                                  |
| semaineAvecFixes        | POST /semaines/{lundi}/fixes si lundi ≥ lundi courant, sinon GET | —                                                                                        | Chargement semaine et chargement du mois (chaque semaine)                                                  |
| fixes                   | POST /semaines/{lundi}/fixes                                     | —                                                                                        | (pas appelé directement)                                                                                   |
| generer                 | POST /semaines/{lundi}/generer                                   | {graine, tout?} (exclus / seulement inutilisés)                                          | Semaine : ✨ et « Full auto » (tout: true) ; Mois : « Compléter le mois » (par semaine ouverte)            |
| vider                   | DELETE /semaines/{lundi}?garder_epinglees=bool                   | true = effacer les propositions, false = vider                                           | Semaine : menu Effacer ; Mois : « Effacer les propositions du mois » (true)                                |
| valider                 | POST /semaines/{lundi}/valider                                   | {salarie_id?, jour?, epinglee}                                                           | Semaine : ✓ d'un jour {jour}, menu (semaine), clic droit (case) ; Mois : menu (par semaine), clic droit    |
| verrouiller             | PUT /semaines/{lundi}/verrou                                     | {verrouillee}                                                                            | Cadenas semaine ; cadenas mois (chaque semaine)                                                            |
| ajouterShift            | POST /semaines/{lundi}/affectations                              | {salarie_id, poste_id, jour, type_shift_id, debut, fin, court}                           | Éditeur (création), clic droit sur une case vide, Alt+glisser, glisser vers une autre semaine (mois)       |
| modifierShift           | PATCH /affectations/{id}                                         | partiel {salarie_id, jour, poste_id, type_shift_id, debut, fin, court, epinglee}         | Éditeur (modification), glisser (déplacement / échange), clic droit (changer d'horaire), journée étoile    |
| supprimerShift          | DELETE /affectations/{id}                                        | —                                                                                        | Éditeur : Supprimer ; mois : 2e étape d'un déplacement vers une autre semaine                              |
| poserAbsence            | POST /semaines/{lundi}/absences                                  | {salarie_id, jour, type_absence_id}                                                      | Éditeur : « Poser l'absence / l'école » (puis rechargement global)                                         |
| retirerAbsence          | DELETE /semaines/{lundi}/absences?salarie_id&jour                | —                                                                                        | Éditeur : « Retirer l'absence / l'école » ; clic droit d'un horaire sur un jour en absence non fixe        |
| deplacerStatut          | POST /semaines/{lundi}/statuts/deplacer                          | {salarie_id, jour, vers_salarie_id, vers_jour}                                           | Glisser d'un repos ou d'une absence (semaine et mois), puis rechargement global                            |
| reinitialiser           | POST /demo/reinitialiser                                         | → {sauvegarde}                                                                           | Barre : bouton de retour aux données de l'hôtel (prototype)                                                |

**Forme de la réponse « Semaine »** (api.ts:178-187) :

- `affectations[]` : shifts avec durée, pause, court, epinglee, rôle, alertes {regle, message, nature loi|organisation} ;
- `a_pourvoir[]` : avec manquant et raisons[{salarie_id, messages[]}] ;
- `bilan[]` : minutes, minutes_contrat, minutes_max, jours, alertes, absences{jour → motif}, absences_semaine_type, repos_fixes, hors_contrat, repos_deduits ;
- `alertes_besoins`, **non affiché** dans l'interface ;
- `stats` {places, pourvues, infractions, alertes_organisation}. `alertes_organisation` n'est pas affiché ;
- `duree_ms`, `verrouillee`.
