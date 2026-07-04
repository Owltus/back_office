# Back Office

Application web interne de gestion opérationnelle hôtelière : suivi du parking, préparation du petit-déjeuner (PDJ), génération d'affiches A3 bilingues FR/EN, rapports de production, répartition journalière et caisse.

## Pages

| Page | Route | État |
| --- | --- | --- |
| Dashboard | `/` | À venir |
| RepJour | `/repjour` | À venir |
| Parking | `/parking` | ✅ Disponible |
| Rapro | `/rapro` | À venir |
| Affichage | `/affichage` | ✅ Disponible — générateur d'affiches A3 bilingues FR/EN |
| PDJ | `/pdj` | ✅ Disponible |
| Caisse | `/caisse` | À venir |

## Stack technique

- [TanStack Start](https://tanstack.com/start) + [TanStack Router](https://tanstack.com/router) (routing fichier)
- [React 19](https://react.dev/)
- [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- [Supabase](https://supabase.com/) (base de données et temps réel)
- [Vite](https://vite.dev/) + [Vitest](https://vitest.dev/)

## Démarrage

Prérequis : [Node.js](https://nodejs.org/) et [pnpm](https://pnpm.io/).

```bash
pnpm install
pnpm dev
```

L'application tourne sur [http://localhost:3000](http://localhost:3000). Sous Windows, `start.bat` lance le serveur de dev directement.

### Variables d'environnement

Copier `.env.example` en `.env` et renseigner les clés du projet Supabase (Project Settings → API dans le dashboard Supabase) :

```bash
VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_ANON_KEY=votre-cle-anon-publique
```

## Scripts

| Commande | Description |
| --- | --- |
| `pnpm dev` | Serveur de développement (port 3000) |
| `pnpm build` | Build de production |
| `pnpm preview` | Prévisualisation du build |
| `pnpm test` | Tests (Vitest) |
| `pnpm lint` | Lint (ESLint) |
| `pnpm format` | Formatage (Prettier + ESLint --fix) |
| `pnpm check` | Vérification du formatage |
| `pnpm generate-routes` | Régénère `src/routeTree.gen.ts` (TanStack Router) |

## Structure du projet

```
src/
├── components/       # Composants React (Navbar, parking/, pdj/, affiche/, ui/)
├── integrations/     # Providers (TanStack Query)
├── lib/              # Client Supabase, stores, utilitaires, poster/
├── routes/           # Pages (routing par fichier)
└── styles.css        # Styles globaux (Tailwind v4)
```
