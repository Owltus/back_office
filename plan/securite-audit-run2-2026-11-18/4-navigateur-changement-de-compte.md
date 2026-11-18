# Étape 4 — Navigateur : rien ne survit à un changement de compte

## Objectif

Sur le poste partagé de la réception, aucune donnée d'un compte ne doit rester visible pour le compte suivant. Cela vaut dans le même onglet comme dans un autre onglet.

## Fichier(s) impacté(s)

- `src/lib/queryPersist.ts` (`changerDeCompte`, `brancherPersistance`)
- `src/components/auth/AuthContext.tsx` (`applyUser`, écouteur `storage`)
- `src/lib/auth/oubliSession.ts` (nouveau) + `oubliSession.test.ts`
- `src/lib/facturationStore.ts`, `src/lib/afficheStore.ts`, `src/lib/classeur/images.ts`, `src/lib/classeur/restauration.ts`
- `src/components/facturation/FacturationBoard.tsx`
- `src/lib/queryPersist.integration.test.ts`, `src/lib/facturationStore.test.ts`

## Travail à réaliser

### 1. Mémoire de l'onglet liée à son compte

Ajouter `let marqueMemoire: string | null` à côté de `clientBranche` :

- Dans `brancherPersistance`, la poser à la marque gardée (ou à null si le cache est effacé). Ne jamais la mettre à null au démarrage quand le cache est gardé : c'est ce qui protège la lecture pendant une panne.
- Dans `changerDeCompte`, ne sortir tôt que si `marque === marqueMemoire && avant === marque`. Sinon, vider la mémoire et le disque, puis poser la marque.
- Un même compte (TOKEN_REFRESHED, SIGNED_IN rejoué) ne déclenche rien. Une erreur réseau n'efface toujours rien.

### 2. Écouteur `storage` (autres onglets)

- Dans `queryPersist.ts` : si la marque propriétaire change ou disparaît dans un autre onglet et diffère de `marqueMemoire`, vider la mémoire et oublier la session.
- Dans `AuthContext` : si la clé de session `sb-*-auth-token` disparaît alors qu'un compte est connecté, remettre l'état à zéro comme `signOut`, sans rappeler `signOut` (risque de verrou auth-js). Pas de `location.reload()` : il donnerait un écran blanc pendant une panne.

### 3. Registre « oublier la session »

- `surOubliSession(fn)` et `oublierSession()`, chaque réinitialisation dans son propre try/catch.
- Les modules s'y inscrivent au chargement : factures (`clearFacturation`), affiche (`resetAffiche`), images (révoquer les URL `blob:`), restauration (vider les tables d'ids).
- Un seul appel, dans `changerDeCompte`, à côté de `clientBranche?.clear()`.
- En plus : `FacturationBoard` n'affiche la liste des factures qu'avec le droit de gestion.

### 4. Profil mélangé entre deux onglets (relevé pendant l'exploration)

`applyUser` (`AuthContext.tsx:380-386`) compare avec le profil en cache partagé. Il doit comparer avec `profileUserIdRef.current` et `permsUserIdRef.current`.

## Ordre d'exécution

1. Tests d'abord :
   - « un autre onglet a écrit la marque avant moi » ;
   - « même compte au démarrage : le cache reste » ;
   - « l'événement storage vide la mémoire » ;
   - le registre ;
   - la factures vidée par `oublierSession()`.
2. Code, puis `pnpm test`, `npx tsc --noEmit`.
3. Essai sur localhost avec deux comptes fictifs (A en gestion facturation, B en lecture), sans jamais utiliser un vrai compte :
   - déconnexion puis connexion de B dans le même onglet ;
   - puis deux onglets, en simulant une panne d'auth pendant la déconnexion.

## Critère de validation

- Après déconnexion de A et connexion de B, aucune donnée de A n'apparaît, ni en mémoire ni dans `bo.query.cache.v4`.
- Le cache est toujours restauré pour le même compte après un rechargement hors ligne.
- Pas de relecture réseau sur TOKEN_REFRESHED (vérifié dans l'onglet Réseau).

## Contrôle /borg

- Les règles de CLAUDE.md (panne, cache persisté, `TOKEN_REFRESHED`) sont intactes.
- `etancheiteNavigateur.test.ts` est vert.
