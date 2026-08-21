# Plan — Caisse : cautions clients (dépôt de garantie en espèces)

## Contexte

L'onglet **Caisse** (`src/components/caisse/CaisseBoard.tsx`) confronte chaque shift un montant **compté** (coupures physiques) à un **fond de caisse attendu** (`fundOrigin`, aujourd'hui toujours 150 € via `FUND_TARGET`, `src/lib/caisse/constants.ts:39`). Le patron prend parfois une **caution en espèces** à un client (numéro de chambre + montant, ex. 300 €) qu'il range dans le tiroir-caisse — le fond attendu doit alors AUGMENTER d'autant (150 + 300 = 450 €) tant que la caution n'a pas été rendue, et ce sur **tous les jours suivants** (report en cascade), pas seulement le jour de la prise.

Le besoin ajouté : un bouton **« + Caution »** dans la barre du haut (texte + icône `+`, même gabarit que le bouton « Externe » ajouté récemment sur PDJ) ouvre un dialogue de saisie (chambre, montant, commentaire libre). Les cautions actives apparaissent en liste sur la page ; un **menu contextuel** sur une ligne permet de la **rembourser** (fin de la cascade) ou de la **supprimer** (erreur de saisie).

Précision de l'utilisateur : chaque caution est physiquement rangée dans le tiroir-caisse, **dans une enveloppe dédiée par caution** — elle fait donc bien partie du cash présent dans le tiroir (confirme qu'elle doit augmenter le fond attendu), sans être mélangée en vrac au reste des espèces.

Recherche effectuée (bonnes pratiques comptables) : en toute rigueur, une caution reçue est une dette envers le client, et sa restitution devrait être un mouvement de caisse tracé. **L'utilisateur a explicitement choisi une version plus simple** (voir D3) : pas de suivi par date de restitution, juste une soustraction immédiate du fond attendu au moment où la caution est marquée remboursée — accepté en connaissance de cause (voir la conséquence notée en D3).

Contrainte : backend Supabase dédié à cette app, mais toujours en **production avec de vrais utilisateurs** — SQL proposé par l'assistant, **exécuté par l'utilisateur** dans Supabase → SQL Editor. Nouvelle table `caisse_cautions`, indépendante, RLS calquée sur le pattern déjà éprouvé (`caisse_sheets`, `pdj_breakfasts`, `parking_reservations`, `rapro_rooms`) : policies définies via `get_page_level('caisse')` / `page_level_rank(...)`.

Note méthodologique : les skills `/rodin` (remise en question) et `/borg` (audit critique) référencés par le workflow `/plan` ne sont pas installés dans ce projet. La remise en question (alternative plus simple, angles morts) a été faite manuellement ci-dessous ; l'audit des étapes critiques (⚠) se fera par une revue de code approfondie (skill `code-review`) plutôt que par `/borg`.

## Angles à clarifier

Décisions actées (2026-08-22, tranchées par l'utilisateur) : **D1 = dans le tiroir-caisse** (enveloppe dédiée par caution — fait bien partie du fond compté) · **D3 = soustraction immédiate**, sans logique de « jour de remboursement » · **D4 = correction rétroactive automatique**, y compris sur une feuille déjà clôturée · **Automatisation = complète** (le plan initial, pas l'alternative « fond éditable à la main »). Le détail et les options écartées restent documentés ci-dessous pour mémoire.

