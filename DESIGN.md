---
name: Back Office OKKO Nantes
description: Outil interne de gestion opérationnelle hôtelière — reporting, caisse, parking, PDJ, rapprochement
colors:
  ink-navy: "#0b111e"
  slate-card: "#141d2e"
  pale-slate-text: "#e2e8f0"
  muted-slate: "#94a3b8"
  indigo-signal: "#6366f1"
  hairline-border: "rgba(148, 163, 184, 0.12)"
  control-border: "rgba(148, 163, 184, 0.16)"
  alert-red: "#ef4444"
  chart-indigo: "#818cf8"
  chart-cyan: "#22d3ee"
  chart-amber: "#fbbf24"
  chart-pink: "#f472b6"
  chart-emerald: "#34d399"
typography:
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.2
  value:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1.4rem"
    fontWeight: 700
    lineHeight: 1
    fontVariation: "tabular-nums"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "0.6rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "0.03em"
  tab-label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.2
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  button-outline:
    backgroundColor: "{colors.slate-card}"
    textColor: "{colors.pale-slate-text}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  button-primary:
    backgroundColor: "{colors.indigo-signal}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-destructive:
    backgroundColor: "{colors.alert-red}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
  stat-tile:
    backgroundColor: "{colors.slate-card}"
    rounded: "{rounded.xl}"
    padding: "8.8px 12px"
  badge-status:
    backgroundColor: "{colors.slate-card}"
    rounded: "{rounded.md}"
    height: "32px"
---

# Design System: Back Office OKKO Nantes

## Overview

**Creative North Star: "La Tour de Contrôle"**

L'app est le poste de pilotage des opérations quotidiennes de l'hôtel : reporting,
caisse, parking, petits-déjeuners, rapprochement ménage, facturation. Elle n'a rien à
vendre et personne à convaincre — son seul public est le personnel back-office, en
vacation, qui a besoin de lire vite, juste, et sans ambiguïté. Le fond navy sombre par
défaut (un clair existe, jamais un simple assombrissement du même écran) installe une
ambiance sobre et professionnelle : rien n'attire l'œil pour lui-même, tout sert la
lecture rapide des chiffres et des statuts.

Les composants sont nets et sans ambiguïté : bordures fines, rayons modestes, aucun
effet décoratif. Un bouton, un champ, une pastille de statut partagent le même
vocabulaire visuel (contour + `shadow-xs` + anneau de focus net) — au point qu'une
pastille d'état (« Clôturé », « Ouvert ») est délibérément habillée comme un bouton de
la barre d'outils qu'elle surplombe, jamais comme un badge décoratif à part.

