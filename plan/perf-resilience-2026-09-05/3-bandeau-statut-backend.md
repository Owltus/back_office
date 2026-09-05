# Étape 3 — Bandeau « service indisponible » et squelette non muet

## Objectif

Qu'une panne soit visible et honnête : un bandeau discret, accessible,
« Connexion au serveur interrompue. Nouvelle tentative dans 12 s. » avec un
bouton Réessayer, à la place d'un squelette infini muet. Rien n'apparaît
tant que tout va bien (règle UX du projet : messages d'anomalie seulement).

## Contexte

`AppAuthGate.tsx:21-42` : `BootSkeleton` est `aria-hidden="true"` et sans
délai de garde ; `PageGuard.tsx` idem avec `GuardSkeleton`. Aucun toast ni
bandeau global n'existe. Modèle à imiter :
`src/components/shared/SendStatusBanner.tsx` (`role="status"`, ton ambre,
icône lucide, message court + action). Primitive `ui/alert.tsx` : jamais
retouchée à la main. Messages : phrases courtes, ponctuation simple, pas de
« tout va bien » (`ux-messages-hotelier`).

## Fichier(s) impacté(s)

- `src/components/shared/BackendStatusBanner.tsx` (nouveau)
- `src/components/auth/AppAuthGate.tsx` (modifié)
- `src/components/auth/PageGuard.tsx` (modifié, branchement minimal)

## Travail à réaliser

### 1. `BackendStatusBanner`

```tsx
export function BackendStatusBanner() {
  const state = useSyncExternalStore(backendHealth.subscribe, backendHealth.getState)
  const now = useNow(1_000)   // horloge locale existante, réglée à 1 s
  const queryClient = useQueryClient()
  if (state.status === 'up') return null
  const seconds = Math.max(0, Math.ceil(((state.nextRetryAt ?? 0) - now.getTime()) / 1000))
  return (
    <div role="status" aria-live="polite" className="… ambre, pleine largeur, sous la Navbar …">
      <WifiOff className="size-4" aria-hidden="true" />
      <span>Connexion au serveur interrompue.</span>
      <span>{seconds > 0 ? `Nouvelle tentative dans ${seconds} s.` : 'Nouvelle tentative en cours.'}</span>
      <Button size="sm" variant="outline" onClick={() => {
        backendHealth.retryNow()
        void queryClient.refetchQueries({ type: 'active' })
      }}>Réessayer</Button>
    </div>
  )
}
```

- `useNow` (`src/components/shared/useNow.ts`) accepte-t-il un intervalle ?
  Sinon ajouter un paramètre optionnel (défaut 60 s inchangé) : à la
  discrétion de l'exécutant.
- Aucun texte sur le retour à la normale : le bandeau disparaît, c'est tout.
- Le bandeau est monté DANS `AppAuthGate`, dans les deux branches (squelette
  de démarrage et chrome complet), juste sous la `Navbar` ; il a accès au
  `QueryClient` injecté par le router.

### 2. Garde de 5 s sur le squelette de démarrage (`AppAuthGate.tsx:73-75`)

- `useDelayedFlag(5_000)` (petit hook local) : après 5 s de `loading`,
  afficher au-dessus du `BootSkeleton` un texte `role="status"` :
  « Chargement plus long que prévu. » (retirer `aria-hidden` sur ce texte
  seul, le squelette reste décoratif).
- Si `backendHealth` est `down`, le bandeau de l'étape 1 remplace ce texte.

### 3. `PageGuard`

Rien à ajouter au-delà de l'étape 2 : le squelette de page se trouve sous le
bandeau monté par `AppAuthGate`.

## Ordre d'exécution

1. Composant, puis montage dans `AppAuthGate`.
2. Test visuel en dev avec blocage `*.supabase.co` sur `/repjour`, `/parking`,
   `/pdj`, `/rapro`, `/caisse`, `/login`.

## Critère de validation

- Fonctionnement normal : aucun bandeau, aucun texte supplémentaire, le
  squelette de démarrage est inchangé pixel pour pixel.
- Panne simulée : bandeau en moins de 21 s (timeout) ou immédiatement si une
  requête a déjà échoué ; compte à rebours décroissant ; bouton Réessayer
  relance UNE salve de requêtes ; au déblocage, le bandeau disparaît en moins
  de 30 s sans rechargement.
- Lecteur d'écran (NVDA ou Narrateur) : le message est annoncé une fois à
  l'apparition, pas à chaque seconde (le compte à rebours est dans un
  `span` séparé hors `aria-live`, ou `aria-live` porté par un conteneur qui
  ne change qu'à l'apparition : trancher à l'implémentation).
- `npx tsc --noEmit` vert, `pnpm build` vert.
