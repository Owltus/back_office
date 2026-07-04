# Plan — Portage de repjour-okko-nantes dans l'onglet /repjour

## Contexte

L'application `repjour-okko-nantes` (dépôt GitHub Owltus, React 19 + react-router-dom v7 + Supabase) est un dashboard de reporting journalier pour l'hôtel OKKO Nantes Château : authentification à trois rôles, import de CSV du PMS, calcul de KPI (nuitées, TO, prix moyen, RevPAR, CA), suivi budgétaire, vues analytiques avec graphiques, et envoi de rapports par email. L'utilisateur veut la porter dans l'onglet `/repjour` du Back Office (aujourd'hui un simple `ComingSoon`), sur la stack maison : TanStack Start + React 19, TanStack Router (routing par fichier), Tailwind v4 et shadcn/ui, dans le thème sombre navy des autres pages — exactement la démarche des ports précédents (pdj, affiche).

**Contrainte absolue posée par l'utilisateur.** L'app standalone repjour continue d'exister et partage **le même projet Supabase** (`ozpavwghrmmkrnmkxodg`) que le port. Le Back Office ne doit donc **que consommer** ce backend au niveau applicatif (lectures, upserts, deletes soumis aux RLS existantes). Aucune étape n'exécute de migration, ne modifie le schéma, les policies RLS, les triggers ou les données de référence. Les fichiers `supabase/migrations/*.sql` du dépôt source sont **en lecture seule** : ils documentent ce que le port consomme, ils ne sont jamais rejoués. « Deux applications, un seul Supabase, ne pas faire de dinguerie. »

Le chantier est volumineux (8 pages routées, auth/rôles, import, graphiques, email, gestion des comptes). Il est découpé pour livrer de la valeur tôt — un socle *auth + dashboard en lecture seule branché sur le vrai Supabase* — avant les briques lourdes et risquées (écritures d'import, gestion admin, email).

## Angles à clarifier

Divergences remontées par le swarm d'exploration et la synthèse. Chacune porte une recommandation ; les décisions marquées **à trancher** conditionnent la forme du chantier et doivent être validées avant l'exécution.

- **D1 — SSR sur l'îlot /repjour (à trancher, décision racine).** L'app source est 100 % client-side (session en `localStorage`) ; TanStack Start fait du SSR par défaut, ce qui menace recharts/html2canvas (client-only) et rend la session invisible au serveur. **Option A retenue (recommandée)** : désactiver le SSR sur les routes `/repjour` (`ssr: false`). Supprime d'un coup les crashs SSR et le problème de session serveur, rapproche le port d'un copier-coller. Option B : garder le SSR et encapsuler chaque brique client-only dans des gardes de montage. Repli si le `ssr:false` par route n'est pas disponible dans la version épinglée : Option B. Étapes 1, 4.
- **D2 — Vérité d'auth.** **Option A retenue (recommandée)** : porter l'`AuthContext` client-side (session `localStorage` + rôle depuis `profiles`), garde côté composant. Cohérent avec D1=A. La sécurité réelle reste assurée par les RLS Supabase ; la garde client n'est qu'ergonomique. Étape 4.
- **D3 — Périmètre de l'auth (à trancher).** **Option A retenue (recommandée)** : l'auth ne vit que sous `/repjour` (îlot authentifié) ; les autres onglets restent inchangés (avatar « PL » en dur). Option B : auth au niveau du Back Office entier — hors mandat pour l'instant. Étape 4.
- **D4 — Navigation.** **Option A retenue (recommandée)** : supprimer la `Navigation` source, garder la `Navbar` du Back Office (item `/repjour` déjà présent) et ajouter une sous-navigation d'onglet propre à repjour, dont les liens sont gatés par rôle. Étape 5.
- **D5 — Namespace `/admin/*` cosmétique.** La source sert le même composant sur une route générique ET sur `/admin/*`, la différence se faisant par un flag `isAdmin`/`readOnly` lu dans le composant. **Option A retenue (recommandée)** : effondrer le namespace — une seule route par page, gating par rôle dans le composant. Étape 5.
- **D6 — Séquençage : MVP incrémental ou port intégral (à trancher, décision majeure).** **Option A retenue (recommandée)** : livrer par incréments — d'abord auth + dashboard lecture seule (étapes 1-5), puis analytique (6), puis import (7), gestion (8), email (9), comptes (10). Chaque incrément isole un type de risque et apporte de la valeur consultable tôt. Option B : tout porter d'un bloc (concentre auth + écritures + oklch sur une seule livraison sans point de validation). Voir « Ordre d'exécution ».
- **D7 — Table `postes` absente des migrations (à trancher).** `services/postes.ts` consomme une table `postes` qui n'est dans aucune migration versionnée (drift de schéma). **Option A retenue (recommandée)** : au moment de l'étape gestion, confirmer l'existence de la table sur la base live **en lecture seule** (`select ... limit 1`, jamais de `create`) ; si absente, différer la feature postes. Interdiction de la créer (contrainte « aucune migration »). Étape 8.
- **D8 — Couche données.** **Option A retenue (recommandée)** : porter les services en appels Supabase directs, fidèles à la source. Option B (réécrire au-dessus de TanStack Query) reportée : à envisager plus tard si le cache/invalidation devient utile. Étapes 5, 7, 8.
- **D9 — Parsing CSV.** **Option A retenue (recommandée)** : ajouter `papaparse` (+ `@types/papaparse`) comme le fait `lib/parse/*`, pour ne pas risquer une régression de la détection de format PMS. Le parseur maison `lib/pdj/csv.ts` reste réservé au PDJ. Étapes 1, 2.
- **D10 — Email (mailto + clipboard + html2canvas).** **Option A retenue (recommandée) mais en étape tardive (9)** : porter `email.ts` en **conservant impérativement** le `buildTableElement` autonome en HEX inline — html2canvas 1.4.1 ne sait pas parser les couleurs `oklch()` générées par Tailwind v4/shadcn, donc l'élément de capture ne doit **jamais** pointer sur le DOM shadcn, et l'image email reste en thème clair. Étape 9.
- **D11 — Client(s) Supabase.** **Option A retenue (recommandée)** : un seul client (`lib/supabase.ts` enrichi de `auth:{persistSession,autoRefreshToken,detectSessionInUrl}`). Le second client `supabase-signup.ts` (`persistSession:false`, `storageKey` distinct) n'est créé qu'à l'étape comptes (10), et uniquement si elle est incluse. Étapes 1, 10.
- **D12 — Impact `.env` sur les autres onglets (à trancher).** Le client Supabase du Back Office est aujourd'hui décoratif (fallback localhost, seul `UserMenu.signOut` l'utilise). Renseigner l'URL partagée active un vrai backend pour tout le Back Office. **Option A retenue (recommandée)** : un seul client partagé — le seul effet réel sur les autres onglets est que `UserMenu.signOut` devient fonctionnel, sans impact sur parking/pdj/affiche (qui n'appellent pas Supabase). Option B : client dédié repjour pour cloisonner. Étape 1.
- **D13 — Bugs préexistants de la source.** Trois défauts établis : race de l'`AuthContext` (profil non attendu avant `setLoading(false)`), `ProtectedRoute` qui laisse passer si `role===null` (flash de contenu protégé), et trois définitions divergentes de `ROLE_HOME`. **Option A retenue (recommandée)** : les corriger pendant le port (centraliser un unique `ROLE_HOME`, attendre le profil, bloquer sur `role===null`). Écart de comportement assumé vs la source standalone. Étape 4.
- **D14 — Composant KPITable.** Tableau dense 6×6 avec double-cellule responsive (`hidden sm:inline` / `sm:hidden`), identifié comme le plus délicat. **Option A retenue (recommandée)** : porter le `<table>` HTML brut à l'identique (préserve la mécanique responsive), restylé avec les tokens dark. Un `ui/table.tsx` shadcn est ajouté pour les autres tableaux moins subtils. Étapes 3, 5.
- **D15 — Thème.** **Option A retenue (recommandée)** : remapper repjour vers le dark navy shadcn (cohérence visuelle du Back Office). L'image email reste en thème clair (D10). Étapes 3, et chaque étape de composant.
- **D16 — `TOTAL_ROOMS=80` / `VAT_RATE=10` en dur.** **Option A retenue (recommandée)** : garder les constantes en dur (fidèle, hôtel unique, cohérent avec `hotel_config`). Étape 2.
- **D17 — `deleteYearBudget` sans garde client.** **Option A retenue (recommandée)** : ajouter une garde `assertWriteRole` par cohérence avec les autres deletes (defense in depth). La RLS admin reste la protection réelle. Étape 8.
- **D18 — Dépendances TanStack en `latest`.** **Option A retenue (recommandée)** : épingler les versions au début du chantier pour un build reproductible pendant l'ajout de recharts/papaparse/html2canvas. Étape 1.
- **D19 — Structure des sous-routes.** **Option A retenue (recommandée)** : répertoire `src/routes/repjour/` avec `repjour.tsx` en layout `Outlet` et des fichiers enfants. Étape 5.
- **D20 — Upload Storage `csv-archive`.** **Option A retenue (recommandée)** : porter l'upload du CSV (écriture idempotente `upsert:true` vers un bucket privé existant) avec l'import. Étape 7.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-socle-deps-env-supabase.md](./1-socle-deps-env-supabase.md) | Socle | — | P0 | 45 min | deps ajoutées, `.env` branché, client Supabase auth |  |
| 2 | [2-metier-pur.md](./2-metier-pur.md) | Métier pur | 1 | P0 | 2h | `lib/repjour/{calc,parse,constants,format,password}` |  |
| 3 | [3-fondations-ui-styles.md](./3-fondations-ui-styles.md) | Fondations UI | — | P0 | 1h | `ui/table`, `ui/alert`, `styles/repjour.css` |  |
| 4 | [4-auth-contexte-garde-login.md](./4-auth-contexte-garde-login.md) | Auth | 1 | P0 | 2h30 | AuthContext, ProtectedRoute, `/repjour/login` | ⚠ |
| 5 | [5-dashboard-lecture.md](./5-dashboard-lecture.md) | Dashboard (MVP) | 2, 3, 4 | P0 | 3h | layout `Outlet`, sous-nav, dashboard lecture branché | ⚠ |
| 6 | [6-analytique-graphiques.md](./6-analytique-graphiques.md) | Analytique | 5 | P1 | 2h30 | pages analytique + 4 graphiques recharts (lecture) |  |
| 7 | [7-import-csv.md](./7-import-csv.md) | Import | 4, 5 | P1 | 2h30 | orchestrateur d'import (upserts + Storage) | ⚠ |
| 8 | [8-gestion-donnees-budget.md](./8-gestion-donnees-budget.md) | Gestion admin | 4, 5 | P1 | 3h | onglets Données + Budget, éditions/suppressions | ⚠ |
| 9 | [9-email-destinataires.md](./9-email-destinataires.md) | Email | 8 | P2 | 2h | `email.ts` (HEX autonome), RecipientsModal | ⚠ |
| 10 | [10-comptes.md](./10-comptes.md) | Comptes | 4, 9 | P2 | 2h | AccountsPage, 2ᵉ client signup, RPC mot de passe | ⚠ |
| 11 | [11-audit-validation.md](./11-audit-validation.md) | Validation | 1–10 | P0 | 1h30 | audit paths, non-régression standalone, aucune migration | ⚠ |

