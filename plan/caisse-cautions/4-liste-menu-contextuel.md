# Étape 4 — Liste des cautions actives + menu contextuel (Rembourser / Supprimer)

## Objectif

Afficher les cautions actives sur la page Caisse (chambre, montant, commentaire, depuis quand) et permettre, via un menu contextuel sur une ligne, de la rembourser (fin de cascade) ou de la supprimer (correction d'erreur de saisie, réservé gestion).

## Contexte

Gabarit du menu contextuel : `src/components/parking/ParkingBoard.tsx` (lignes ~1922-1977) — `ContextMenu` / `ContextMenuTrigger` / `ContextMenuContent` / `ContextMenuItem` / `ContextMenuSeparator`, avec un item `variant="destructive"` pour l'action de suppression. Ici, deux items suffisent (pas de `ContextMenuRadioGroup`, pas de statut multi-valeurs) :

```tsx
<ContextMenuContent className="w-48">
  <ContextMenuItem onSelect={() => onRefund(caution.id)}>
    <Undo2 />
    Rembourser
  </ContextMenuItem>
  {isGestion && (
    <>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={() => onDelete(caution.id)}>
        <Trash2 />
        Supprimer
      </ContextMenuItem>
    </>
  )}
</ContextMenuContent>
```

« Rembourser » ouvre une confirmation simple (ou directement une action, à trancher : est-ce qu'on redemande une date de remboursement, ou prend-on systématiquement AUJOURD'HUI ? Recommandé : aujourd'hui par défaut, pas de dialogue supplémentaire — cohérent avec « simple » demandé par l'utilisateur). « Supprimer » passe par `ConfirmDialog` (déjà utilisé ailleurs dans l'app, ex. PDJ `handleDeleteDay`) vu son caractère destructif et réservé gestion.

## Fichier(s) impacté(s)

- `src/components/caisse/CaisseBoard.tsx`

## Travail à réaliser

### 1. Emplacement de la liste

À trancher avec l'utilisateur au moment de l'implémentation (pas anticipé dans la demande initiale) : une petite carte/section sous l'en-tête (façon RepJour `DayCrossSummary`) listant les cautions actives triées par date de prise, chacune avec chambre / montant / commentaire tronqué / bouton menu contextuel (ou clic droit direct sur la ligne). Recommandé : une carte compacte, visible seulement s'il y a au moins une caution active (comme le pattern déjà vu sur PDJ pour la tuile « PDJ Extra » conditionnelle).

### 2. Action Rembourser

```tsx
function handleRefund(id: string) {
  if (!isWriter) return
  refundCaution(id, todayReportDate)
    .then(() => queryClient.invalidateQueries({ queryKey: ['caisse'] }))
    .catch(() => flashError(...))
}
```

### 3. Action Supprimer (gestion)

```tsx
function handleDeleteCaution(id: string) {
  if (!isGestion) return
  setConfirmDeleteCautionId(id) // ouvre ConfirmDialog
}
// onConfirm :
deleteCaution(id).then(() => queryClient.invalidateQueries({ queryKey: ['caisse'] }))
```

## Ordre d'exécution

1. Emplacement + rendu de la liste (lecture seule d'abord)
2. Menu contextuel + action Rembourser
3. Action Supprimer (gestion) + `ConfirmDialog`

## Critère de validation

- Une caution remboursée aujourd'hui disparaît immédiatement de la liste des « actives » ET le fond attendu du jour (et des jours suivants) redescend aussitôt de son montant (D3, pas de « jour où elle compte encore »).
- Une caution supprimée disparaît immédiatement, action refusée en RLS pour un rôle non-gestion (vérifier le message d'erreur, pas un crash silencieux).
- `npx tsc --noEmit`
