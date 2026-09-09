# Étape 4 — La barre de navigation suit l'ordre du compte

## Objectif

Rendre les onglets dans l'ordre propre au compte, au lieu de l'ordre figé du
registre.

## Contexte

La Navbar construit sa liste en une ligne (`src/components/Navbar.tsx:32-36`) :
`PAGES.filter(...).map(...)`. Cette liste unique, `navItems`, sert **à la fois**
les onglets du bureau (lignes 187-203) et le tiroir mobile (lignes 112-129).
Le changement se propage donc aux deux d'un seul geste, sans travail
supplémentaire.

Deux éléments ne sont pas concernés, contrairement à ce qu'on pourrait croire.
La barre d'outils basse (`MobileToolbar`) porte les actions de la page courante
— imprimer, analytique, jour précédent — et non la navigation entre pages.
L'impression non plus : la Navbar est `print:hidden`.

Le seuil du menu hamburger est fixe à 1024 px et longuement documenté dans
`DESIGN.md`. Ne pas y toucher.

## Fichier(s) impacté(s)

- `src/components/Navbar.tsx` (modifié)

## Travail à réaliser

### 1. Consommer l'ordre effectif

Remplacer le `PAGES.filter(...)` par l'appel à `orderedPages(...)` de l'étape 2,
alimenté par le contexte d'authentification. Le filtrage par droit est déjà
inclus dans cette fonction : ne pas le refaire, sous peine d'avoir deux règles
à tenir d'accord.

### 2. Ne pas toucher à la recherche de la page courante

Les lignes 44-47 cherchent la page courante par son chemin
(`PAGES.find(p => pathname === p.route || ...)`). Cet usage dépend du registre
mais **pas de son ordre** : le laisser tel quel.

### 3. Vérifier le rendu au premier affichage

La Navbar et les gardes ont été écrits pour être déterministes au premier
rendu : `getServerSnapshot` renvoie `null` pour le sous-titre,
`useMatchMedia` renvoie `false`. Le squelette de démarrage
(`AppAuthGate.tsx:52-55`) rend un nombre fixe de pilules neutres. Ne pas le
rendre dépendant de l'ordre : il doit rester identique pour tous, sans quoi une
lecture pendant le rendu rouvrirait un risque de divergence à l'hydratation.

## Ordre d'exécution

1. Brancher `orderedPages` dans la Navbar.
2. Vérifier le tiroir mobile — il suit la même liste.
3. Vérifier le squelette de démarrage, qui doit rester neutre.

## Critère de validation

- Un compte sans préférence voit exactement l'ordre actuel.
- Un compte avec préférence voit ses onglets dans l'ordre choisi, à l'identique
  sur le bureau et dans le tiroir mobile.
- Une page nouvellement accordée apparaît, en fin de liste, sans réglage.
- Une page dont le droit est retiré disparaît, sans laisser d'onglet inerte.
- Aucun avertissement d'hydratation en console.

## Contrôle qualité (revue)

Non critique. Vérifier tout de même le seuil de 1024 px et le comportement du
tiroir : il se ferme au passage en mode bureau (`useEffect`, lignes 66-73), ce
qui doit rester vrai après le changement.
