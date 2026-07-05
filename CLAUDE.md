# Back Office — contexte projet

Application web interne de gestion opérationnelle hôtelière (OKKO Nantes).
Onglets : **RepJour** (reporting journalier, la seule feature aboutie),
Parking, PDJ, Affichage, Rapprochement/Caisse (à venir).

## Stack

- **TanStack Start** (SSR) + **TanStack Router** (routing par fichier) + TanStack Query
- **React 19**, TypeScript, **Tailwind CSS v4**, **shadcn/ui** (thème dark navy forcé sur `<html>`)
- **Supabase** (Auth + PostgreSQL + RLS + Storage)
- Recharts, papaparse, html2canvas (pour l'onglet RepJour)

## ⚠️ CONTRAINTE CRITIQUE — backend Supabase PARTAGÉ, LECTURE SEULE

Le projet Supabase est **partagé** avec une autre application en production
(l'app standalone `repjour-okko-nantes`). **Toutes les tables sont à traiter en
LECTURE SEULE** côté outillage / assistant IA :
`profiles`, `daily_reports`, `forecast_days`, `budget`, `email_recipients`,
`hotel_config`, `audit_log`.

- **Aucune écriture directe** (INSERT/UPDATE/DELETE), aucun DDL, aucune migration,
  aucun seed contre cette base.
- Les fonctionnalités d'écriture de l'app (import CSV, gestion, comptes) ne sont
  testées QUE par l'utilisateur via l'app avec un vrai compte — **jamais**
  exécutées automatiquement contre la prod.
- Toute écriture éventuelle exige une **demande + confirmation explicite** de
  l'utilisateur, à chaque fois. (Transition assumée : ce n'est pas la cible finale.)

## Clés Supabase (`.env`, jamais committé, gitignoré)

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` : **publiques** (embarquées dans le
  bundle navigateur, protégées par les RLS).
- `SUPABASE_SERVICE_ROLE_KEY` : **SECRÈTE**, contourne toute la RLS (accès total).
  - **Jamais** de préfixe `VITE_` (sinon fuite dans le bundle = faille critique).
  - **Jamais** committée, **jamais** en code client.
  - Usage autorisé : **inspection LECTURE SEULE** en local, ou fonction serveur
    (Edge Function). Pour supprimer un `auth.users` (suppression totale d'un
    compte) → Edge Function serveur, pas le client.

## Authentification (applicative, globale)

- `AuthProvider` monté à la racine (`src/routes/__root.tsx`) + garde globale
  `src/components/auth/AppAuthGate.tsx` : toute page exige une session, sinon
  redirection vers `/login`. Auth 100 % client (localStorage) → l'app est de fait
  rendue côté client (spinner puis contenu ; le SSR ne rend que le spinner).
- Rôles : `utilisateur` (lecture), `super_utilisateur` (+ import), `admin`
  (+ gestion, comptes). Gating par rôle via `components/repjour/ProtectedRoute.tsx`.
  **La sécurité réelle des données = RLS Supabase** ; la garde UI est ergonomique.
- Menu utilisateur (dans la Navbar) : Profil (`/profil`), Gestion budgétaire
  (`/gestion`), Gestion des comptes (`/comptes`, admin), Déconnexion.

## Architecture / conventions

- **Métier pur** (sans React ni Tailwind) → `src/lib/<domaine>/`
  (`lib/repjour/{calc,parse,services,import,constants,format,...}`).
- Composants d'une feature → `src/components/<feature>/` ; auth →
  `src/components/auth/` ; réutilisables transverses → `src/components/shared/` ;
  primitives shadcn (vendored, **jamais retouchées à la main**) → `src/components/ui/`.
- Intégrations tierces → `src/lib/` (`supabase.ts`, `query.ts`). Styles par feature
  → `src/styles/<feature>.css` (préfixe `.<feature>-*`), chaînés par `@import`
  depuis `src/styles.css`.
- **Named exports uniquement** (jamais `export default`), alias `#/` **avec
  extension explicite** (`.ts` / `.tsx`), simple quotes, pas de point-virgule final.
- `/repjour` est en **`ssr: false`** (recharts/html2canvas client-only).
  `/` redirige vers `/repjour` (pas de page Dashboard pour l'instant).

## Faits base de données (vérifiés en lecture)

- Tables : profiles, daily_reports, forecast_days, budget, email_recipients,
  hotel_config, audit_log.
- Fonctions RPC déployées : `get_user_role`, `admin_update_password`.
- Table **`postes` : n'existe PAS** → feature volontairement différée, non portée.
- Hôtel unique : **80 chambres, TVA 10 %** (constantes en dur dans
  `lib/repjour/constants.ts`).

## Commandes

- `pnpm dev` (port 3000) · `pnpm build` · `pnpm generate-routes` (après
  ajout/suppression de route) · `pnpm lint` · `pnpm check` (format).
- shadcn : `pnpm dlx shadcn@latest add <composant>`.

## Plans

Les chantiers sont documentés dans `plan/` (notamment `plan/repjour-portage/`
pour le portage de l'app repjour dans l'onglet, et
`plan/organisation-arborescence/` pour les conventions d'arborescence).
