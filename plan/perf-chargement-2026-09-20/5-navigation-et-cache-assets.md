# Étape 5 — Retour visuel de navigation et cache des fichiers statiques

## Objectif

Deux corrections sans risque : ne plus laisser l'écran figé pendant qu'une page se
télécharge, et cesser de re-télécharger le même JavaScript à chaque visite.

## Contexte

**Aucun retour visuel pendant la navigation.** `src/router.tsx:20-21` déclare bien
`defaultPreload: 'intent'` et `defaultPreloadStaleTime: 60_000`, mais **ni
`defaultPendingComponent` ni `defaultPendingMs`** (vérifié : zéro occurrence dans
tout `src/`). Quand l'utilisateur clique sur un onglet, le routeur télécharge le
chunk de la route — pour `/repjour`, **~55 fichiers** — en laissant l'ancienne page
affichée et figée. Rien ne bouge à l'écran. Sur tablette, où il n'y a pas de survol
donc pas de préchargement, c'est perçu comme un gel de plusieurs secondes.

Le squelette adapté au chemin existe déjà (`src/components/shared/RouteSkeleton.tsx`,
utilisé au démarrage par `AppAuthGate`). Il suffit de le brancher.

Cette option avait été écartée dans le chantier `squelette-chargement-global`
(angle D1 : « inutile tant que les routes n'ont pas de `loader` »). C'était juste à
l'époque pour les données ; ça ne l'est pas pour le **chargement du code de la
route**, qui n'a rien à voir avec un `loader` et qui, lui, prend du temps.

**Le cache des fichiers statiques n'est pas déclaré.** `vercel.json` définit huit
en-têtes de sécurité sur `/(.*)`, et **aucun `Cache-Control`**. Avec
`"framework": null`, Vercel n'applique aucune optimisation propre à un framework
connu. Si les assets sont servis en `max-age=0, must-revalidate`, chaque
chargement revalide ~70 fichiers auprès du serveur — soit 70 allers-retours
évitables, même quand rien n'a changé. Les noms de fichiers étant déjà hachés
(`index-CXoewr-o.js`), ils sont par construction immuables : c'est un gain gratuit.

**À vérifier avant d'agir**, c'est l'inconnue de l'étape :

```bash
curl -sI https://backoffice.naostack.com/assets/<un-chunk>.js | grep -i cache-control
```

Si la réponse contient déjà `immutable`, il n'y a rien à faire sur ce point.

## Fichier(s) impacté(s)

- `src/router.tsx` (modifié)
- `vercel.json` (modifié, sous réserve du résultat de la vérification)

## Travail à réaliser

### 1. Retour visuel de navigation

```ts
// router.tsx — pendant qu'une route télécharge son code (jusqu'à ~55 fichiers),
// le routeur laissait l'ancienne page figée à l'écran. Le squelette de route
// existe déjà pour le démarrage : on le réutilise ici.
defaultPendingMs: 150,
defaultPendingMinMs: 300,
defaultPendingComponent: RouteSkeleton,
```

`defaultPendingMs: 150` évite un clignotement sur les navigations instantanées
(chunk déjà préchargé par le survol) ; `defaultPendingMinMs: 300` évite qu'un
squelette apparu ne disparaisse dans la foulée.

⚠ `RouteSkeleton` déduit sa variante du chemin. Vérifier qu'il reçoit bien le
chemin **de destination** et non celui d'origine quand le routeur le rend — sinon
le squelette affiché sera celui de la mauvaise page. Si le composant n'a pas accès
au chemin cible, lui passer un repli neutre plutôt qu'un squelette trompeur.

### 2. Cache des fichiers statiques

Uniquement si la vérification `curl` montre l'absence d'`immutable` :

```json
{
  "source": "/assets/(.*)",
  "headers": [
    {
      "key": "Cache-Control",
      "value": "public, max-age=31536000, immutable"
    }
  ]
}
```

⚠ Ne **jamais** appliquer cette règle à `/_shell.html` : c'est lui qui référence
les fichiers hachés. S'il est mis en cache long, un déploiement ne sera jamais vu
par les navigateurs déjà venus. La règle doit viser `/assets/` exclusivement, et
l'entrée existante sur `/(.*)` (les en-têtes de sécurité) doit rester intacte.

## Ordre d'exécution

1. `curl -sI …` sur un chunk en production, consigner le résultat.
2. `src/router.tsx` — brancher le squelette de navigation.
3. `vercel.json` — ajouter la règle `/assets/` si et seulement si nécessaire.
4. `npx tsc --noEmit`
5. `pnpm build`
6. Après déploiement : refaire le `curl`, vérifier `immutable`, et vérifier que
   `_shell.html` n'est **pas** en cache long.

## Critère de validation

- Clic sur un onglet applicatif sans survol préalable : un squelette apparaît
  **immédiatement**, jamais un écran figé.
- Navigation vers une route déjà préchargée par le survol : **pas** de
  clignotement de squelette.
- Deuxième visite du site : les fichiers de `/assets/` sont servis depuis le cache
  du navigateur (`(disk cache)` dans l'onglet Réseau), sans requête réseau.
- Après un nouveau déploiement, un navigateur déjà venu reçoit bien la nouvelle
  version — c'est le test qui prouve que `_shell.html` n'a pas été mis en cache.