**Key Characteristics:**
- Sombre par défaut (navy/indigo), clair en alternative réelle — jamais dark-only.
- Une seule famille de police (Inter), hiérarchie par poids et taille, pas par style.
- Cartes plates (bordure, pas d'ombre) ; l'ombre est réservée aux contrôles interactifs.
- Chiffres toujours en `tabular-nums` : une colonne de nombres s'aligne au chiffre près.
- Rien ne repose sur la couleur seule : chaque statut coloré porte aussi un mot.

## Colors

Palette resserrée : un seul accent (indigo), une échelle de neutres navy pour la
profondeur, cinq teintes catégorielles réservées aux séries de données (jamais à l'UI
générale), et le rouge d'alerte réservé aux actions destructrices.

### Primary
- **Indigo Signal** (`#6366f1`) : accent unique — boutons primaires, anneau de focus,
  liens actifs de la navigation, curseur de sélection de texte. Utilisé avec parcimonie
  (surtout comme *accent*, rarement comme grand aplat).

### Neutral
- **Ink Navy** (`#0b111e`) : fond de page en thème sombre (défaut de l'app).
- **Slate Card** (`#141d2e`) : fond des cartes, popovers, barre d'outils (`bg-card/80`
  avec flou) — un cran plus clair que le fond de page, jamais un dégradé.
- **Pale Slate Text** (`#e2e8f0`) : texte principal sur fond sombre.
- **Muted Slate** (`#94a3b8`) : texte secondaire, libellés, sous-textes.
- **Hairline Border** (`rgba(148, 163, 184, 0.12)`) : bordure par défaut, quasi
  invisible — délimite sans peser.
- **Control Border** (`rgba(148, 163, 184, 0.16)`) : bordure des champs/contrôles,
  légèrement plus marquée que la bordure de carte pour signaler « ceci s'utilise ».

En thème clair, les mêmes rôles se remappent sur une base blanche/`#f8fafc` avec un
indigo légèrement plus profond (`#4f46e5`) — jamais un simple assombrissement du même
jeu de valeurs : chaque thème a son propre jeu de tokens complet (voir `styles.css`).

### Named Rules
**The One Accent Rule.** Un seul accent (indigo) porte l'action et la sélection dans
toute l'app. Les cinq teintes `chart-*` (indigo clair, cyan, ambre, rose, émeraude) sont
réservées aux séries de données (liserés de `StatTile`, graphiques Recharts) — elles
n'habillent jamais un bouton ni un texte de navigation.

## Typography

**Body/Display Font:** Inter (avec repli `ui-sans-serif, system-ui, -apple-system,
sans-serif`)

**Character:** Une seule famille, sans empattement, chargée par `<link>` +
`preconnect` (jamais `@import` CSS, qui bloquerait l'affichage du texte pendant la
résolution DNS tierce). La hiérarchie se joue au poids et à la taille, jamais à un
changement de police.

### Hierarchy
- **Title** (600, 1.25rem, 1.2) : titre de page (`h1` de `PageHeader`), tronqué
  (`truncate`) plutôt que renvoyé à la ligne — ne doit jamais faire dériver les
  éléments qui l'accompagnent (pastille de statut) sur une ligne qui ne leur
  correspond pas.
- **Value** (700, 1.4rem, 1, `tabular-nums`) : la valeur chiffrée d'une `StatTile` —
  toujours en chiffres tabulaires pour que deux cartes voisines s'alignent au chiffre
  près, jamais en proportionnel.
- **Body** (400, 0.875rem, 1.5) : texte courant, contenu de formulaire, cellules de
  tableau.
- **Label** (600, 0.6rem, 1.15, `letter-spacing: 0.03em`, majuscules) : libellé d'en-tête
  de `StatTile` — toujours au-dessus de la valeur, jamais à côté.
- **Tab Label** (500, 0.6875rem, 1.2) : libellé sous l'icône d'un onglet de barre
  d'outils basse mobile (« Aide », « Imprimer »…) — jamais en majuscules,
  contrairement au Label de `StatTile`, qui est un en-tête, pas un nom de commande.

### Named Rules
**The Tabular Numbers Rule.** Toute valeur chiffrée destinée à être comparée à une
autre (carte de synthèse, colonne de tableau, écart de caisse) s'affiche en
`tabular-nums`. Un chiffre proportionnel dans une colonne de nombres est un défaut, pas
un détail.

## Layout

Grilles en colonnes FIXES et divisibles plutôt qu'`auto-fit` : un nombre de tuiles
connu (6 KPI, 6 étages) se replie sur un diviseur exact (3 ou 6), jamais sur un nombre
intermédiaire qui casserait la symétrie des rangées. Le repli se fait sur un SEUL palier
net par grille (ex. 640px), pas une succession de paliers intermédiaires.

En dessous de 640px, l'en-tête de page (`PageHeader`) empile titre+pastille sur une
ligne et la barre d'actions sur la suivante, les sous-groupes d'actions écartés aux deux
bords (`justify-between`) plutôt qu'entassés à gauche. Au-delà, tout tient sur une seule
ligne, navigation temporelle collée au bord droit.

Sous 640px, les actions d'une page NE restent pas dans l'en-tête simplement rétrécies :
elles migrent vers une **barre d'outils basse fixe** (voir Composants), le pattern
d'app mobile natif — portée du pouce, toujours visible quel que soit le défilement.
L'en-tête garde alors seulement le titre et la pastille de statut.

Le planning parking bascule en mode compact sous 768px (aligné sur le seuil de la
Navbar) : lecture seule côté front, noms masqués, seules les zones colorées et le
panoramique jours restent — la RLS reste l'unique autorité réelle des droits, ce repli
n'est qu'ergonomique.

### Named Rules
**The Exact Divisor Rule.** Une grille à nombre d'éléments connu se réplie sur un
diviseur exact de ce nombre (3 ou 6 pour six éléments), jamais sur un compte
intermédiaire qui produirait des rangées inégales.

## Elevation & Depth

Le système est globalement PLAT : les cartes (`StatTile`, cartes d'étage) se distinguent
du fond par la bordure et un léger contraste de teinte (`bg-card` sur `bg-background`),
pas par une ombre. L'ombre (`shadow-xs`, très diffuse) est réservée à un rôle précis :
signaler qu'un élément est un CONTRÔLE interactif (bouton `outline`, champ, pastille de
statut, bascule segmentée) — jamais un usage général de profondeur.

Une seule exception mesurée : les cartes d'étage du rapprochement portent une ombre
ambiante très légère (`0 1px 2px rgba(0,0,0,0.18)`) pour se détacher d'un fond
identique sur toute la largeur — un cas isolé, pas un vocabulaire à généraliser.

### Shadow Vocabulary
- **Control affordance** (`shadow-xs`) : boutons `outline`, champs, pastilles de
  statut, bascule segmentée — dit « ceci se manipule ».
- **Ambient card** (`0 1px 2px rgba(0,0,0,0.18)`) : cas isolé (cartes d'étage
  rapprochement), pas un rôle réutilisable ailleurs.

### Named Rules
**The Flat-By-Default Rule.** Une carte n'a pas d'ombre par défaut ; elle se détache par
la bordure et le contraste de fond. L'ombre n'apparaît que sur un contrôle, jamais
comme décor de carte.

## Shapes

Un seul rayon de base (`0.75rem` / 12px) décliné en quatre paliers (8/10/12/16px). Les
boutons, champs et pastilles de statut partagent le rayon `md` (10px) ; les cartes de
synthèse (`StatTile`) utilisent `xl` (16px), un cran plus généreux pour les distinguer
des contrôles. Aucune forme pleinement carrée (0 de rayon) ni pleinement pilule
(`rounded-full`) dans le langage courant de l'app — la pastille de statut, qui utilisait
encore un `rounded-full` de type badge, a été ramenée au rayon `md` des boutons pour
rejoindre ce langage.

## Components

### Buttons
- **Shape:** rayon `md` (10px), coins identiques sur tous les variants.
- **Primary:** fond Indigo Signal, texte blanc.
- **Outline** (le plus utilisé de l'app) : fond `bg-background`/`bg-card`, bordure
  `Control Border`, `shadow-xs` — la brique de base de toute la barre d'outils.
- **Destructive:** texte/bordure rouge alerte sur fond transparent (jamais un aplat
  rouge plein en usage courant — réservé aux actions réellement irréversibles).
- **Ghost / ic-only:** sans bordure ni fond au repos, `hover:bg-accent`.
- **Hover / Focus:** transition douce (couleur, fond, bordure) ; anneau de focus net
  (`ring-[3px] ring-ring/50`) sur TOUT bouton — l'app doit rester pilotable
  intégralement au clavier.

### Segmented Control (bascule vue service ↔ détail financier, PDJ)
- Groupe de deux boutons dans un même contour (`border` + `shadow-xs`, rayon `md`),
  une pastille pleine `bg-primary` qui GLISSE (transition CSS sur `left`, pas de saut)
  entre les deux positions.

### Button Group (barre d'outils)
- Boutons `outline` adjacents dont les bordures mitoyennes fusionnent (un seul filet
  au lieu de deux) et les coins internes carrés — matérialise « ces actions vont
  ensemble », par opposition aux actions isolées de la barre.

### Cards / Stat Tiles
- **Corner Style:** rayon `xl` (16px).
- **Background:** `bg-card`, bordure `border-border` — pas d'ombre.
- **Structure:** liseré de couleur vertical à gauche (2px, une des cinq teintes
  `chart-*`) + corps (libellé en haut, valeur en bas, chiffres tabulaires).
- **Shadow Strategy:** aucune (voir Elevation & Depth) — la carte se détache par la
  bordure et le contraste de fond, jamais par une ombre.

### Inputs / Fields
- **Style:** bordure `Control Border`, fond transparent (`dark:bg-input/30`), rayon
  `md`, `shadow-xs`.
- **Focus:** bordure `--ring` + anneau `ring-[3px] ring-ring/50` — même traitement que
  les boutons, jamais un style de focus différent selon le type de contrôle.
- **Error:** bordure et anneau rouge alerte (`aria-invalid`).

### Status Badge (pastille « Clôturé »/« Ouvert »)
- Même gabarit que le bouton `outline`/`sm` (bordure, fond, ombre, hauteur 32px) :
  ce n'est pas un bouton (rien à cliquer) mais elle doit se lire comme faisant partie
  de la même rangée d'actions, pas comme une pastille décorative à part. Seule la
  couleur du texte/bordure change selon l'état (émeraude = clôturé, ambre = ouvert) —
  la couleur appuie le mot, elle ne le remplace jamais.
- **Variante `compact`** (sous 1024px) : le libellé texte cède la place à une
  simple icône de cadenas (fermé/ouvert), même gabarit carré, mêmes couleurs —
  pour les pages dont l'identité (nom + jour) a migré dans la Navbar (voir
  Navigation ci-dessous), où le mot complet n'apporte plus rien face à l'icône.

### Navigation (barre du haut)
- Onglets texte (bureau) avec l'onglet actif surligné (`bg-background` + anneau de
  bordure) ; en mobile (< 1024px), tiroir latéral (`Sheet`) déclenché par un
  hamburger, le nom de la page courante remplace la marque « Back Office » à côté
  du logo (les onglets étant alors cachés dans le tiroir, rien d'autre ne dit sur
  quelle page on se trouve).