- **D1 — Où est rangée la caution (structurant, conditionne tout le chantier). TRANCHÉ : dans le tiroir-caisse.** Chaque caution est dans sa propre enveloppe, à l'intérieur du tiroir — elle fait donc partie du cash physiquement présent et doit augmenter le fond attendu. Implication pratique (à rappeler à l'hôtelier, pas un développement) : au comptage des coupures, le contenu de chaque enveloppe active doit être inclus dans le total comptabilisé, sinon un écart apparaîtra à tort.
- **Alternative plus légère envisagée et écartée** : rendre `fundOrigin` simplement éditable à la main (avec une suggestion affichée). Écartée au profit de l'automatisation complète (confirmé par l'utilisateur).
- **D2 — Granularité temporelle (mineur, acté).** Granularité **JOUR** — une caution active un jour donné compte pour ses 3 shifts (le cash ne change pas de tiroir entre eux).
- **D3 — Comportement au remboursement (structurant, comptable). TRANCHÉ : soustraction immédiate, pas de notion de « jour ».** L'utilisateur a explicitement écarté toute logique de date de remboursement (« tu ne sais pas quand il part » — le check-out réel n'est pas prévisible à l'avance) : dès qu'une caution est marquée « remboursée », son montant cesse **immédiatement** de compter dans le fond attendu, à partir de ce moment précis. Pas de jour « encore compté », pas d'écart automatiquement mis en évidence ce jour-là (contrairement à la bonne pratique comptable trouvée en recherche web, qui recommande un mouvement tracé — sciemment écartée ici pour la simplicité). **Conséquence à connaître** : si l'enveloppe est physiquement retirée du tiroir sans que quelqu'un pense à cliquer « Rembourser » au même moment, aucun garde-fou logiciel ne détectera la disparition — la responsabilité de synchroniser le clic avec le geste physique reste humaine. Techniquement : une caution compte pour toute date **strictement antérieure** à sa date de remboursement (pas le jour même).
- **D4 — Correction rétroactive sur une feuille déjà clôturée (structurant, technique). TRANCHÉ : oui, automatique.** Contrairement à la recommandation initiale (« une feuille validée ne bouge plus jamais »), l'utilisateur veut qu'ajouter une caution en retard sur une date déjà clôturée corrige automatiquement cette vieille feuille. Solution technique retenue pour l'obtenir **sans jamais réécrire une ligne verrouillée** (donc sans conflit avec la RLS de verrou, ni bypass admin nécessaire) : le fond attendu **n'est plus jamais figé/stocké** dans `fund_origin` — il est **recalculé en direct à chaque affichage**, pour n'importe quelle date passée ou présente, à partir de l'historique des cautions actives à cette date. La colonne `fund_origin` de `caisse_sheets` reste en base (inchangée, toujours peuplée à 150 comme aujourd'hui) mais n'est plus la source de vérité utilisée à l'écran/au PDF/dans l'analytique — elle devient une valeur historique non significative pour ce chantier. **Conséquence à connaître, acceptée par l'utilisateur** : un rapport déjà imprimé/clôturé peut, si on le rouvre ou le reconsulte plus tard, afficher un écart différent de celui vu au moment de la clôture (puisque le calcul se refait avec les cautions connues AUJOURD'HUI, pas celles connues à l'époque). C'est le prix de l'auto-correction demandée — communiqué explicitement à l'Étape 6.
- **D5 — Suppression vs remboursement (mineur, acté par analogie avec `caisse_sheets`).** Deux actions distinctes dans le menu contextuel : **« Rembourser »** (statut `refunded` + horodatage, réservé aux rôles `ecriture`+, cesse de compter immédiatement — D3) et **« Supprimer »** (suppression physique, réservée `gestion`/admin, pour corriger une erreur de saisie — jamais le chemin normal de fin de vie d'une caution).
- **D6 — Identifiant de chambre (mineur, acté ; corrigé en revue).** `room smallint`, validé contre le VRAI inventaire `ALL_ROOMS` (`src/lib/hotel/rooms.ts` : 102-114, 201-214, …, 621-631 — PAS une plage 1-80) plutôt qu'un texte libre. Aucune contrainte CHECK de plage en base, par cohérence avec `pdj_breakfasts`/`rapro_rooms` (ni l'un ni l'autre ne contraint `room` côté SQL).
- **D7 — Fenêtre d'écriture RLS de la caution (mineur, acté).** Pas de fenêtre glissante type J-1 sur `caisse_cautions` — une caution est un événement ponctuel qui peut être créée ou remboursée n'importe quand par un rôle `ecriture`+. Suppression réservée `gestion` (miroir `caisse_sheets`).
- **D8 — Gating de lecture (mineur, acté par analogie).** Lecture pour tout rôle ayant accès à la page caisse (`rank ≥ 1`), création/remboursement pour `ecriture`+ (`rank ≥ 2`), suppression `gestion` — même modèle que `caisse_sheets`.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-sql-table-caisse-cautions.md](./1-sql-table-caisse-cautions.md) | SQL : table `caisse_cautions` + RLS + trigger d'estampillage | — | P0 | 1h | Script `supabase/caisse_cautions.sql` exécuté par l'utilisateur | ⚠ |
| 2 | [2-metier-caisse-cautions-lib.md](./2-metier-caisse-cautions-lib.md) | Métier : calcul du fond effectif TOUJOURS en direct (cautions actives à une date, y compris passée) + service CRUD + branchement analytique (`hasAnomaly`) | 1 | P0 | 2h | Fonctions pures + service Supabase testés, `fundEcart` ne lit plus `fundOrigin` stocké | |
| 3 | [3-bouton-dialogue-caution.md](./3-bouton-dialogue-caution.md) | Frontend : bouton « + Caution » (barre du haut) + dialogue de saisie + branchement au fond affiché/écart | 2 | P0 | 2h | Une caution saisie augmente immédiatement le fond attendu affiché | |
| 4 | [4-liste-menu-contextuel.md](./4-liste-menu-contextuel.md) | Frontend : liste des cautions actives + menu contextuel Rembourser/Supprimer | 2, 3 | P0 | 2h | Cycle de vie complet (prise → cascade → remboursement/suppression) | |
| 5 | [5-messages-cloture-fund-dynamique.md](./5-messages-cloture-fund-dynamique.md) | Ajuste les messages de clôture (`closeIssues`, `CloseSheetDialog`) qui référencent encore `FUND_TARGET` en dur au lieu du fond effectif du jour | 3 | P1 | 45min | Aucun message de clôture n'affiche un montant faux quand une caution est active | |
| 6 | [6-validation-globale.md](./6-validation-globale.md) | Validation (typecheck, tests, build, matrice rôles, vérif RLS, revue de code des étapes critiques) | 1,2,3,4,5 | P1 | 1h | Build vert + comportement vérifié de bout en bout | ⚠ |

## Ordre d'exécution

Séquentiel strict. Les décisions **D1 à D8** sont actées (voir ci-dessus). L'Étape 1 (SQL) est exécutée par l'utilisateur dans Supabase ; les étapes 2 à 5 s'écrivent ensuite sur ce schéma. L'Étape 4 dépend de 2 ET 3 (la liste et le menu contextuel ont besoin du service ET du dialogue de saisie déjà en place pour être testés en conditions réelles). L'Étape 6 valide de bout en bout, notamment la cascade (une caution prise aujourd'hui augmente le fond de demain) ET la correction rétroactive voulue par l'utilisateur (D4) — en vérifiant explicitement avec lui la conséquence acceptée (un rapport déjà clôturé peut changer d'aspect si on le reconsulte après coup).

