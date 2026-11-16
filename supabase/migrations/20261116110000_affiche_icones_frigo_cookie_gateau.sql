-- =============================================================================
-- Affichage : trois icônes ajoutées (demande utilisateur du 2026-11-16) :
-- réfrigérateur, cookie, gâteau (`refrigerator`, `cookie`, `cake`).
--
-- La contrainte CHECK liste EXACTEMENT les clés de `src/lib/poster/icons.ts`
-- (figé par `icons.test.ts`, qui lit CE fichier). Elle est retirée puis
-- recréée sous le même nom, sur la même table : ce n'est pas un retrait.
-- =============================================================================

alter table public.affiche_templates
  drop constraint if exists affiche_templates_icon_check;

alter table public.affiche_templates
  add constraint affiche_templates_icon_check
  check (icon in ('none', 'alert', 'droplet', 'zap', 'key', 'fire_alarm', 'power_outage', 'wet_paint', 'toilet_out', 'phone_out', 'coffee', 'iron', 'kettle', 'no_smoking', 'door_closed', 'fire_extinguisher', 'flame', 'flood', 'elevator', 'cleaning', 'tv', 'table', 'dumbbell', 'stairs', 'parking', 'bus', 'bike', 'briefcase', 'calendar', 'wine', 'glass_water', 'shower', 'tea', 'martini', 'fork_knife', 'cup_saucer', 'bottle', 'salad', 'concierge_bell', 'refrigerator', 'cookie', 'cake'));
