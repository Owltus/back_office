# Étape 1 — Socle : dépendances, environnement, client Supabase

## Objectif

Poser le terrain du port sans encore consommer de données : ajouter les dépendances manquantes, brancher le Back Office sur le projet Supabase partagé via `.env`, et enrichir le client Supabase avec les options d'authentification nécessaires à repjour.

## Contexte

Le client `src/lib/supabase.ts` du Back Office est aujourd'hui décoratif (fallback `localhost`, aucune option d'auth, seul `UserMenu.signOut` l'utilise). Le port a besoin d'une vraie session persistée. Trois dépendances de la source manquent : `recharts`, `papaparse`, `html2canvas`. Contrainte rappelée : brancher l'URL ne doit rien exécuter côté base — c'est une simple configuration client.

## Fichier(s) impacté(s)

- `package.json` (modification : ajout de dépendances, épinglage des versions TanStack — D18)
- `.env` (modification : URL + clé anon du projet partagé — non versionné, déjà dans `.gitignore`)
- `.env.example` (modification : documenter les variables sans valeurs réelles)
- `src/lib/supabase.ts` (modification : options d'auth — D11, D12)

## Travail à réaliser

### 1. Dépendances

Ajouter `recharts`, `papaparse`, `html2canvas` et `@types/papaparse`. Épingler au passage les paquets TanStack actuellement en `latest` sur leur version installée résolue (lire `pnpm-lock.yaml`) pour un build reproductible pendant le chantier.

```bash
pnpm add recharts papaparse html2canvas
pnpm add -D @types/papaparse
```

### 2. Variables d'environnement

Renseigner `.env` (jamais commité) avec les identifiants fournis par l'utilisateur :

```bash
VITE_SUPABASE_URL=https://ozpavwghrmmkrnmkxodg.supabase.co
VITE_SUPABASE_ANON_KEY=<clé anon fournie>
```

Mettre à jour `.env.example` pour documenter ces variables (placeholders, aucune valeur réelle).

### 3. Client Supabase avec auth

Enrichir `createClient` pour supporter la session persistée de repjour, sans changer la façon dont les clés sont lues :

```ts
export const supabase = createClient(
  supabaseUrl ?? 'http://localhost:54321',
  supabaseAnonKey ?? 'public-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
```

Ne pas créer le second client (`supabase-signup.ts`) ici : il est réservé à l'étape 10 (comptes) avec un `storageKey` distinct.

## Ordre d'exécution

1. Ajouter les dépendances et épingler les versions.
2. Renseigner `.env` et `.env.example`.
3. Enrichir `src/lib/supabase.ts`.
4. Vérifier le démarrage.

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- `pnpm dev` démarre sans warning Supabase (les clés sont présentes) ; le warning « VITE_SUPABASE_* manquantes » disparaît.
- Aucun appel réseau vers la base au démarrage (le client est instancié mais aucune requête n'est encore émise).
- `git status` confirme que `.env` n'est pas suivi.
