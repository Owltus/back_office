# Plan — Facturation : homogénéisation sur Affichage + tampon redimensionnable

## Contexte

Le prototype `/facturation` (atelier admin de tamponnage de factures) fonctionne, mais son interface diverge visuellement du reste de l'app. L'utilisateur veut la rendre homogène avec la page **Affichage** (même charpente de mise en page, mêmes cartes, trois panneaux toujours présents), retirer la barre d'en-tête (`PageHeader` : titre « Facturation » + sous-titre « Prototype — lecture PDF… »), déplacer la zone de dépôt de PDF pour qu'elle vive **uniquement dans la colonne de gauche** en reprenant le **style de dropzone de la page PDJ**, et pouvoir **redimensionner le tampon en tirant ses coins** — la taille par défaut restant celle d'aujourd'hui, avec un rendu toujours net (le tampon est vectoriel via pdf-lib, donc « résolution stable » quelle que soit la taille).

Contraintes reprises telles quelles : copier « au maximum » la page Affichage pour l'homogénéité ; l'interface doit afficher les deux colonnes latérales + la colonne centrale **par défaut** (y compris sans facture chargée) ; la dropzone doit respecter le style PDJ (composant `EmptyCanvas` + classe `empty-canvas`).

## Angles à clarifier

**D1 — Redimensionnement du tampon : facteur d'échelle uniforme (à trancher)**
La hauteur du cartouche est DÉRIVÉE de son contenu (nombre de lignes × tailles de police) : ce n'est pas une boîte libre. Le redimensionnement porte donc sur un **facteur d'échelle unique** appliqué à tout le cartouche (boîte + polices), ce qui préserve les proportions et la netteté.
- **Option A retenue (recommandée)** : 4 poignées aux coins, échelle uniforme, le coin opposé sert d'ancre ; bornes ~0,6× à 2,5×. Simple, prévisible, cohérent avec un cartouche à contenu fixe.
- **Option B** : redimensionnement libre largeur/hauteur (déforme le cartouche ou reflow du texte) — plus coûteux et moins lisible. Écarté sauf demande.
Concerne l'étape 3.

**D2 — Dropzone dans la colonne gauche : taille (à trancher)**
- **Option A retenue (recommandée)** : dropzone `EmptyCanvas` grande (style PDJ, `min-h`) quand aucune facture, puis compacte au-dessus de la liste des vignettes dès qu'une facture est chargée.
- **Option B** : dropzone de taille fixe en permanence au-dessus de la liste.
Concerne l'étape 2.

**D3 — Panneau droit sans sélection (à trancher)**
Par défaut (aucune facture), le panneau d'imputation droit est vide.
- **Option A retenue (recommandée)** : afficher un état vide discret (« Déposez une facture pour commencer ») dans les trois zones, pour respecter « toujours visibles ».
- **Option B** : masquer le contenu interne mais garder les cartes vides.
Concerne les étapes 1 et 2.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-layout-affichage-sans-barre.md](./1-layout-affichage-sans-barre.md) | Mise en page | — | P0 | 1h30 | Charpente 3 panneaux calquée sur Affichage, sans `PageHeader`, panneaux toujours visibles | |
| 2 | [2-dropzone-colonne-gauche-pdj.md](./2-dropzone-colonne-gauche-pdj.md) | Dépôt | 1 | P0 | 1h | Dropzone `EmptyCanvas` style PDJ dans la colonne gauche uniquement ; retrait du dépôt pleine page | |
| 3 | [3-tampon-redimensionnable-coins.md](./3-tampon-redimensionnable-coins.md) | Tampon | 1 | P1 | 2h | Tampon redimensionnable aux coins (échelle uniforme), rejoué net sur le PDF | |
| 4 | [4-validation-globale.md](./4-validation-globale.md) | Validation | 1, 2, 3 | P0 | 45 min | tsc + tests + build verts, vérif navigateur complète | ⚠ |

## Ordre d'exécution

Séquentiel avec un embranchement : l'étape 1 pose la charpente ; les étapes 2 et 3 en dépendent mais sont **indépendantes entre elles** (dépôt vs tampon) et peuvent se faire dans l'ordre 2 puis 3. L'étape 4 (validation globale ⚠) clôt le chantier.

1. Étape 1 — charpente Affichage + retrait de la barre
2. Étape 2 — dropzone colonne gauche (style PDJ)
3. Étape 3 — tampon redimensionnable aux coins
4. Étape 4 — validation globale ⚠

## Architecture cible

```
/facturation  (PageContainer fillHeight, SANS PageHeader)
└── FacturationBoard
    └── flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-6   ← charpente copiée d'AffichageBoard
        ├── <aside> COLONNE GAUCHE  (lg:w-80, carte, toujours visible)
        │     ├── Dropzone EmptyCanvas (style PDJ, empty-canvas)  ← SEUL point de dépôt
        │     └── InvoiceList (vignettes des factures)
        ├── <section> CENTRE  (order-last lg:order-none, flex-1)
        │     └── StampPreview (grille responsive + tampon déplaçable ET redimensionnable)
        └── <aside> COLONNE DROITE (lg:w-80, carte, toujours visible)
              └── InvoicePanel (imputation) ou état vide si aucune facture
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Métier (lib) | `src/lib/facturation/types.ts`, `src/lib/facturation/stampLayout.ts`, `src/lib/facturation/stamp.ts`, `src/lib/facturation/facturation.test.ts` | — |
| Composants (UI) | `src/components/facturation/FacturationBoard.tsx`, `src/components/facturation/InvoiceList.tsx`, `src/components/facturation/InvoicePanel.tsx`, `src/components/facturation/StampPreview.tsx` | — |
| Réutilisés (sans modif) | `src/components/shared/EmptyCanvas.tsx`, `src/styles.css` (`.empty-canvas`), `src/components/shared/PageContainer.tsx` | — |
| **Total** | **8 modifiés** | **0 nouveau** |
