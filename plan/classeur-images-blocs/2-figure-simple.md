# Étape 2 — Image simple : légende, hauteur bornée, 3 tailles, fin de l'habillage

## Objectif

Une image seule devient une figure centrée, avec sa légende en dessous et une
hauteur bornée, ce qui suffit à corriger les photos portrait et les panneaux
hauts. La position (habillage) et `+++` disparaissent, en restant lus sans
casse dans les anciens contenus.

## Fichier(s) impacté(s)

- `src/lib/classeur/legende.ts` (nouveau) + test
- `src/lib/classeur/images.ts` (`titreImage`, `positionDepuisTitre`,
  `largeurDepuisTitre`, `markdownImage`, `jetonImage`, `trouverImage`)
- `src/components/classeur/print/ImageDocument.tsx`
- `src/lib/classeur/print/preprocessPageBreaks.ts`, `lignesSource.ts`
- `src/lib/classeur/print/paginate.ts` (+ tests 9-11 retirés)
- `src/styles/classeur.css` (l. ~355-393)

## Travail à réaliser

### 1. Légende (`legende.ts`)

`legendeAffichable(alt)` : `null` si l'alt est vide ou GÉNÉRIQUE —
nom de fichier (`PXL_…`, `IMG_…`, `Screenshot…`, extension), ou motif
« <texte> – capture N » de l'import des procédures. Décision utilisateur : on
masque, on ne réécrit RIEN en base. Tests sur les 102 alts réels (relevés en
lecture) : 0 légende affichée aujourd'hui, ce qui est voulu.

### 2. Tailles

| Valeur du titre | Rendu |
|---|---|
| (absent) — automatique | largeur naturelle bornée à la zone (190 mm), hauteur bornée à ~100 mm, jamais agrandie |
| `"petite"` | ≤ 33 % de la largeur, même borne de hauteur |
| `"moyenne"` | ≤ 50 % |
| `"pleine"` | 100 % de la largeur, borne de hauteur relevée (~170 mm) pour les captures larges |

Lecture tolérante : `largeur=NN` → taille la plus proche (≤ 40 petite,
≤ 62 moyenne, sinon pleine) ; `position=` ignoré. Écriture : uniquement les
trois mots. Hauteur bornée = `max-height` + `width:auto` + `object-fit:
contain` (une `width` imposée avec `max-height` déformerait l'image, CSS 2.1
§10.4).

### 3. Retrait de l'habillage

- CSS : float, `:has(img[data-position])`, `[data-sous-image]`, `clear` des
  titres, `p:has(> img:only-child)` → remplacés par une règle `figure`
  (centrée, espacement en PADDING — leçon du 27/09 —, `break-inside: avoid`,
  légende 9 pt en italique).
- `ImageDocument` : plus de `data-position` ; `data-taille`.
- `paginate.ts` : `debordFlottantCalcule`, `degage`, champs `flottant`,
  `pile()` à double compte → simple somme avec marges fusionnées (~50 lignes
  retirées, cas 9-11 retirés). Une `figure` est insécable (kind null) : rien à
  ajouter.
- `+++` : `preprocessPageBreaks` le remplace par une LIGNE VIDE (le nombre de
  lignes est conservé, donc `lignesSource` revient à `^===\s*$` sans
  compensation). Doc 89, 2 versions et 2 points de restauration restent
  propres.

## Critère de validation

- Doc 16 (`largeur=75`) rendu en « pleine » ; doc 89 sans aucun flottant.
- Aucune image > 100 mm de haut en automatique sur les 86 documents (banc).
- Tests : légendes génériques (102 alts réels), tailles et lecture tolérante,
  `+++` → ligne vide, paginate sans flottants ; mutations attrapées.
- `npx tsc --noEmit`, tests Classeur, `pnpm build`.

## Contrôle /borg

- Aucune régression de pagination sur les 86 documents (pages, débordement,
  texte intact) — même banc que le 2026-09-30.
- Aperçu et impression identiques (iframe : `buildPrintHtml.test.ts`).
