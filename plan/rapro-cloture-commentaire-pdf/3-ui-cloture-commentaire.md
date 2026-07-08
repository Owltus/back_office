# Étape 3 — UI : clôture, réouverture, commentaire, verrou

## Objectif

Brancher dans `RaproBoard` : le bouton **Clôturer / Réouvrir** (sans modale), la **zone commentaire** (persistée au blur), et le **verrou de la grille** quand le jour est clôturé (lecture seule ; réouverture pour rééditer).

## Contexte

Patron répliqué : `src/components/caisse/CaisseBoard.tsx` (header actions 431-460, verrou `canEditFields` 216, zone commentaire 649-666), **simplifié** : pas de `Dialog` de clôture, pas de `window.confirm` à la réouverture, pas de bouton « Verrouillé » rouge (inutile sans grâce), pas de nom hôtelier.

Rappel état rapro : écritures optimistes `cycle(room)` et `toggleFloor(rooms)` gardées par `!isWriter || !isSuccess`. On ajoute une garde `isValidated`.

## Fichier(s) impacté(s)

- `src/components/rapro/RaproBoard.tsx` (modifié)

## Travail à réaliser

### 1. Charger la feuille jour + dérivés

```ts
import { useAuth } from '#/components/auth/AuthContext.tsx' // user déjà via role ; récupérer user
// ...
const { user, role } = useAuth()
const { data: sheet } = useQuery({
  queryKey: ['rapro', 'sheet', selectedDate],
  queryFn: () => fetchSheet(selectedDate),
})
const isValidated = sheet?.status === 'validated'
const canEditFields = isWriter && !isValidated
```

### 2. Boutons header (dans `PageHeader actions`, à gauche des chevrons)

```tsx
{isWriter &&
  (!isValidated ? (
    <Button variant="outline" size="sm" onClick={handleClose}>
      <Lock /> Clôturer
    </Button>
  ) : (
    <Button variant="outline" size="sm" onClick={handleReopen}>
      <LockOpen /> Réouvrir
    </Button>
  ))}
{isValidated && (
  <PrintButton onClick={handleGeneratePdf} iconOnly disabled={pdfBusy} />
)}
```

Handlers (sans modale ni confirm) :

```ts
async function handleClose() {
  if (!user) return
  // On persiste d'abord le commentaire courant, puis on clôture.
  await saveComment(selectedDate, comment).catch(() => {})
  await validateSheet(selectedDate, user.id)
  queryClient.invalidateQueries({ queryKey: ['rapro', 'sheet', selectedDate] })
}
async function handleReopen() {
  await reopenSheet(selectedDate)
  queryClient.invalidateQueries({ queryKey: ['rapro', 'sheet', selectedDate] })
}
```

### 3. Zone commentaire (après la grille, avant la fermeture du conteneur)

```tsx
<div className="rapro-comment">
  <h2 className="rapro-comment-title">Commentaires</h2>
  <Textarea
    value={comment}
    onChange={(e) => setComment(e.target.value)}
    onBlur={() => canEditFields && saveComment(selectedDate, comment).catch(() => {})}
    disabled={!canEditFields}
    placeholder="Remarques du jour…"
    className="min-h-24"
  />
</div>
```

État local hydraté depuis la feuille :

```ts
const [comment, setComment] = useState('')
useEffect(() => {
  setComment(sheet?.comment ?? '')
}, [sheet?.reportDate, sheet?.comment])
```

(Styles `.rapro-comment*` à ajouter dans `src/styles/rapro.css`, sobres, comme les autres blocs.)

### 4. Verrou de la grille quand clôturé

- Cases chambre : `disabled={!canEditFields || !isSuccess}` (au lieu de `!isWriter || !isSuccess`).
- Boutons d'étage (`toggleFloor`) : n'afficher/activer que si `canEditFields`.
- Les handlers `cycle` et `toggleFloor` sortent tôt si `!canEditFields` (empêche toute écriture optimiste sur un jour clôturé).

## Ordre d'exécution

1. Acter D2 (commentaire au blur).
2. Ajouter la query `sheet` + `isValidated` + `canEditFields`.
3. Boutons header + handlers `handleClose` / `handleReopen`.
4. Zone commentaire + hydratation + `saveComment` au blur.
5. Remplacer les gardes `!isWriter` par `!canEditFields` dans la grille.
6. `npx tsc --noEmit`.

## Critère de validation

- Cliquer **Clôturer** → la grille et le commentaire passent en lecture seule, le bouton devient **Réouvrir**, le bouton **Imprimer** apparaît.
- Cliquer **Réouvrir** (à tout moment, super/admin) → tout redevient éditable.
- Le commentaire saisi est persisté (visible après navigation aller-retour de jour) et figé quand clôturé.
- Un `utilisateur` (lecture seule) ne voit ni Clôturer ni Réouvrir ; il voit l'état mais ne peut rien modifier.
- `npx tsc --noEmit` vert.
