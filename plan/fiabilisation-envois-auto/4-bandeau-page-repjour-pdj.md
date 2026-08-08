# Étape 4 — Bandeau « pas encore envoyé » (page RepJour, + PDJ)

## Objectif

Rendre VISIBLE dans l'app tout envoi non fait : un bandeau d'information s'affiche sur
la page RepJour quand le rapport du jour est là mais pas envoyé, quelle qu'en soit la
raison (forecast planté en milieu de mois, 5 échecs Resend, envoi jamais tenté…). Il se
retire dès l'envoi (auto ou manuel). C'est le filet qui remplace l'alerte e-mail.

## Contexte

Le marqueur d'envoi est en base (étape 1 : `daily_reports.auto_sent_at` posé par l'auto
ET le manuel ; PDJ : ligne `pdj_auto_send_log`). Le client lit ce marqueur pour décider
d'afficher ou non le bandeau. Aucune donnée nouvelle côté serveur. NB : avec la règle de
l'étape 2, le dernier jour du mois part tout seul → il ne déclenchera normalement PAS de
bandeau ; le bandeau reste le filet pour les cas anormaux.

## Fichier(s) impacté(s)

- `src/components/shared/SendStatusBanner.tsx` (nouveau, réutilisable)
- `src/components/repjour/boards/DashboardBoard.tsx`
- `src/components/pdj/BreakfastBoard.tsx`
- éventuel ajustement de la lecture (inclure `auto_sent_at` dans la requête du rapport)

## Travail à réaliser

### 1. Déterminer l'état d'envoi côté client

Pour le rapport du **cycle courant** affiché :
- RepJour : le rapport existe (données présentes) ET `auto_sent_at IS NULL` → « pas envoyé ».
  S'assurer que la requête qui charge le rapport ramène bien `auto_sent_at`.
- PDJ : des lignes `pdj_breakfasts` existent pour le jour ET aucune ligne
  `pdj_auto_send_log` pour ce jour → « pas envoyé ».
Ne montrer le bandeau que sur le **jour courant** (pas l'historique) pour éviter le bruit.

### 2. Composant `SendStatusBanner`

Bandeau discret (style shadcn/ui, cohérent dark navy) : message court + action.
- Message : « Le rapport du [date] n'a pas encore été envoyé. »
- Action : bouton « Envoyer » (réutilise le flux d'envoi existant, réservé grade admin).
- Se retire automatiquement quand le marqueur passe à « envoyé » (invalidation TanStack
  Query après l'envoi + realtime déjà en place sur ces boards).
- Respecter la convention UX (messages courts, pas de « tout va bien » : le bandeau
  n'apparait QUE s'il y a un souci).

### 3. Intégrer dans les deux boards

- `DashboardBoard` (RepJour) : afficher `SendStatusBanner` en haut quand « pas envoyé ».
- `BreakfastBoard` (PDJ) : idem (à confirmer avec l'utilisateur — cf. angle à clarifier).
- Gating : bandeau + action visibles au grade admin (seul à pouvoir envoyer) ; pour les
  autres rôles, un simple texte informatif sans bouton (ou rien — à trancher).

## Ordre d'exécution

1. Vérifier/étendre la requête pour ramener le marqueur d'envoi.
2. Créer `SendStatusBanner`.
3. Brancher dans `DashboardBoard`, puis `BreakfastBoard`.

## Critère de validation

- `npx tsc --noEmit` OK ; `pnpm build` OK.
- Raisonnement : rapport présent + non envoyé → bandeau ; après clic Envoyer (ou envoi
  auto) → marqueur posé → bandeau disparait au refetch/realtime.
- Respect des conventions (named exports, alias #/ avec extension, pas de default export,
  lecture via useQuery).
