# Plan — Images du Classeur : trois blocs établis à la place de l'habillage

> **EXÉCUTÉ le 2026-10-01** (commits `3a21e26`, `a73a972`), sur le « go »
> de l'utilisateur (« je te fais confiance »). Angles tranchés en cours de
> route : taille écrite `"petite"` / `"moyenne"` / `"pleine"` dans le titre ;
> blocs `:::photos` / `:::etape` ; repli d'une étape trop haute = déroulée.
> Écarts au plan, nés du contrôle : (1) une image écrite à la ligne sous une
> étape de liste devient aussi une figure (44 captures réelles) ; (2) la
> hauteur automatique dépend du GENRE (photo 9 cm, capture 15 cm) — 10 cm
> pour tout aurait rendu illisibles les captures des guides ; (3) après
> « Sauvegarder », l'éditeur relit avant de fermer (défaut préexistant).
> Doc 89 refait en blocs (4 pages au lieu de 7). Reste : la « Suite »
> ci-dessous.

## Contexte

Retour utilisateur du 2026-09-30 sur le document 89 « Suivi sanitaire
hebdomadaire » : « le texte, très fort ; la mise en place des images, une vraie
catastrophe ». Il donne des idées mais ne veut pas réinventer la roue, et
prévient qu'il fera des choses imprévues (images de toutes dimensions) : c'est
à l'app de le GUIDER vers une mise en page propre.

Quatre agents (données réelles, pratiques établies, code, genres de documents)
concluent la même chose :

- l'habillage (`position=gauche|droite`, texte qui coule autour) est le
  mauvais modèle pour une procédure : aucun référentiel de modes opératoires
  ne le fait (iFixit, Dozuki, gabarits Word « N° | Action | Photo », guide
  Adobe) ; Word et Google Docs insèrent « aligné sur le texte » par défaut.
  Avec des phrases courtes, une photo flottante laisse 20 à 45 mm de vide
  (≈ 124 mm cumulés sur la page des manchettes) ;
- `position=` et `+++` sont des syntaxes INVENTÉES, la seconde ne sert qu'à
  réparer la première ;
- le problème dépasse le doc 89 : sur 102 images (93 captures, 9 photos),
  21 captures font plus de la moitié de la page, des panneaux étroits sortent à
  61 mm de large avec deux tiers de vide, 23 captures plein écran deviennent
  illisibles imprimées, 16 bandeaux font 9 à 12 mm, et toutes les légendes
  (alt) sont un nom de fichier ou « … – capture N ».

## Décisions validées par l'utilisateur (2026-10-01)

| Sujet | Décision |
|---|---|
| Syntaxe des blocs | Directives conteneur `:::photos` … `:::` et `:::etape` … `:::` (`remark-directive`, plugin officiel remark ; syntaxe des encadrés Docusaurus) |
| Légendes génériques existantes (93 « – capture N », 9 « PXL_… ») | Masquées à l'affichage par une règle, AUCUNE réécriture en base ; la relecture signale « image sans légende » |
| Taille | Automatique par défaut + 3 tailles (Petite / Moyenne / Pleine largeur) ; plus de curseur libre |
| Méthode | Plan écrit d'abord, relu par l'utilisateur avant tout code |

## Angles à clarifier

1. **Écriture de la taille dans le Markdown.** Aucune syntaxe de taille n'est
   à la fois établie ET supportée par remark (Pandoc `{width=50%}` : aucun
   plugin maintenu). Proposition : garder le TITRE de l'image, déjà en place,
   réduit à trois mots — `"petite"`, `"moyenne"`, `"pleine"` ; absent =
   automatique. Un ancien `largeur=NN` est lu comme la taille la plus proche.
   Alternative : directive feuille `::image[légende]{taille=petite}` —
   rejetée ici (deux façons d'écrire une image, Registre l'affiche en texte).
2. **Nom des blocs.** `:::photos` et `:::etape` (français, sans accent pour
   éviter les fautes de frappe). À confirmer.
3. **Gabarits par genre de document et encadrés typés** (`> [!WARNING]`,
   syntaxe des alertes GitHub, compatible GFM) : hors de ce plan, à lancer
   ensuite (voir « Suite »). Les deux agents de conception divergeaient sur les
   encadrés (`:::attention` contre `> [!WARNING]`) : `> [!…]` reste un encadré
   lisible partout, c'est la piste retenue pour plus tard.
4. **Étape plus haute qu'une page** : repli proposé = l'étape se déroule en
   blocs normaux (texte puis photo). À valider à l'étape 4.

