# Étape 4 — Routes et pages

## Objectif

Porter les cinq pages de Registre (liste des classeurs, tableau de bord,
chapitre, quatre détails) et leurs dialogues sur TanStack Router, TanStack
Query et les primitives shadcn du Back Office.

## Fichier(s) impacté(s)

- `src/routes/classeur/*` (voir l'arborescence de l'index)
- `src/components/classeur/ClasseurList.tsx` (ex `ClasseurListPage`, 428 l.)
- `src/components/classeur/ClasseurDashboard.tsx` (ex `DashboardPage`, 798 l.)
- `src/components/classeur/ChapterBoard.tsx` (ex `ChapterPage`, 940 l.) +
  `cards/*`, `dialogs/*`, `hooks/useSelection.ts`, `DropZone.tsx`
- `src/components/classeur/ChapterSidebar.tsx` (ex `Sidebar`, la partie
  liste des chapitres avec glisser-déposer)
- `src/components/classeur/detail/{Document,TrackingSheet,SignatureSheet,
  Intercalaire}Detail.tsx` + `useDetailPage.ts`
- `src/components/classeur/IconPicker.tsx`
- `src/components/classeur/ClasseurBoard.tsx` — supprimé (remplacé)

## Travail à réaliser

1. **Navigation** : `useParams` / `useNavigate` de TanStack Router ; le
   layout `$classeurId.tsx` rend la colonne des chapitres à gauche (sidebar
   de Registre) et l'`Outlet` à droite ; sur mobile, la colonne devient un
   tiroir (`ui/sheet`).
2. **Données** : `useQuery` avec `classeurKeys`, `staleTime` 60 s ;
   mutations via `useMutation` de TanStack Query + invalidation.
3. **Droits** : `can('classeur','ecriture')` masque création, édition,
   suppression, glisser-déposer, import ; `can('classeur','gestion')` pour la
   suppression de classeur. La base fait foi (RLS).
4. **Dialogues** : `ui/dialog` du Back Office (pas de `@radix-ui/react-dialog`
   direct) ; confirmation de suppression via `shared/ConfirmDialog`.
5. **Retours utilisateur** : le Back Office n'a pas de toasts ; utiliser
   `ui/alert` inline et les états des boutons (`Loader2`), messages courts,
   ton hôtelier (mémoire `ux-messages-hotelier`).
6. **Glisser-déposer** : `@dnd-kit` (core, sortable, modifiers, utilities)
   ajouté ; import de fichiers par dépôt (`DropZone`) borné par
   `lib/shared/files.ts`.
7. **Recherche** : instantanée, sur titre/description/contenu, accents
   ignorés (`stripAccents`).
8. **Squelettes** : `isPending` partout, jamais d'état vide affirmé pendant
   un chargement.

## Critère de validation

- Chaque page se charge, crée, modifie, supprime, réordonne en production
  avec le compte admin.
- Un compte `lecture` ne voit aucun bouton d'écriture et la base refuse une
  écriture forcée (42501).

## Contrôle /borg

- Aucun `useEffect` + `useState` + fetch manuel.
- Aucune `queryKey` sans préfixe `classeur`.
- Aucun `select('*')`.
