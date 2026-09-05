# Étape 9 — Validation globale avec panne simulée

## Objectif

Prouver, dans le navigateur base bloquée puis débloquée, que l'application
dégrade proprement (bandeau, backoff, aucune tempête), reprend seule, et
que rien n'a régressé : éjection d'un compte supprimé, mises à jour
optimistes parking, valeurs de la bande RepJour, contrôles SQL. Puis
commit (sans push, sauf demande explicite).

## Contexte

Aucun test de composant n'existe (vitest sans jsdom) : les preuves sont
des observations reproductibles, listées ici pour être rejouées à chaque
retouche des étapes 1 à 3.

## Fichier(s) impacté(s)

- Aucun fichier source : les corrections éventuelles sont renvoyées à
  l'étape concernée.
- `CLAUDE.md` (modifié) : section « Performance / chargement », ajouter les
  règles issues du chantier (timeout global, disjoncteur, jamais de
  refetch sur `TOKEN_REFRESHED`, clés stables, `select` explicite).

## Travail à réaliser

### 1. Contrôles automatiques

```bash
npx tsc --noEmit
npx vitest run
pnpm build
supabase db query --linked -f supabase/verif_perf.sql
supabase db query --linked -f supabase/verif_complet.sql
```

### 2. Panne simulée (DevTools, Réseau, « Block request URL » sur
`*.supabase.co`)

Sur chaque page `/repjour`, `/parking`, `/pdj`, `/rapro`, `/caisse` :

- bandeau visible en moins de 21 s, compte à rebours décroissant ;
- onglet Réseau : intervalles entre deux requêtes de même endpoint
  croissants (environ 1, 2, 4… jusqu'à 30 s, avec jitter), jamais deux
  `profiles` ou deux `user_page_permissions` en vol simultanément ;
- jamais « Aucune page accessible » ;
- bouton Réessayer : une salve puis retour au backoff ;
- déblocage : bandeau disparu en moins de 30 s, données rafraîchies, aucun
  rechargement de page, `localStorage` du profil et des droits intact.

Variante jeton expiré (modifier `expires_at` dans
`localStorage['sb-…-auth-token']` avant blocage) : l'utilisateur reste sur
sa page ; au déblocage, `TOKEN_REFRESHED` puis relecture des droits.

Variante `/login` : avec blocage, la page de connexion s'affiche en moins
de 3 s (beforeLoad borné) et le bouton Se connecter renvoie un message
d'erreur court, pas une attente infinie.

### 3. Éjection préservée

Depuis `/comptes` (navigateur A, admin), supprimer un compte de test
connecté dans le navigateur B (onglet visible) : en moins de 3 min, B est
renvoyé sur `/login`. Recréer le compte de test ensuite ou le laisser
supprimé (choix utilisateur ; ne rien laisser en base qui n'existait pas).

### 4. Parking

Deux onglets : créer, déplacer, copier, Ctrl+Z, Ctrl+Y, retour d'onglet,
hors ligne puis en ligne. Aucune ligne perdue, aucune ligne dupliquée, une
seule requête `parking_reservations` par retour d'onglet.

### 5. RepJour

Trois dates (passée, hier, future) : valeurs des 12 tuiles identiques à un
relevé fait AVANT le chantier (le relever à l'étape 5 avant modification).
Un import Comparison en mode manuel = une invalidation.

### 6. Mesure en base, 24 h après mise en production

```sql
select calls, round(mean_exec_time::numeric,1) as mean_ms,
       left(regexp_replace(query, '\s+', ' ', 'g'), 120) as q
from extensions.pg_stat_statements
where query ilike '%profiles%id%' or query ilike '%user_page_permissions%'
   or query ilike '%pdj_service_dates%' or query ilike '%pdj_daily_agg%service_date%'
order by calls desc limit 10;
```

Attendu : le rythme de nouvelles lectures `profiles` divisé par au moins
deux par rapport à la veille (comparer les deltas de `calls`),
`pdj_service_dates` présent, `pdj_daily_agg … service_date` sans nouvel
appel.

### 7. Commit

Un commit par étape déjà fait ; commit final de `CLAUDE.md`. Pas de push
sans demande explicite (règle utilisateur).

## Critère de validation

- Tous les contrôles automatiques verts, `verif_perf.sql` et
  `verif_complet.sql` OK.
- Les scénarios 2 à 5 observés et notés dans le message de fin de chantier,
  avec les écarts éventuels.
- Mémoire projet mise à jour (skill Bob, chantier terminé, mesures avant/
  après).

## Contrôle qualité (revue)

Étape critique (validation globale de fin de chantier). `/borg` n'étant pas
installé, revue manuelle ciblée : (1) aucun `console.log` ni exposition
`window.*` de débogage laissés ; (2) aucun fichier SQL joué qui ne soit
commité ; (3) `git status` propre ; (4) aucune règle de sécurité (RLS,
anti-escalade, éjection) affaiblie, contrôle `verif_securite_2026-08-05.sql`
rejoué en bonus.
