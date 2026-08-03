# Étape 6 — Combler les actions non gardées + niveau `gestion` sur l'affichage

## Objectif

Fermer les actions à effet de bord qui échappent encore au modèle, et donner un
sens au niveau `gestion` sur l'affichage (où il est aujourd'hui confondu avec
`ecriture`).

## Contexte

Deux trous relevés en reconnaissance :

1. **RepJour** : le bouton « Envoyer par email » (`DashboardBoard.tsx` l.695-718,
   `sendReport`) n'est gardé par **aucun** niveau — un simple lecteur peut
   déclencher un envoi. Or import / forecast / destinataires / envoi serveur sont,
   eux, bien gardés.
2. **Affichage** : `AffichageBoard.tsx` distingue `canEdit = can('affichage',
   'ecriture')` mais pas `gestion` — créer, éditer et **supprimer** un template
   sont au même niveau.

## Fichier(s) impacté(s)

- `src/components/repjour/boards/DashboardBoard.tsx` (modifié — garder « Envoyer par email »)
- `src/components/affiche/AffichageBoard.tsx` (modifié — suppression template = gestion)

## Travail à réaliser

### 1. RepJour — garder l'envoi email

« Envoyer par email » a un effet de bord externe (envoi réel). Le classer en
**écriture** au minimum :

```tsx
// autour de sendReport / du bouton (l.695-718)
{can('repjour', 'ecriture') && (
  <Button onClick={sendReport}>Envoyer par email</Button>
)}
```

À confirmer : écriture suffit-elle, ou l'envoi doit-il être `gestion` (comme la
gestion des destinataires) ? Recommandation : **écriture** (produire/diffuser le
rapport du jour fait partie de l'exploitation courante ; la *configuration* des
destinataires reste gestion).

### 2. Affichage — suppression = gestion

L'affiche est une donnée « vivante » (le présent), donc créer/éditer restent en
`ecriture`. En revanche, **supprimer** un template est un acte destructif sur un
patrimoine partagé → le classer `gestion`, cohérent avec « gestion = actes lourds
sur l'historique/patrimoine ».

```tsx
const canEdit = can('affichage', 'ecriture')   // existant
const canManage = can('affichage', 'gestion')  // nouveau
// bouton Supprimer (TemplateDialog / AffichageBoard l.171-177, 530) : visible si canManage
```

La RLS `affiche_templates` reste à `>= 2` pour INSERT/UPDATE ; ajouter une policy
DELETE `= 'gestion'` si l'on veut le rempart serveur (à faire en étape 8 avec le
reste des ajustements RLS, ou ici via `supabase/page_permissions_rls.sql`).

## Ordre d'exécution

1. Garder « Envoyer par email » (repjour).
2. `canManage` + suppression template sous gestion (affichage).
3. Noter le besoin de policy DELETE `= gestion` pour `affiche_templates` (étape 8).

## Critère de validation

- Un lecteur repjour ne voit plus « Envoyer par email ».
- Un `affichage:ecriture` peut créer/éditer mais pas supprimer un template ;
  `affichage:gestion` peut supprimer.
- `npx tsc --noEmit` + `pnpm build` OK.