## Ordre d'exécution

Le chantier suit l'axe des ports précédents : **métier pur d'abord, câblage route en fin**, adapté à une app multi-pages avec auth.

- **Sprint fondations (parallélisable)** : étapes 1, 2 et 3 touchent des fichiers disjoints (deps/env/client, `lib/repjour/` pur, primitives UI/styles). L'étape 2 dépend de 1 pour `papaparse`.
- **MVP livrable (recommandation D6)** : étapes **4 → 5**. À l'issue de l'étape 5, un utilisateur peut se connecter et consulter le dashboard journalier branché sur le vrai Supabase, sans qu'aucune écriture n'existe encore. **Premier point de valeur et de validation.**
- **Incréments suivants** : 6 (analytique, lecture), puis 7 (import, première écriture ⚠), 8 (gestion, suppressions ⚠), 9 (email ⚠), 10 (comptes ⚠, optionnelle selon périmètre).
- **Clôture** : étape 11 (audit global ⚠), qui vérifie explicitement la contrainte « deux apps, un Supabase, aucune migration » et la non-régression de l'app standalone.

Décision à acter **avant l'étape 1** : D1 (SSR on/off), car elle recalibre l'effort de presque toutes les étapes suivantes.

## Architecture cible

```
src/
├── components/repjour/
│   ├── AuthContext.tsx          ← provider + useAuth (React, client-only)
│   ├── ProtectedRoute.tsx       ← garde par rôle
│   ├── RepjourNav.tsx           ← sous-navigation de l'onglet (liens gatés par rôle)
│   ├── KPITable.tsx SummaryCards.tsx AlertBanner.tsx KPIDetailPanel.tsx
│   ├── PasswordInput.tsx RecipientsModal.tsx
│   ├── charts/                  ← LineChart recharts (montés client-only)
│   └── boards/                  ← Dashboard, Analytique, Import, Gestion, Comptes, Profil
├── lib/repjour/
│   ├── calc/{kpi,ecart,validate}.ts        ← fonctions pures (sans React/Tailwind)
│   ├── parse/{comparison,forecast,detect,date}.ts  ← dépend papaparse
│   ├── services/{daily,data,recipients,postes}.ts  ← accès Supabase direct
│   ├── import/orchestrator.ts   ← upserts + upload Storage csv-archive
│   ├── email.ts                 ← DOM + html2canvas HEX autonome + mailto
│   ├── constants.ts format.ts password.ts roles.ts   ← roles.ts = ROLE_HOME unique
│   └── supabase-signup.ts       ← 2ᵉ client (conditionnel, étape 10)
├── lib/supabase.ts              ← enrichi : auth:{persistSession,autoRefreshToken,detectSessionInUrl}
├── routes/repjour.tsx           ← layout : AuthProvider + RepjourNav + Outlet (ssr:false)
├── routes/repjour/
│   ├── index.tsx login.tsx import.tsx gestion.tsx comptes.tsx profil.tsx
│   └── analytique.index.tsx  analytique.$year.$month.tsx
├── components/ui/table.tsx alert.tsx   ← ajouts shadcn
└── styles/repjour.css           ← @import depuis styles.css, préfixe .repjour-*
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Config / deps | `package.json`, `.env`, `.env.example`, `src/lib/supabase.ts` | — |
| Métier pur | — | `lib/repjour/calc/{kpi,ecart,validate}.ts`, `parse/{comparison,forecast,detect,date}.ts`, `constants.ts`, `format.ts`, `password.ts`, `roles.ts` |
| Services / intégration | — | `lib/repjour/services/{daily,data,recipients,postes}.ts`, `import/orchestrator.ts`, `email.ts`, `supabase-signup.ts` |
| Composants | `src/components/Navbar.tsx` | `components/repjour/{AuthContext,ProtectedRoute,RepjourNav,KPITable,SummaryCards,AlertBanner,KPIDetailPanel,PasswordInput,RecipientsModal}.tsx`, `charts/*`, `boards/*` |
| UI shadcn | — | `components/ui/table.tsx`, `components/ui/alert.tsx` |
| Routes | `src/routes/repjour.tsx` | `routes/repjour/{index,login,import,gestion,comptes,profil,analytique.index,analytique.$year.$month}.tsx` |
| Styles | `src/styles.css` | `src/styles/repjour.css` |
| **Total** | **~7 modifiés** | **~35 nouveaux** |
