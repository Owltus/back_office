# Étape 3 — Frontend : route Caisse + `CaisseBoard` (saisie, écarts temps réel, persistance)

## Objectif

Remplacer le placeholder `ComingSoon` de `/caisse` par le vrai `CaisseBoard` : sélection date + shift, saisie des montants attendus (StayNTouch, Lightspeed) et réels (CAISSE), grille de comptage du fond de caisse, **calcul des écarts en temps réel** (colorés, cible 0 €), zone commentaires, chargement/persistance via TanStack Query (D3). Le verrou proprement dit (bouton Valider, état verrouillé, gating fin) est traité en Étape 4 ; ici on livre une feuille **saisissable et persistée**.

## Contexte

Modèle de référence : `src/components/pdj/BreakfastBoard.tsx` (useQuery par jour + écriture service + `invalidateQueries` + `canEdit`) et `src/components/repjour/boards/DataContent.tsx` (grille d'`<Input type="number">` pilotée par un objet de form state). Formatage : `fmt.eur` / `fmt.ecartEur` de `src/lib/repjour/format.ts`. Navigation par date : `DatePickerButton` de `src/components/form/fields.tsx`. Sélecteur de shift : `Select` shadcn (ou boutons stylés façon onglets de `GestionBoard`). Tokens de thème uniquement (pas de HEX). Règle métier : les colonnes **CB WEB / ADYEN** ne sont pertinentes que pour le shift **soir** (`isEveningOnlyRelevant`).

## Fichier(s) impacté(s)

- `src/routes/caisse.tsx` (modifié)
- `src/components/caisse/CaisseBoard.tsx` (nouveau)
- `src/styles/caisse.css` (nouveau)
- `src/styles.css` (modifié — ajout `@import`)

## Travail à réaliser

### 1. Route

```tsx
// src/routes/caisse.tsx
import { createFileRoute } from '@tanstack/react-router'
import { PageContainer } from '#/components/PageContainer.tsx'
import { CaisseBoard } from '#/components/caisse/CaisseBoard.tsx'

export const Route = createFileRoute('/caisse')({
  component: CaissePage,
  head: () => ({ meta: [{ title: 'Caisse — Back Office' }] }),
})

function CaissePage() {
  return <PageContainer printBleed><CaisseBoard /></PageContainer>
}
```

(La route et l'entrée de menu `Banknote` existent déjà ; on ne touche pas `Navbar.tsx` ni `routeTree.gen.ts`.)

### 2. `CaisseBoard.tsx` — structure

- **En-tête** : `DatePickerButton` (date de la feuille) + `Select`/onglets pour le shift + champ `operator_initials`.
- **Lecture** : `useQuery({ queryKey: ['caisse','sheet', date, shift], queryFn: () => fetchSheet(date, shift), enabled: !!date })`. Un `useQuery(['caisse','sheets'])` peut alimenter un historique/liste latérale (optionnel).
- **Form state local** : hydraté depuis la donnée chargée (ou valeurs par défaut si nouvelle feuille), objet `{ sntCash, ..., counts: {...}, comment }`. Chaque `<Input type="number" step="0.01" className="text-right tabular-nums">` fait `setForm(f => ({ ...f, [k]: parseFloat(e.target.value) || 0 }))`.
- **Tableau des montants** : trois blocs de lignes (STAY N' TOUCH, LIGHTSPEED, CAISSE) × colonnes (CASH, CB, AX, CHEQ, CVAC, WEB/ADYEN), plus une **ligne ÉCARTS** calculée à la volée par `computeEcarts(form)` — chaque cellule colorée `text-emerald-500` si 0, `text-destructive` sinon. Colonnes WEB/ADYEN grisées/masquées hors shift soir.
- **Grille fond de caisse** : `DENOMINATIONS.map(...)` → une ligne `valeur | <Input number> | sous-total`. Pied : `fundTotal(form)` vs `FUND_TARGET` (150 €) et `fundEcart` (doit être 0).
- **Commentaires** : `<Textarea>` (obligatoire si un écart ≠ 0 — message d'aide, pas de blocage dur en V1).
- **Persistance (brouillon)** : bouton « Enregistrer » → `upsertSheet(toInput(form, date, shift))` puis `queryClient.invalidateQueries({ queryKey: ['caisse'] })`. Messages succès/erreur en `<div>` conditionnels (`bg-emerald-500/10` / `bg-destructive/10`), pattern PDJ (pas de Toast dans le repo).
- **`canEdit`** : `const { role } = useAuth()` ; `const editable = canEditSheet(sheet, role)`. En Étape 3, `editable` grise simplement les inputs pour les rôles lecture ; la logique de verrou complète arrive en Étape 4.

### 3. Styles

- `src/styles/caisse.css` : classes `.caisse-*` (grille du tableau, alignement des montants, styles d'impression pour reproduire la feuille — `@media print`). Le gros du style reste en Tailwind inline avec tokens shadcn.
- `src/styles.css` : ajouter `@import './styles/caisse.css';` à la suite des autres imports de feature.

## Ordre d'exécution

1. Ajouter l'`@import` dans `styles.css` et créer `caisse.css` (vide au départ).
2. Écrire `CaisseBoard.tsx` : en-tête + lecture `useQuery` + form state.
3. Tableau des montants + ligne écarts temps réel.
4. Grille fond de caisse + totaux.
5. Persistance brouillon (`upsertSheet` + invalidation) + messages.
6. Remplacer le corps de `caisse.tsx` par `<CaisseBoard/>`.

## Critère de validation

- `/caisse` affiche la feuille (plus de `ComingSoon`) ; changer date/shift charge la feuille correspondante ou une feuille vierge.
- Les écarts se recalculent **à la frappe** ; une cellule à 0 est verte, sinon rouge ; le fond de caisse totalise en direct et compare à 150 €.
- Les colonnes CB WEB / ADYEN n'apparaissent (ou ne sont actives) que pour le shift **soir**.
- « Enregistrer » persiste : recharger la page restaure la saisie (upsert sur `(report_date, shift)`, pas de doublon).
- Un `utilisateur` (rôle lecture) voit la feuille mais ne peut pas saisir.
- `npx tsc --noEmit` et `pnpm build` passent.
