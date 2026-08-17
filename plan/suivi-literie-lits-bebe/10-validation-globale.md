# Étape 10 — Validation globale

## Objectif

Contrôle final avant mise en service de la page `literie` : cohérence
technique (types, build, tests), cohérence sécurité (RLS, permissions), et
recette fonctionnelle bout en bout des deux volets (grille literie + planning
lits bébé).

## Fichier(s) impacté(s)

- L'ensemble des fichiers créés/modifiés aux étapes 1 à 9.

## Travail à réaliser

### 1. Contrôles techniques

- `npx tsc --noEmit`
- `pnpm build` (vérifier le découpage des chunks — la page `literie` doit
  être un chunk séparé, chargé à la demande, cohérent avec le routing par
  fichier existant)
- `pnpm lint`
- `npx vitest run src/lib/literie src/lib/baby-cots`

### 2. Contrôle sécurité

- Étendre `supabase/verif_securite.sql` (ou un script dédié
  `verif_securite_literie.sql` sur le même modèle) : un compte sans
  permission `literie` lit 0 ligne des 6 tables ; `literie_record_movement`
  refuse un appel sous le niveau écriture ; `hotel_rooms`/`baby_cot_
  assignments` refusent une écriture hors fenêtre de grâce pour un compte
  `ecriture`.
- Vérifier qu'aucune policy n'a été (re)créée par erreur dans les fichiers de
  table (`hotel_rooms.sql`, `literie_stock.sql`, `literie_sheets.sql`,
  `baby_cots.sql`) — autorité unique = `page_permissions_rls*.sql`.

### 3. Recette fonctionnelle (manuelle)

- Grille literie : basculer une chambre en synthétique, vérifier la
  décrémentation du stock et l'apparition du mouvement dans l'historique.
- Stock à 0 : vérifier l'avertissement non bloquant (D3) plutôt qu'un blocage
  dur.
- Commentaire + clôture : commenter, clôturer, vérifier le verrou (`ecriture`
  bloqué, `gestion` toujours possible), réouvrir.
- Planning lits bébé : créer, modifier, supprimer une assignation ; tenter un
  chevauchement sur le même lit (doit être refusé) ; test à deux onglets
  (temps réel) ; test de rattrapage après mise en veille d'un onglet (même
  scénario que le fix parking de cette session).
- Permissions : un compte `lecture` seule ne peut rien modifier sur aucun des
  deux volets ; un compte sans accès `literie` ne voit pas la page dans la
  navigation.

## Ordre d'exécution

1. Contrôles techniques (section 1).
2. Contrôle sécurité (section 2) — après avoir rejoué tout le SQL des
   étapes 1-5 en base.
3. Recette fonctionnelle (section 3), en dernier, sur un compte de test par
   niveau (`lecture`, `ecriture`, `gestion`).

## Critère de validation

- Les 4 commandes de la section 1 passent sans erreur ni avertissement
  nouveau.
- Chaque vérification de la section 2 se comporte comme attendu (échec côté
  RLS pour les cas qui doivent échouer).
- Chaque scénario de la section 3 se déroule sans blocage inattendu.

## Contrôle /borg

Étape critique (dernière étape du plan, validation globale). Audit :
- Cohérence bout en bout entre garde front (`editability.ts` des deux
  domaines) et RLS (fenêtres de grâce, niveaux requis) — aucun écart.
- Pas de régression sur les pages existantes qui partagent des composants
  (`CloseSheetDialog`, `StatTile`, `PageHeader`) — un changement de props par
  défaut pourrait affecter `/caisse` ou `/rapro`.
- Le bloc temps réel de `BabyCotBoard.tsx` ne dégrade pas les performances
  d'autres pages (canal Supabase distinct, pas de fuite d'abonnement au
  démontage).
