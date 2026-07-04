# Plan — Fidélité du PDF au fork d'origine

## Contexte

Le document imprimé (PDF) de la page PDJ doit avoir une structure logique strictement identique à celle du fork d'origine (`Breakfast-okko` / `breakfast.html`), sans rien inventer ni oublier. Un audit croisé (trois agents : structure du fork, structure de notre implémentation, parité des données) a confirmé que la logique métier et la majorité de la mise en page d'impression sont déjà rigoureusement équivalentes. Ce plan corrige les derniers écarts visibles à l'impression et tranche la seule vraie divergence de rendu.

Contrainte explicite : ne modifier que le rendu IMPRIMÉ. Les ajouts propres à l'écran (KPI « PDJ non inclus », icônes des KPI, étoile VIP) sont déjà masqués en impression et doivent le rester — ils ne concernent pas le PDF.

## Angles à clarifier

Divergence de rendu à trancher avant exécution :

- **Colonne Statut — taille de la flèche.** Le fork imprime une flèche de statut de 16 px (le SVG garde ses attributs `width/height=16`, la cellule est en `font-size: 10px`), ce qui rend les lignes occupées plus hautes et irrégulières. Notre implémentation utilise une flèche de 9 px, donnant des lignes uniformes et plus lisibles. « Faire pareil » impose 16 px, mais il s'agit très probablement d'un oubli du fork qui dégrade le rendu.
  - Option A (recommandée) : conserver 9 px (lignes uniformes, plus propre).
  - Option B : matcher le fork à l'identique (cellule `font-size: 10px`, flèche 16 px).

Cet arbitrage détermine le contenu de l'étape 1 (sous-tâche 5).

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-corrections-fidelite-print.md](./1-corrections-fidelite-print.md) | Corrections de fidélité du PDF | — | P0 | 45 min | PDF aligné sur le fork | |
| 2 | [2-validation-audit.md](./2-validation-audit.md) | Validation et audit final | 1 | P0 | 20 min | Conformité vérifiée | ⚠ |

## Ordre d'exécution

Séquentiel strict : étape 1 puis étape 2. Aucune parallélisation (chantier localisé sur deux fichiers).

## Architecture cible

État final : le document imprimé de `/pdj` reproduit fidèlement le fork d'origine.

```
PDF (A4 portrait, 10mm)
├── En-tête : « Breakfast » (14px, poids 300, ls -0.5px) centré + date JJ/MM/AAAA en haut-droite
├── Grille 3×2 des 6 étages (cartes blanches, barre grise ::before, sans titre d'étage)
│   └── Tableau sans thead : Chambre · Nom · Statut(flèche) · Visites(>1) · Clients(cases)
│       └── Lignes PDJ inclus en fond #bce6be, chambres vides opacité 0.4
└── Footer fixe
    ├── 5 cartes : Chambres occupées · Clients · PDJ Inclus · Recouche ↓ · Départ ↑
    └── 3 cases € vides : PDJ Inclus € · PDJ Extra € · Total €
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Frontend (composant) | `src/components/pdj/BreakfastBoard.tsx` | — |
| Frontend (styles) | `src/styles.css` | — |
| **Total** | **2 modifiés** | **0 nouveau** |