- **Sous-titre de page** (optionnel, sous le nom de page, même zone) : une page
  peut y poser un texte discret — le jour affiché sur Rapprochement, par exemple
  — quand ce jour a été retiré du corps de page pour économiser la place. Texte
  atténué (`text-muted-foreground`), plus petit que le nom de page, jamais du
  même poids visuel. Purement informatif, PAS interactif (essayé puis retiré
  sur demande explicite : le tap ouvrait un calendrier, jugé pas voulu là).
- **Nom de page non cliquable en mobile** : contrairement au logo (raccourci
  « Accueil » constant, icône réduite), le nom de page/sous-titre ne navigue
  nulle part sous 1024px — un tap dessus ne doit jamais faire quitter la page
  courante par accident ; les onglets restent à un tap dans le tiroir
  hamburger, la voie volontaire.
- **Badge de page** (optionnel, à côté du bouton hamburger, PAS à côté du nom de
  page) : une icône de statut (le cadenas clôturé/ouvert de Rapprochement), même
  couleur que sa version texte du corps de page. Les deux partagent le même
  wrapper `ml-auto` que le hamburger — jamais posés séparément, sinon un vide
  apparaît entre eux au lieu de les pousser ensemble au bord droit.
- Sous-titre et badge disparaissent automatiquement en quittant la page qui les
  a posés (voir `lib/navbarSubtitle.ts`) — jamais de résidu d'une page
  précédente.

