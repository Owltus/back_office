# Étape 4 — Menu base + qualificatif, marqueur additif

## Objectif

Permettre de poser, sur une chambre, un statut de base (circuit classique) ET un
qualificatif (sur-statut) via l'interaction, et afficher le qualificatif comme un
marqueur additif superposé à la couleur de base.

## Contexte

`RaproBoard.tsx` : clic gauche = `toggle` (bascule/rotation du base), clic droit =
`ContextMenu` avec `ContextMenuRadioGroup` (exclusif) sur `ROOM_STATUS_ORDER`.
`applyStatuses`/`setStatus`/`clearRooms`/`resetFloor` écrivent une valeur unique.
Le composant `ui/context-menu.tsx` exporte déjà `ContextMenuCheckboxItem` (cases
NON exclusives), `ContextMenuSub`/`ContextMenuSubTrigger`/`ContextMenuSubContent`,
`ContextMenuLabel`, `ContextMenuSeparator`. Le patron de marqueur additif existe :
« reportée » (`.rapro-room-reportee` + `::after`, classe combinée par `cn()`,
libellé concaténé dans `aria-label`/`title`, entrée de légende manuelle).

## Fichier(s) impacté(s)

- `src/components/rapro/RaproBoard.tsx` (modifié)
- `src/components/ui/context-menu.tsx` (réutilisé, non modifié)

## Travail à réaliser

### 1. Clic gauche

Inchangé dans l'esprit (bascule/rotation du **base**), sans toucher le
qualificatif : `toggle` lit et écrit `statusOf(...).base`, conserve le
`qualifier` courant.

### 2. Menu contextuel — deux sections

- **Statut de base** : `ContextMenuRadioGroup` sur les bases d'exception
  (`non_nettoyee`/Bloquée, `noshow`) — nettoyée/refus restent au clic gauche.
- `ContextMenuSeparator` + `ContextMenuLabel` « Sur-statut ».
- **Qualificatif** (au plus un) : second `ContextMenuRadioGroup` avec « Aucun » +
  les 3 qualificatifs, chacun préfixé de son ICÔNE (`QUALIFIER_ICON`) + libellé.
  Choisir « Faux no-show » applique **D4** : si le base est `noshow`, le basculer
  vers `nettoyee` (client présent). « Aucun » remet `qualifier = null`.
- Pour une chambre non vendue, l'entrée « Non vendue » (reset) reste possible
  (règles héritées).

### 3. Écriture

- `setBase(room, base)` et `setQualifier(room, qualifier)` passent par
  `applyStatuses` (mise à jour optimiste + rollback), en préservant l'autre
  dimension. Le payload `setStatus` porte `{status: base, qualifier}`.

### 4. Rendu du marqueur (ICÔNE, pas de couleur)

- Couleur de fond = base (`CELL_STATES[cellState(base, isEmpty)].webClass`).
- Qualificatif = une petite ICÔNE lucide (`QUALIFIER_ICON[qualifier]`) rendue DANS
  le bouton de la case, positionnée en coin (absolute), SANS fond coloré — pour ne
  pas masquer la couleur du base. Coin distinct de la pastille « reportée » (haut-
  droite) : p.ex. haut-gauche.
- `aria-label`/`title` : concaténer `${QUALIFIER_LABEL[q]}` sans écraser le
  libellé de base.

## Ordre d'exécution

1. Séparer base et qualificatif dans `toggle`/`setRoom` → `setBase`/`setQualifier`.
2. Restructurer le `ContextMenuContent` (radio base + checkbox qualificatif).
3. Appliquer D4 au cochage de « Faux no-show ».
4. Ajouter la classe additive au rendu + libellés d'accessibilité.
5. `npx tsc --noEmit`.

## Critère de validation

- On peut poser un base ET « Faux no-show » sur la même chambre ; les deux
  coexistent visuellement (couleur + pastille).
- Cocher « Faux no-show » sur une chambre `noshow` bascule le base (D4).
- Décocher retire le seul qualificatif, le base reste.
- Gating jour clôturé / lecture seule respecté.
- `npx tsc --noEmit` vert.
