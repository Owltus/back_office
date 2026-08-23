# Étape 12 — Validation globale

## Objectif

Vérifier que l'ensemble du chantier (étapes 1-11) n'a rien cassé, que le
chemin souris (jsPDF) reste inchangé partout, et que l'impression tactile
des 5 boards + 10 pages analytique ouvre désormais réellement l'interface
d'impression native, comme PDJ.

## Fichier(s) impacté(s)

Aucun fichier propre — validation transverse de tous les fichiers touchés
par les étapes 1-11.

## Travail à réaliser

### 1. Validation automatisée

- `npx tsc --noEmit`
- `npx vitest run`
- `npx pnpm build`
- `pnpm lint` (vérifier qu'aucun des fichiers touchés n'introduit de
  nouveaux problèmes — la base de 211 problèmes préexistants, tous confinés
  à `src/lib/repjour/*`, ne doit pas grandir sur les fichiers de ce
  chantier)
- Grep de contrôle : `printWindow` ne doit plus apparaître dans
  `src/lib/{rapro,repjour,parking,caisse}/pdf.ts` ni dans les 4 boards
  (étape 9).

### 2. Checklist de test manuel — chemin TACTILE (DevTools device mode a
   minima ; appareil réel indispensable pour confirmer `@media print`, cf.
   limite ci-dessous)

Pour CHACUNE des surfaces suivantes : Rapro, RepJour, Parking, Caisse, PDJ
(déjà validé, sert de référence), et au moins une page analytique par
domaine (5) :

- [ ] Cliquer Imprimer ouvre DIRECTEMENT l'interface d'impression native du
      navigateur (pas un nouvel onglet avec un PDF à ouvrir soi-même).
- [ ] Le contenu affiché dans l'aperçu d'impression correspond aux données
      réellement à l'écran (mêmes chiffres, mêmes lignes).
- [ ] Aucun élément de chrome de l'app (Navbar, barre d'outils basse,
      boutons, tooltips) n'apparaît dans l'aperçu.
- [ ] Aucune modale/tiroir ouvert au moment du clic ne s'imprime (étape 10).
- [ ] Parking spécifiquement : l'aperçu est en PAYSAGE, 4 jours sur 2 pages,
      places 13-14 grisées.

### 3. Checklist de test manuel — chemin SOURIS (doit rester STRICTEMENT
   inchangé)

Pour les mêmes surfaces :

- [ ] Le bouton Imprimer génère toujours le PDF jsPDF vectoriel, ouvert
      dans un nouvel onglet/iframe, exactement comme avant ce chantier.
- [ ] `pdfBusy`/`disabled` fonctionnent pendant la génération (étape 1, 8).
- [ ] Une erreur simulée (import jsPDF bloqué) affiche un message, jamais
      un échec muet (étape 8).

## Critère de validation

- Les 4 commandes automatisées passent sans régression.
- La checklist manuelle est cochée pour les 5 boards + au moins 5 pages
  analytique (une par domaine), sur les deux chemins (tactile et souris).

## Limite à mentionner explicitement à l'utilisateur

Comme documenté dans les plans précédents de ce dépôt
(`plan/responsive-tactile-multi-pages/`) : les tests automatisés
(Vitest/jsdom) ne peuvent pas simuler `hover`/`pointer` ni le comportement
réel de `window.print()` d'un vrai navigateur mobile. La validation de ce
chantier reste donc en grande partie manuelle — un test sur appareil réel
(pas seulement l'émulation DevTools) est fortement recommandé avant de
considérer le chantier terminé, en particulier pour Parking (mise en page
paysage) et pour confirmer que le rendu `@media print` est fidèle sur au
moins un iPhone (Safari) et une tablette Android (Chrome).

## Contrôle qualité (revue)

Dernière étape du plan, qui synthétise 11 étapes touchant collectivement
~20 fichiers répartis sur 4 couches (boards, styles CSS d'impression,
génération PDF, infrastructure partagée). Avant de clore le chantier,
relire l'ensemble des diffs en une passe pour vérifier la cohérence
transversale : les 5 surfaces (4 boards + Analytique) doivent maintenant
partager EXACTEMENT le même schéma sur le chemin tactile (`printWithTitle()`
sur un document `@media print` dédié) et sur le chemin souris (jsPDF
inchangé, garde `pdfBusy` → try/catch → message d'erreur), sans qu'aucune
n'ait dérivé pendant l'exécution séquentielle des étapes précédentes.
