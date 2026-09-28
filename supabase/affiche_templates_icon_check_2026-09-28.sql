-- =============================================================================
-- affiche_templates — contrainte CHECK sur `icon` (2026-09-28)
--
-- ⚠ NON APPLIQUÉ. À jouer par l'utilisateur (SQL Editor) ou par
-- `supabase db query --linked -f` après relecture. Rejouable (idempotent).
--
-- SYMPTÔME : une valeur d'`icon` qui n'est pas une icône du registre de l'app
-- faisait planter la page /affichage. Cas démontré : « constructor » —
-- `ICONS['constructor']` rendait la fonction `Object` héritée du prototype, dont
-- `.svg` vaut `undefined`, et l'aperçu appelait `.replace` dessus.
--
-- CAUSE : la colonne `icon` est un `text` libre (défaut 'alert'), sans aucune
-- contrainte, alors que l'app ne sait afficher que les clés de `ICONS`
-- (`src/lib/poster/icons.ts`). Tout compte ayant le droit d'écriture sur la
-- page pouvait y écrire n'importe quoi par l'API.
--
-- CORRECTIF : côté app, `getIconSvg`/`getIconName` passent par `Object.hasOwn`
-- et replient sur « Alerte » (commit fix(affichage) du même jour) — la page ne
-- plante plus, quelle que soit la base. Ce script ferme la porte côté base :
-- `icon` doit appartenir à la liste des clés du registre.
--
-- INNOCUITÉ :
--   - La liste ci-dessous est la liste EXACTE des clés de `ICONS` au
--     2026-09-28 (39 clés, `none` compris). C'est tout ce que l'app écrit :
--     `selectedIcon` vient du sélecteur (`getAvailableIcons()` = ces clés) ou
--     du défaut du store (`'none'`, `lib/afficheStore.ts`,
--     `DEFAULTS.icon` de `lib/poster/config.ts`) ; le défaut de colonne
--     (`'alert'`) et les modèles d'amorçage (`coffee`, `elevator`, `droplet`,
--     `power_outage`, `fire_alarm`, `wet_paint`, `toilet_out`) y figurent.
--   - Aucune ligne n'est modifiée. La contrainte est posée `not valid` (effet
--     immédiat sur les NOUVELLES écritures, sans relire la table), puis
--     VALIDÉE : si une ligne existante n'est pas conforme, la validation
--     échoue, toute la transaction est annulée, et l'étape (0) dit laquelle.
--   - ⚠ AJOUTER UNE ICÔNE À `ICONS` EXIGE DÉSORMAIS DE REJOUER CE SCRIPT avec
--     la nouvelle clé, AVANT de déployer l'app — sinon l'enregistrement d'un
--     modèle portant cette icône sera refusé (erreur 23514, affichée par
--     l'app sous le bouton, jamais silencieuse).
--   - DDL sur une table exposée : PostgREST recharge son cache de schéma
--     (quelques secondes). Jouer en dehors des heures d'import (02h-06h).
-- =============================================================================

begin;

-- (0) Diagnostic, lecture seule : lignes qui violeraient la contrainte.
-- Doit rendre ZÉRO ligne. Sinon, corriger ces lignes AVANT (décision
-- utilisateur : pas de réécriture de données par ce script).
select id, name, icon
from public.affiche_templates
where icon not in (
  'none', 'alert', 'droplet', 'zap', 'key', 'fire_alarm', 'power_outage',
  'wet_paint', 'toilet_out', 'phone_out', 'coffee', 'iron', 'kettle',
  'no_smoking', 'door_closed', 'fire_extinguisher', 'flame', 'flood',
  'elevator', 'cleaning', 'tv', 'table', 'dumbbell', 'stairs', 'parking',
  'bus', 'bike', 'briefcase', 'calendar', 'wine', 'glass_water', 'shower',
  'tea', 'martini', 'fork_knife', 'cup_saucer', 'bottle', 'salad',
  'concierge_bell'
);

-- (1) Pose (ou repose) de la contrainte.
alter table public.affiche_templates
  drop constraint if exists affiche_templates_icon_check;

alter table public.affiche_templates
  add constraint affiche_templates_icon_check check (icon in (
    'none', 'alert', 'droplet', 'zap', 'key', 'fire_alarm', 'power_outage',
    'wet_paint', 'toilet_out', 'phone_out', 'coffee', 'iron', 'kettle',
    'no_smoking', 'door_closed', 'fire_extinguisher', 'flame', 'flood',
    'elevator', 'cleaning', 'tv', 'table', 'dumbbell', 'stairs', 'parking',
    'bus', 'bike', 'briefcase', 'calendar', 'wine', 'glass_water', 'shower',
    'tea', 'martini', 'fork_knife', 'cup_saucer', 'bottle', 'salad',
    'concierge_bell'
  )) not valid;

-- (2) Validation des lignes existantes (échoue et annule tout si l'étape 0
-- a rendu des lignes).
alter table public.affiche_templates
  validate constraint affiche_templates_icon_check;

commit;

-- (3) Contrôle, lecture seule : la contrainte existe et est validée.
select conname, convalidated, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.affiche_templates'::regclass
  and conname = 'affiche_templates_icon_check';
