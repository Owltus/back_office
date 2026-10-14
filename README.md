# Back Office

Application web interne de gestion opérationnelle hôtelière : suivi du parking, préparation du petit-déjeuner (PDJ), génération d'affiches A3 bilingues FR/EN, rapports de production, répartition journalière et caisse.

## Pages

| Page | Route | État |
| --- | --- | --- |
| Dashboard | `/` | À venir |
| RepJour | `/repjour` | À venir |
| Parking | `/parking` | ✅ Disponible |
| Rapprochement | `/rapro` | À venir |
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

Le développement se fait sur une base Supabase **locale** (Docker), jamais sur la prod.

Prérequis : [Node.js](https://nodejs.org/), [pnpm](https://pnpm.io/), [Docker Desktop](https://www.docker.com/products/docker-desktop/) démarré, [Supabase CLI](https://supabase.com/docs/guides/cli) ≥ 2.120.

```bash
pnpm install
# .env.development.local : copier le bloc DÉVELOPPEMENT de .env.example
# supabase/functions/.env : copier supabase/functions/.env.example
pnpm db:start     # la base locale (premier lancement : quelques minutes)
pnpm db:reset     # migrations + données fictives
pnpm dev          # http://localhost:3000, bandeau « DEV · base locale »
```

Sous Windows, **`start.bat` fait tout** : il lance Docker Desktop, la base locale et ses fonctions, propose de récupérer les données fraîches de la prod (O/N, oui par défaut au bout de 10 s), puis lance l'app et ouvre le navigateur. Comptes de test : `admin@`, `gestion@`, `ecriture@`, `lecture@`, `aucun@`, `reception@exemple.test`, mot de passe `DevLocal2026x`.

Outils locaux : Studio [http://127.0.0.1:54323](http://127.0.0.1:54323) (la base à la souris), Mailpit [http://127.0.0.1:54324](http://127.0.0.1:54324) (tous les e-mails envoyés en local).

### Travailler

| Je veux… | Commande |
| --- | --- |
| Arrêter / relancer la base | `pnpm db:stop` / `pnpm db:start` (les données restent) |
| Tout remettre à zéro (données fictives) | `pnpm db:reset` |
| Voir les **vraies** données (noms de clients remplacés) | `start.bat`, répondre O (la prod est seulement lue ; la base locale est remplacée ; il faut un arbre git propre, sinon la copie est sautée) |
| Changer le schéma | `supabase migration new <nom>`, ou essais dans Studio puis `supabase db diff --local -f <nom>` ; `pnpm db:reset` pour vérifier |
| Essayer l'import nocturne | `pnpm fn:import-essai` |
| **Mettre la prod à jour** | `livrer.bat` (résumé, puis taper `LIVRER`) ; `livrer.bat --essai` pour voir sans envoyer |

### Ce qui part en prod, ce qui n'y part jamais

| Développé en local | En prod ? |
| --- | --- |
| Code de l'app | Oui (`livrer.bat` → Vercel) |
| Schéma : tables, policies, fonctions SQL, buckets | Oui (migrations) |
| Edge Functions modifiées | Oui |
| Données (fictives, copiées, saisies en local) | **Jamais** : le vrai contenu se saisit dans l'app en ligne |
| Réglages Auth de `config.toml`, secrets, Worker Cloudflare | Non : signalés par `livrer.bat`, faits à la main |

Une migration qui **retire** quelque chose (`drop`, `rename`) demande une seconde confirmation : pendant une ou deux minutes, l'ancien code tourne encore sur la nouvelle base. Ajouter d'abord, retirer à la livraison suivante.

Première fois seulement : `livrer.bat --amorcer` (inscrit en prod les migrations de départ, sans rien rejouer). Sur un autre poste, ou après une livraison interrompue : `livrer.bat --reprendre-instantane` (montre l'écart, puis reprend le schéma actuel de la prod comme référence).

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
| `pnpm db:start` / `db:stop` / `db:reset` / `db:statut` | Base Supabase locale |
| `pnpm db:seed:generer` | Régénère `supabase/seed.sql` (fenêtre centrée sur aujourd'hui) |
| `pnpm fn:import-essai` | Poste les e-mails d'import fictifs aux fonctions locales |

## Structure du projet

```
src/
├── components/       # Composants React (Navbar, parking/, pdj/, affiche/, ui/)
├── integrations/     # Providers (TanStack Query)
├── lib/              # Client Supabase, stores, utilitaires, poster/
├── routes/           # Pages (routing par fichier)
└── styles.css        # Styles globaux (Tailwind v4)
```