---

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-socle-rendu.md](./1-socle-rendu.md) | Socle : directives, figures, pipeline partagé | — | P0 | 2h | Pipeline unique (page, impression, aide), directives inconnues remises en texte | ⚠ |
| 2 | [2-figure-simple.md](./2-figure-simple.md) | Image simple : légende, hauteur bornée, 3 tailles, retrait de l'habillage | 1 | P0 | 3h | Plus de flottant ni de `+++`, lecture tolérante | ⚠ |
| 3 | [3-planche-photos.md](./3-planche-photos.md) | Bloc `:::photos` | 1, 2 | P0 | 2h | Grille automatique paginée par rangée | |
| 4 | [4-etape-illustree.md](./4-etape-illustree.md) | Bloc `:::etape` | 1, 2 | P0 | 2h | Texte + colonne photo, repli si trop haut | |
| 5 | [5-editeur.md](./5-editeur.md) | Éditeur : dialogue image, barre, retouche | 2, 3, 4 | P0 | 3h | Boutons qui écrivent les blocs, taille auto proposée selon le format | ⚠ |
| 6 | [6-relecture.md](./6-relecture.md) | Relecture : alertes images et pages | 2 | P1 | 2h | 6 alertes non bloquantes | |
| 7 | [7-aide-consignes.md](./7-aide-consignes.md) | Aide « Mettre en forme » + consignes LLM | 3, 4, 5 | P1 | 1h | Aide rendue par le vrai pipeline, test des trois exports | |
| 8 | [8-doc89-cloture.md](./8-doc89-cloture.md) | Doc 89 refait, contrôle navigateur, CLAUDE.md | tout | P0 | 1h30 | Rendu vérifié, sans vide ni débordement | ⚠ |

## Ordre d'exécution

1. Sprint A (fondations) : 1 → 2.
2. Sprint B (blocs, parallélisables) : 3 et 4.
3. Sprint C : 5, puis 6 et 7 en parallèle.
4. Clôture : 8.

Aucun SQL : rien n'est écrit en base hors de l'éditeur (doc 89, étape 8, par
l'app, avec version et point de restauration automatiques).

## Architecture cible

```
Markdown ──remark-gfm──remark-math──remark-directive──remarkBlocs──┐
                                                                    │ (liste blanche photos|etape,
                                                                    │  toute autre directive → texte)
            rehype-katex──rehypeFigures──rehypeLignesSource ◄───────┘
                 │              │
                 │              └─ p > img seul  →  figure > img + figcaption (légende si non générique)
                 ▼
        composants react-markdown (ImageDocument, blocs photos/etape)
                 ▼
        paginate.ts : figure = insécable ; photos = coupable par rangée ;
                      etape = insécable (repli si > page) ; PLUS de flottants
```

Un SEUL module exporte ce pipeline (`lib/classeur/print/pipeline.ts`) :
`DocumentPages` ET `AideMiseEnFormeDialog` l'utilisent (l'aide n'utilisait que
`remarkGfm` : elle ne montrait pas le vrai rendu).

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Rendu / impression | `DocumentPages.tsx`, `ImageDocument.tsx`, `paginate.ts`, `preprocessPageBreaks.ts`, `lignesSource.ts`, `styles/classeur.css` | `print/pipeline.ts`, `print/remarkBlocs.ts`, `print/rehypeFigures.ts`, `print/BlocPhotos.tsx`, `print/BlocEtape.tsx` |
| Métier | `images.ts`, `markdownEdition.ts`, `relecture.ts`, `merge/consignes.ts`, `merge/schema.ts` | `legende.ts` |
| Éditeur | `ImagePreparationDialog.tsx`, `InsertionImage.tsx`, `ImagesDialog.tsx`, `BarreMiseEnForme.tsx`, `AideMiseEnFormeDialog.tsx`, `DocumentDetail.tsx` | — |
| Dépendances | `package.json`, `pnpm-lock.yaml` (`remark-directive@4`) | — |
| Tests | `paginate`, `images`, `preprocessPageBreaks`, `lignesSource`, `markdownEdition`, `relecture`, `portee`, `AideMiseEnForme` | `remarkBlocs.test.ts`, `rehypeFigures.test.ts`, `legende.test.ts`, `BlocPhotos.test.tsx` |
| Doc | `CLAUDE.md` (section Classeur) | — |
| **Total** | **≈ 25 modifiés** | **≈ 10 nouveaux** |

## Suite (hors de ce plan, à décider après)

- Gabarits à la création d'un document, par genre (guide logiciel 18 docs,
  règle de gestion 13, fiche d'équipement 36, tournée de contrôle, fiche
  réflexe, check-list…).
- Encadrés typés `> [!WARNING]` / `[!TIP]` / `[!NOTE]` (20 encadrés sur 25 ne
  sont pas des avertissements).
- Alertes de relecture de rédaction : faux titres en gras (152), étapes de plus
  de 35 mots, émojis, « null » dans les tableaux, titres en majuscules.
- `react-easy-crop` encore dans `package.json` alors que le recadrage passe par
  `react-image-crop` : à retirer si plus aucun import.