## Architecture cible

```
src/
├── lib/
│   └── caisse/
│       ├── cautions.ts          ← NOUVEAU : types Caution, effectiveFundTarget(),
│       │                            activeCautionsTotal(), isCautionActiveOn()
│       ├── calc.ts               ← fundEcart() prend le fond EFFECTIF en paramètre  [modifié]
│       │                            (plus jamais s.fundOrigin stocké)
│       ├── service.ts            ← + fetchAllCautions, createCaution,               [modifié]
│       │                            refundCaution, deleteCaution
│       ├── analytics.ts          ← hasAnomaly() utilise le fond effectif live       [modifié]
│       │                            (pas fundOrigin stocké) pour rester cohérent
│       │                            avec la correction rétroactive (D4)
│       └── constants.ts          ← FUND_TARGET inchangé (reste le plancher)         [inchangé]
├── components/
│   └── caisse/
│       └── CaisseBoard.tsx       ← + bouton « + Caution », CautionDialog,           [modifié]
│                                    liste des cautions actives, menu contextuel
supabase/
└── caisse_cautions.sql          ← CREATE TABLE + RLS (page:caisse) + trigger        [nouveau]
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB / Supabase | — | `supabase/caisse_cautions.sql` |
| Métier | `src/lib/caisse/{calc,service,analytics}.ts` | `src/lib/caisse/cautions.ts` (+ `cautions.test.ts`) |
| Frontend | `src/components/caisse/CaisseBoard.tsx` | — |
| **Total** | **4 modifiés** | **2 nouveaux** |
