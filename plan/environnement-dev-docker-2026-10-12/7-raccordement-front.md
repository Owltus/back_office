# Étape 7 — Raccordement du front : `pnpm dev` = local

## Objectif

`pnpm dev` ouvre l'app sur la base locale, sans configuration à retenir.
L'environnement est toujours visible à l'écran. Le front du poste ne vise
JAMAIS la prod (D13-A) : pour la voir, le site en ligne. Le site Vercel ne change pas d'un
octet de comportement.

## Fichier(s) impacté(s)

- `src/lib/environnement.ts` (nouveau, PUR) + `environnement.test.ts`
- `src/components/shared/BandeauEnvironnement.tsx` (nouveau) + test de rendu
- `src/lib/supabase.ts:15-16,177` (lecture de la cible, garde de démarrage)
- `src/components/auth/AuthContext.tsx:144-148` (ref de session)
- `src/routes/__root.tsx:38,76,135` (titre, preconnect conditionnel, bandeau)
- `.env.example`, `.env.development.local` (gitignoré), `package.json`, `start.bat`

## Travail à réaliser

1. **`lib/environnement.ts`** : `cibleDe(url)` → `'locale' | 'prod' |
   'autre'` (local = `127.0.0.1`, `localhost`, `[::1]`, `*.localhost` ; prod =
   `ozpavwghrmmkrnmkxodg.supabase.co`) ; `refSession(url)`, qui reproduit
   EXACTEMENT le nommage de clé de supabase-js (`sb-<ref>-auth-token`, à
   vérifier dans le code de supabase-js installé, pas supposé) ;
   `bandeau(cible, modeVite)`.
2. **Modes Vite** : `pnpm dev` = `vite dev --port 3000 --mode development`,
   qui lit `.env.development.local` (URL locale + clé anon locale de
   `supabase status`). Aucune commande `dev:prod` (D13-A). `.env` est vidé
   des clés prod (il ne sert plus) ; `pnpm build` lit les variables Vercel, comme
   aujourd'hui.
3. **Garde de démarrage** : sous `vite dev` (tout mode), une cible `prod` ou
   `autre` → erreur claire à l'écran, sans aucune requête (« pnpm dev vise
   la base locale ; la prod se consulte sur le site en ligne »). C'est elle qui
   empêche la retombée silencieuse sur la prod.
4. **Bandeau** (B5) dans `__root.tsx`, au-dessus de `AppAuthGate` (donc
   aussi sur `/login`) ; rien en build de production.
5. **Ref de session** : `AuthContext` passe par `refSession` (fin du
   « 127 »).
6. **Preconnect** vers l'URL configurée, plus vers la prod en dur.
6bis. **Ménage du navigateur (étanchéité, ajouté le 2026-10-13)** : depuis des
   mois, `localhost:3000` a servi l'app branchée sur la PROD. Son
   `localStorage` contient donc une session prod valide
   (`sb-ozpavwghrmmkrnmkxodg-auth-token`, jeton de renouvellement compris) et
   le cache de données de la prod (`bo.query.cache.v3`). Or
   `compteDeLaSession` (`queryPersist.ts:196`) prend la PREMIÈRE clé
   `sb-*-auth-token` trouvée : la session prod pouvait faire passer le cache
   prod pour celui du compte, et l'app locale aurait AFFICHÉ des données
   réelles. Correctif : au démarrage, toute clé `sb-<ref>-auth-token` dont le
   ref n'est pas celui de la cible est supprimée ; `compteDeLaSession` ne lit
   QUE la clé de la cible (`refSession`) ; le propriétaire du cache devient
   `<ref>:<userId>`, donc un cache écrit contre une autre base n'est jamais
   restauré. En prod, une seule clé existe : comportement inchangé (test).
   Le brouillon de secours du Classeur (`lib/classeur/brouillon.ts`, clé par
   compte) est déjà étanche, les identifiants locaux et prod étant
   différents.
7. **`start.bat`** : si la stack ne répond pas sur 54321, `pnpm db:start`,
   puis `pnpm dev`.

## Implications propres

- Une seule origine locale (3000), qui ne voit que des sessions locales
  APRÈS le ménage 6bis (avant, elle contenait celle de la prod).
- Le cache persisté local ne contient que des données fictives.

## Phase de test /martin

- Famille A : `cibleDe` sur URL arbitraires (fast-check : jamais `locale`
  pour un hôte `supabase.co`, jamais `prod` pour une IP de bouclage) ;
  `refSession` = la clé réellement écrite par supabase-js (test qui lit
  `localStorage` après un `signIn` simulé).
- Étanchéité du navigateur : `localStorage` préparé avec une session prod +
  un cache prod + une session locale → après démarrage, plus aucune clé
  prod, aucun cache restauré ; mutation « lire la première clé » attrapée.
- Rendu : bandeau ambre en local, absent en build ; garde = erreur sur toute
  cible non locale sous `vite dev` (fast-check sur des URL arbitraires).
- Stryker sur `environnement.ts` ≥ 80 %.
- Navigateur : `pnpm dev` → connexion `admin@exemple.test`, bandeau ambre,
  aucune requête vers `supabase.co` (onglet Réseau).

## Critère de validation

- `pnpm build` : le bundle ne contient ni « DEV » ni `127.0.0.1` (grep sur
  `dist/`).
- `npx tsc --noEmit` et `pnpm test` verts.
- Commit sans push.

## Contrôle /borg

- Chemin de panne (`readPersistedSessionUser`) toujours fonctionnel en prod.
- Aucune régression de `queryPersist` (cache par compte).
- Le site Vercel ne montre aucun bandeau.
