# Étape 3 — Bouton « + Caution » + dialogue de saisie

## Objectif

Ajouter le point d'entrée : un bouton dans la barre du haut de `CaisseBoard.tsx` qui ouvre un dialogue (chambre, montant, commentaire libre) ; la validation crée la caution et le fond de caisse affiché à l'écran augmente immédiatement.

## Contexte

Gabarit à reprendre : le bouton « Externe » ajouté récemment sur PDJ (`src/components/pdj/BreakfastBoard.tsx`, lignes ~956-970) — texte visible + icône, enveloppé dans un `Tip`, placé avant le `ButtonGroup` des actions de page. Ici l'utilisateur demande explicitement une icône « + » — lucide expose `Plus`.

## Fichier(s) impacté(s)

- `src/components/caisse/CaisseBoard.tsx`

## Travail à réaliser

### 1. Bouton dans la barre d'actions (`PageHeader`)

```tsx
{isWriter && (
  <Tip label="Ajouter une caution client">
    <Button
      variant="outline"
      size="sm"
      onClick={() => setCautionOpen(true)}
    >
      <Plus />
      Caution
    </Button>
  </Tip>
)}
```

Placé avant le `ButtonGroup` analytique/impression existant (lignes ~665-687), comme le bouton Externe sur PDJ. Garde d'affichage à trancher : `isWriter` (droit d'écriture sur la page caisse) plutôt que `canEditFields`/`dayEditable` seuls — une caution n'est pas bridée par la fenêtre J-1 de la feuille (D7), donc le bouton doit rester actif même si la feuille du jour affiché est hors fenêtre d'édition.

### 2. Dialogue de saisie

Nouveau composant local (pas besoin de partager avec un autre module) :

```tsx
function CautionDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (input: { room: number; amount: number; comment: string }) => void
}) {
  // room : Input numérique (1-80, cf. D6)
  // amount : réutiliser MoneyInput (déjà défini dans CloseSheetDialog.tsx ou
  //   colocalisé dans CaisseBoard.tsx — à vérifier lequel, factoriser si besoin
  //   plutôt que dupliquer)
  // comment : Textarea, libre, optionnel
}
```

Validation : `room` dans [1, 80], `amount > 0`. Bouton de confirmation désactivé tant que ces deux conditions ne sont pas remplies (miroir `CloseSheetDialog`, `disabled={busy || !hotelierName.trim()}`).

### 3. Branchement au fond affiché

Le fond effectif est désormais **toujours calculé en direct** (D4), qu'une feuille soit brouillon ou déjà validée :
- Charger toutes les cautions une fois (`fetchAllCautions`, `queryKey: ['caisse', 'cautions']`, dans le préfixe `['caisse']` déjà invalidé globalement par `invalidate()`, ligne ~504-505).
- À chaque affichage/recalcul de la feuille du jour sélectionné, utiliser `effectiveFundTarget(cautions, selectedDate, FUND_TARGET)` — jamais `form.fundOrigin` stocké — pour tout ce qui affiche ou évalue le fond attendu (carte fond de caisse, `fundEcart`/`isBalanced` avec la nouvelle signature de l'Étape 2, dialogue de clôture).
- Créer une caution invalide simplement le cache `['caisse', 'cautions']` : la feuille du jour affiché (brouillon OU déjà validée) reflète immédiatement le nouveau montant, sans distinction — c'est exactement la correction rétroactive automatique demandée (D4).

## Ordre d'exécution

1. Bouton + état `cautionOpen`
2. Dialogue de saisie (champs + validation)
3. Câblage `createCaution` (Étape 2) + invalidation + recalcul du fond affiché

## Critère de validation

- Cliquer « + Caution », saisir chambre 12 / 300 € / commentaire, valider : la carte « Fond de caisse » affichée passe de 150 € à 450 € pour le jour courant, sans recharger la page.
- `npx tsc --noEmit`
