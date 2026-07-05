# Étape 4 — UI CRUD (ajouter / éditer / supprimer) + gating par rôle

## Objectif

Ajouter l'interface de gestion des modèles (créer, modifier, supprimer) via un dialog, gatée par rôle : lecture / application pour tous les connectés, écriture pour les rôles autorisés (D1). Miroir du double gating parking (guards `if (!canEdit) return` + masquage des affordances + RLS comme vrai rempart).

## Contexte

`AffichageBoard` n'importe aujourd'hui **aucun rôle**. Le `Select` de modèles ne fait que sélectionner. Il faut : brancher `useAuth`, définir `canEdit`, ajouter les actions CRUD à côté du sélecteur, et un formulaire réutilisant les pickers d'icône / couleur déjà présents dans le board.

## Fichier(s) impacté(s)

- `src/components/affiche/AffichageBoard.tsx` (modification : `useAuth`, `canEdit`, boutons + mutations)
- `src/components/affiche/TemplateDialog.tsx` (nouveau : formulaire créer / éditer)

## Travail à réaliser

### 1. Gating par rôle

```ts
const { role } = useAuth()
const canEdit = role === 'super_utilisateur' || role === 'admin' // D1 = A
```

(D1 = B : `role === 'admin'`.) Les boutons Ajouter / Modifier / Supprimer ne sont rendus que si `canEdit`. La génération / impression d'affiche reste ouverte à tous. Chaque handler de mutation démarre par `if (!canEdit) return` (défense en profondeur ; la RLS reste le vrai rempart).

### 2. `TemplateDialog.tsx` — formulaire créer / éditer

Dialog shadcn (`components/ui/dialog.tsx`, déjà présent) avec les 7 champs du modèle : `name`, `icon` (réutiliser le picker Popover + grille d'icônes du board), `color` (réutiliser le picker de couleur), `titleFr`, `messageFr`, `titleEn`, `messageEn`. Props : `mode: 'create' | 'edit'`, `initial?: AfficheTemplate`, `onSubmit(template)`, `open`, `onOpenChange`. Valider `name` non vide et `color` ∈ `ColorKey` avant submit.

Envisager d'extraire les pickers icône / couleur du board en petits composants réutilisables (partagés board ↔ dialog) plutôt que de les dupliquer.

### 3. Mutations (D3 = A : `useQuery` + invalidation)

```ts
const qc = useQueryClient()
const invalidate = () => qc.invalidateQueries({ queryKey: ['affiche', 'templates'] })

async function handleCreate(form: Omit<AfficheTemplate, 'id'>) {
  if (!canEdit) return
  const t: AfficheTemplate = { id: crypto.randomUUID(), ...form }
  try {
    await createTemplate(toDbInsert(t))
    invalidate()
  } catch (err) {
    console.error('[affiche] création modèle échouée', err)
  }
}
// handleUpdate(id, patch) -> updateTemplate + invalidate
// handleDelete(id)        -> confirmation, deleteTemplate + invalidate, puis
//                            si le modèle supprimé était sélectionné, reset selectedTemplate
```

(D3 = B : reprendre le patron optimistic + realtime du parking — muter l'état local puis appeler le service, réconciliation par id via l'abonnement `postgres_changes`.)

### 4. Actions à côté du sélecteur

À droite du `Select` de modèles : bouton « + » (ouvre le dialog en `create`), et pour le modèle sélectionné, « Modifier » (dialog `edit` pré-rempli) et « Supprimer » (avec confirmation). Tous conditionnés par `canEdit`. En lecture seule (`utilisateur`), seul le `Select` reste, sans ces boutons.

## Ordre d'exécution

1. Brancher `useAuth` + `canEdit` dans `AffichageBoard`.
2. Créer `TemplateDialog.tsx` (extraire au besoin les pickers icône / couleur).
3. Câbler create / update / delete (+ invalidation ou optimistic selon D3).
4. Masquer toutes les affordances d'écriture si `!canEdit` ; ajouter les guards `if (!canEdit) return`.
5. `npx tsc --noEmit`.

## Critère de validation

- Un `super_utilisateur` / `admin` peut créer, modifier, supprimer un modèle ; la liste se rafraîchit.
- Un `utilisateur` ne voit **aucun** bouton d'écriture ; même en forçant un appel service, la RLS refuse (Étape 1).
- Supprimer le modèle sélectionné réinitialise proprement `selectedTemplate` sans casser l'aperçu.
- Le formulaire ne persiste QUE les 7 champs du modèle (jamais dates / horaires / tailles).
- `npx tsc --noEmit`, `pnpm lint` et `pnpm check` (Prettier) passent sur les fichiers touchés.
