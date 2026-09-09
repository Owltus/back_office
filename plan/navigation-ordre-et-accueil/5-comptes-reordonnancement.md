# Étape 5 — Réordonnancement dans la gestion des comptes

## Objectif

Donner à l'admin le moyen de composer l'ordre des pages de n'importe quel
compte, depuis le modal d'édition, en sachant que la page de tête devient
l'écran d'arrivée de ce compte.

## Contexte

Toute la page `/comptes` tient dans un seul fichier de 735 lignes,
`src/components/repjour/boards/ComptesBoard.tsx`, sans aucun composant de modal
extrait. Le modal d'édition (lignes 603-732) enchaîne : titre, zone de message,
email, prénom et nom, sélecteur de grade, matrice des droits, nouveau mot de
passe, pied de dialogue.

Deux régimes d'enregistrement y cohabitent. Les droits par page s'appliquent
**immédiatement**, chaque changement déclenchant sa RPC, avec un verrou par
ligne (`permBusy`) et un patch de l'état après succès — pessimiste, pas
optimiste. Le label le dit à l'utilisateur : « (appliqué immédiatement) ». Le
reste — noms, grade, mot de passe — attend le bouton Enregistrer.

L'ordre se place naturellement à côté de la matrice des droits, dont il dépend :
on n'ordonne que des pages accordées. Le régime immédiat est donc le bon.

Le projet n'a **aucune** bibliothèque de glisser-déposer. Le seul déplacement à
la souris existant est le planning parking, écrit à la main pour un besoin
autrement plus riche. Une paire de boutons de montée et de descente couvre le
besoin sans dépendance nouvelle, reste utilisable au clavier et au doigt, et se
teste sans simuler de geste.

## Fichier(s) impacté(s)

- `src/components/comptes/PageOrderList.tsx` (nouveau)
- `src/components/repjour/boards/ComptesBoard.tsx` (modifié)

## Travail à réaliser

### 1. La liste ordonnable, en composant partagé

Écrire `PageOrderList` dans `src/components/comptes/` : elle servira aussi à
`/profil` à l'étape 6. Elle reçoit l'ordre effectif et rend une ligne par page
**accordée**, avec son libellé et son icône issus de `PAGE_BY_KEY` — jamais de
libellé en dur.

Deux boutons par ligne, montée et descente, désactivés aux extrémités, avec un
`aria-label` explicite du type « Monter Petit-déjeuner ».

Ne pas mêler dans cette liste les pages non accordées : le modal contient déjà
la matrice des droits, et deux listes de huit lignes à tenir cohérentes dans
une même fenêtre serait une source d'erreur.

### 2. Dire ce que fait la tête de liste

La première ligne porte une mention sobre — « page d'accueil » — car déplacer
une page en tête change l'écran d'arrivée du compte, ce qui n'est pas devinable.
C'est la contrepartie assumée du couplage décidé.

### 3. L'enregistrement

Envoyer le **tableau complet** en une seule écriture (`update profiles set
page_order = ...`), jamais une page et un rang : le réordonnancement reste
atomique, sans état intermédiaire incohérent.

Même régime que les droits : application immédiate, verrou pendant l'appel,
patch de l'état local après succès, message d'erreur en cas d'échec. Ne pas
rendre optimiste ce que le reste du fichier ne l'est pas.

### 4. Le lien avec la matrice

Un droit ajouté fait apparaître une page en fin de liste ; un droit retiré l'en
fait disparaître. La réconciliation de l'étape 2 garantit que rien ne casse même
si la préférence stockée reste en retard — ne pas chercher à la réécrire à
chaque changement de droit.

### 5. Le cas de l'admin qui s'édite lui-même

`AuthContext` ne se rafraîchit pas après une écriture faite depuis `/comptes`.
Un admin qui change son propre ordre ne verrait sa barre changer qu'à la
prochaine revalidation, dans les trois minutes. Appeler `refreshPermissions()`
quand `editProfile.id === user?.id` corrige le cas proprement.

### 6. Ne pas alourdir le fichier

`ComptesBoard` approche des 800 lignes avec un unique état `message` partagé par
trois zones. Le composant extrait à l'étape 1 de ce fichier évite d'aggraver
cette dette, et sert deux fois.

## Ordre d'exécution

1. Écrire `PageOrderList`.
2. Le brancher dans le modal d'édition, sous la matrice des droits.
3. Traiter le cas de l'admin, dont la matrice est masquée : la liste doit
   montrer les huit pages, puisqu'il les voit toutes.
4. Ajouter le rafraîchissement quand l'admin s'édite lui-même.

## Critère de validation

- Monter une page la déplace d'un rang, et l'ordre est conservé après fermeture
  puis réouverture du modal.
- La page de tête devient l'écran d'arrivée du compte à sa prochaine connexion.
- Les boutons sont désactivés aux extrémités et atteignables au clavier.
- Retirer un droit pendant l'édition retire la page de la liste sans erreur.
- Un admin qui change son propre ordre voit sa barre suivre sans attendre trois
  minutes.
- `npx tsc --noEmit`, `pnpm test` et `pnpm build` au vert.

## Contrôle qualité (revue)

Non critique. Trois points : vérifier qu'un réordonnancement produit **une**
écriture et non une par page ; confirmer que l'ordre affiché est bien l'ordre
effectif après réconciliation, pas la préférence brute ; vérifier que la mention
« page d'accueil » suit réellement la première ligne quand on réordonne.
