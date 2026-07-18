# Plan — Facturation : galaxie des nuages de mots (D3)

## Contexte

Donner à voir le modèle d'imputation sous forme de **galaxie / nébuleuse** : chaque
code d'imputation est un amas, chaque mot un point (étoile), coloré par domaine.
L'utilisateur veut un **bouton « Prévisualisation graphique »** dans une **nouvelle
card en haut à droite, au-dessus d'« Imputation comptable »** ; le clic ouvre la
galaxie, avec **navigation (zoom/pan) et tooltips**. Rendu type **D3 stylisé**
(nuage galactique, points, nébuleuse).

Contraintes explicites : **réutiliser des bibliothèques existantes** (ne pas coder
une physique maison) — on s'appuie sur **d3** (moteur de layout force-directed,
zoom), l'outil standard de data-viz. Le modèle affiché est celui déjà en cache
(nuages `['facturation','clouds']` fusionnés à la graine) — aucune donnée nouvelle,
aucune écriture. Chargement de d3 **paresseux** (derrière le bouton), comme
html2canvas/Tesseract, pour ne pas peser au démarrage.

---

## Angles à clarifier

**D1 — Bibliothèque. Concerne l'étape 1.**
- **Option A retenue (recommandée)** : sous-modules **d3** ciblés — `d3-force`
  (layout amas), `d3-zoom` (navigation), `d3-selection` (attache le zoom au canvas),
  `d3-scale` (taille des points). Plus légers que le monolithe `d3`, chargés en
  import() dynamique. C'est bien « du D3 ».
- **Option B** : `recharts` (déjà présent) — pas de layout force-directed ni de
  rendu « nébuleuse », inadapté. Écartée.

**D2 — Cible de rendu. Concerne l'étape 3.**
- **Option A retenue (recommandée)** : **Canvas** — supporte des centaines/milliers
  de points fluides, idéal pour un rendu « nébuleuse » (halos, opacité). d3-force
  calcule les positions, Canvas dessine, d3-zoom navigue.
- **Option B** : SVG (React) — plus simple mais rame au-delà de ~1000 nœuds.

**D3 — Densité. Concerne l'étape 2.**
Un nuage peut avoir jusqu'à 300 tokens → galaxie illisible. **Recommandé** : ne
garder que les **top-K mots par code** (ex. 40, par poids) pour une nébuleuse lisible.

**D4 — Présentation. Concerne l'étape 4.**
- **Option A retenue (recommandée)** : la card contient le bouton ; le clic ouvre un
  **modal (Dialog)** quasi plein écran (la galaxie a besoin de place).
- **Option B** : dépliage inline dans la colonne. Trop à l'étroit. Écartée.

**D5 — Couleurs. Concerne l'étape 2.**
Les tags de `Tag.tsx` sont des classes Tailwind (inutilisables en Canvas). On ajoute
une **palette hex par domaine** (petite table parallèle) pour le dessin.

---

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-dependances-d3.md](./1-dependances-d3.md) | Ajout des sous-modules d3 (+ types), chargés en lazy | — | P0 | 20 min | d3 installé | |
| 2 | [2-modele-galaxie.md](./2-modele-galaxie.md) | Transform pur `buildGalaxy` + palette hex + tests | — | P0 | 1h | `galaxy.ts` + tests | |
| 3 | [3-vue-galaxie.md](./3-vue-galaxie.md) | Composant Canvas + d3-force + zoom + tooltip (lazy) | 1, 2 | P0 | 2h30 | `GalaxyView.tsx` | |
| 4 | [4-card-bouton-modal.md](./4-card-bouton-modal.md) | Card + bouton + modal dans le rail droit | 3 | P0 | 1h | Bouton « Prévisualisation graphique » | |
| 5 | [5-validation-globale.md](./5-validation-globale.md) | Validation | 1, 4 | P0 | 30 min | tsc + tests + build + vérif | ⚠ |

---

## Ordre d'exécution

Étape 1 (dépendance) puis 2 (pur, testable) en parallèle possible. Puis 3 (vue),
puis 4 (intégration), puis 5. La galaxie lit le pool en cache — si vide (aucune
donnée), elle affiche la **graine** (toujours dispo) ou un état « pas encore de
données ».

---

## Architecture cible

```
package.json          + d3-force, d3-zoom, d3-selection, d3-scale (+ @types/*)
src/lib/facturation/
  galaxy.ts           (NOUVEAU) PUR : buildGalaxy(pool, topK) → { nodes, codes } ; TAG_HEX
src/components/facturation/
  GalaxyView.tsx      (NOUVEAU) Canvas + d3-force (amas) + d3-zoom + tooltip ; d3 en import() lazy
  GalaxyCard.tsx      (NOUVEAU) card « Prévisualisation graphique » + Dialog(GalaxyView)
  FacturationBoard.tsx  monte GalaxyCard en haut du rail droit, lui passe le pool
```

---

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Deps | `package.json` | — |
| Métier (lib) | `facturation.test.ts` | `galaxy.ts` |
| Composants (UI) | `FacturationBoard.tsx` | `GalaxyView.tsx`, `GalaxyCard.tsx` |
| Réutilisés (sans modif) | `wordpool.ts` (pool/seed), `ui/dialog.tsx`, `constants.ts` (BUDGET_LINES/tags) | — |
| **Total** | **2 modifiés** | **3 nouveaux** |