### Barre d'outils basse mobile (signature, sous 640px)
- **Quand :** remplace la barre d'actions de l'en-tête sous 640px — pas un
  rétrécissement de boutons de bureau, une vraie barre d'app mobile.
- **Position :** `fixed`, collée au bas de la fenêtre, au-dessus de tout scroll de
  page ; `env(safe-area-inset-bottom)` pour l'encoche/l'indicateur d'accueil iOS.
  Le contenu de la page réserve l'espace correspondant (`padding-bottom`) pour
  qu'elle ne masque jamais la fin du contenu.
- **Cellules :** réparties à parts égales (`flex-1`), icône au-dessus du libellé
  (Tab Label, 11px), jamais côte à côte — le libellé existe précisément parce que
  l'infobulle au survol n'existe pas au doigt (une icône seule n'explique plus
  rien en tactile).
- **Cible tactile :** chaque cellule fait toute la hauteur de la barre (icône +
  libellé + `py-2`), largement au-dessus du plancher de 44px.
- **États :** `active:bg-accent` (retour tactile immédiat), `disabled:opacity-40`
  pour une action indisponible (ex. imprimer avant clôture) — jamais un bouton
  simplement absent, la cohérence de la barre prime.
- **Séparateurs :** filet vertical (`border-l`) entre cellules plutôt qu'un
  espacement flottant (`gap`/`justify-around`) — cellules pleine largeur bord à
  bord, comme une vraie barre d'onglets native, pas des boutons espacés.
- **Navigation temporelle « feuilletage » (pager) :** quand une page se
  parcourt jour par jour en continu (Rapprochement), Précédent/Suivant ne sont
  PAS un cluster resserré au milieu de la barre — chacun devient sa PROPRE
  cellule, aux deux BORDS de la barre. Au pouce, les bords d'un écran se
  rejoignent plus naturellement qu'un cluster étroit coincé dans un coin ; un
  cluster de contrôles compressés dans une seule cellule (flèches + calendrier
  fondus ensemble) est un anti-pattern sur cette barre, pas une variante
  acceptable.
