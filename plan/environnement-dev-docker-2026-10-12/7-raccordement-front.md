# Étape 7 — Raccordement du front : `pnpm dev` = local

## Objectif

`pnpm dev` ouvre l'app sur la base locale, sans configuration à retenir.
L'environnement est toujours visible à l'écran. Viser la prod depuis le poste
est un geste distinct, signalé en rouge. Le site Vercel ne change pas d'un
octet de comportement.

## Fichier(s) impacté(s)

- `src/lib/environnement.ts` (nouveau, PUR) + `environnement.test.ts`
- `src/components/shared/BandeauEnvironnement.tsx` (nouveau) + test de rendu
- `src/lib/supabase.ts:15-16,177` (lecture de la cible, garde de démarrage)
- `src/components/auth/AuthContext.tsx:144-148` (ref de session)
- `src/routes/__root.tsx:38,76,135` (titre, preconnect conditionnel, bandeau)
- `.env.example`, `.env.development.local` et `.env.production.local`
  (gitignorés), `package.json`, `start.bat`

## Travail à réaliser

1. **`lib/environnement.ts`** : `cibleDe(url)` → `'locale' | 'prod' |
   'autre'` (local = `127.0.0.1`, `localhost`, `[::1]`, `*.localhost` ; prod =
   `ozpavwghrmmkrnmkxodg.supabase.co`) ; `refSession(url)`, qui reproduit
   EXACTEMENT le nommage de clé de supabase-js (`sb-<ref>-auth-token`, à
   vérifier dans le code de supabase-js installé, pas supposé) ;
   `bandeau(cible, modeVite)`.
2. **Modes Vite** : `pnpm dev` = `vite dev --port 3000 --mode development`,
   qui lit `.env.development.local` (URL locale + clé anon locale de
   `supabase status`). `pnpm dev:prod` = `vite dev --port 3001 --mode
   prodlocale`, qui lit `.env.prodlocale.local`. `.env` est vidé des clés
   prod (il ne sert plus) ; `pnpm build` lit les variables Vercel, comme
   aujourd'hui.
3. **Garde de démarrage** : en mode `development`, une cible `prod` ou
   `autre` → erreur claire à l'écran, sans aucune requête (« pnpm dev vise
   la base locale ; pour la prod, utilisez pnpm dev:prod »). C'est elle qui
   empêche la retombée silencieuse sur la prod.
4. **Bandeau** (B5) dans `__root.tsx`, au-dessus de `AppAuthGate` (donc
   aussi sur `/login`) ; rien en build de production.
5. **Ref de session** : `AuthContext` passe par `refSession` (fin du
   « 127 »).
6. **Preconnect** vers l'URL configurée, plus vers la prod en dur.
7. **`start.bat`** : si la stack ne répond pas sur 54321, `pnpm db:start`,
   puis `pnpm dev`.

## Implications propres

- Ports 3000 / 3001 = deux origines : sessions et cache séparés (D13).
- Le cache persisté local ne contient que des données fictives.

## Phase de test /martin

- Famille A : `cibleDe` sur URL arbitraires (fast-check : jamais `locale`
  pour un hôte `supabase.co`, jamais `prod` pour une IP de bouclage) ;
  `refSession` = la clé réellement écrite par supabase-js (test qui lit
  `localStorage` après un `signIn` simulé).
- Rendu : bandeau ambre / rouge / absent selon (cible, mode).
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