- **Sans sélecteur de date en mobile, pour l'instant :** Rapprochement s'y
  parcourt uniquement jour par jour (Précédent/Suivant) — pas de bouton
  calendrier dans la barre basse ni ailleurs sous 1024px. Un déclencheur
  calendrier personnalisé sur le sous-titre de la Navbar a été essayé, puis
  retiré sur demande explicite (jugé pas pratique) ; ne pas le réintroduire
  sans qu'on le redemande.
- **Exposée par le socle analytique (`AnalytiqueShell`) via deux props
  opt-in** : `mobileIdentity` (contenu déplacé en sous-titre Navbar sous
  1024px — PAS forcément égal à `title` : la vue annuelle y passe « Analytique
  2026 » alors que `title` reste « Analytique » sur l'en-tête desktop, où
  l'année est déjà visible via `YearNav` ; sur la Navbar mobile c'est le seul
  endroit qui la montre encore, la barre basse ayant remplacé ce `YearNav`/le
  bouton retour de l'en-tête) et `mobileToolbar` (barre basse fixe sous 640px,
  le shell y insère lui-même sa cellule Imprimer déjà construite —
  `ToolbarCell`, exporté par `AnalytiqueShell.tsx` — le board ne fournit que
  ses cellules de navigation propres). Les deux props sont absentes par
  défaut : sans elles, une page analytique garde exactement son rendu d'avant.
  **Consommé aujourd'hui uniquement par les deux vues Rapprochement**
  (annuelle : sous-titre « Analytique 2026 », barre basse
  Préc./Retour/Imprimer/Suiv. sur l'année, le bouton Retour existant AUSSI en
  desktop dans l'en-tête via `AnalytiqueBackButton` — la vue annuelle n'avait
  jusque-là aucun moyen de revenir à `/rapro` ; mensuelle : sous-titre
  « Analytique Août 2026 », Retour/Imprimer) — les 8
  autres pages du socle (RepJour/PDJ/Parking/Caisse × annuel+mensuel) n'ont
  pas ce mode ; ne pas présumer qu'elles l'ont sans vérifier le code.

### Tooltip
- Fond `bg-foreground` / texte `bg-background` : s'inverse automatiquement entre clair
  et sombre puisqu'il utilise les jetons plutôt qu'une couleur fixe — jamais l'infobulle
  système du navigateur (`title`), toujours repeinte aux couleurs de l'app.

## Do's and Don'ts

### Do:
- **Do** réutiliser `StatTile` pour toute nouvelle carte de synthèse plutôt
  qu'inventer une nouvelle forme de carte.
- **Do** afficher toute valeur chiffrée comparable en `tabular-nums` (**The Tabular
  Numbers Rule**).
- **Do** garantir un anneau de focus visible et une navigation clavier complète sur
  tout élément interactif — contrainte produit confirmée, pas une option de confort.
- **Do** faire replier une grille à nombre d'éléments connu sur un diviseur exact
  (**The Exact Divisor Rule**), jamais sur un palier intermédiaire.
- **Do** définir le jeu de tokens complet des deux thèmes (clair ET sombre) pour toute
  nouvelle couleur — jamais une couleur qui ne fonctionne que dans un seul thème.

### Don't:
- **Don't** ajouter une ombre à une carte pour la faire ressortir — la bordure et le
  contraste de fond suffisent (**The Flat-By-Default Rule**).
- **Don't** introduire une deuxième famille de police dans l'app principale — Poppins
  reste réservé à l'affiche `/affichage`, un monde visuel à part (signalétique
  imprimée/écran, pas un écran de gestion).
- **Don't** créer une nouvelle pastille `rounded-full` façon badge décoratif — les
  pastilles de statut suivent désormais le rayon `md` des boutons.
- **Don't** faire reposer un statut sur la couleur seule : chaque couleur d'état
  s'accompagne toujours d'un mot lisible.
- **Don't** bloquer une action derrière une interaction souris-only (le glisser-déposer
  du planning parking est la seule exception, déjà neutralisée en repli lecture seule
  sur petit écran).
