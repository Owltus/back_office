# Plan — Rapprochement : statuts par défaut nettoyés + menu contextuel

## Contexte

La page « rapprochement » (`/rapro`) suit le ménage chambre par chambre pour un
jour donné. Aujourd'hui, une chambre vendue non touchée est considérée
`non_nettoyee` (affichée « Bloquée », case rouge « à faire ») et le clic gauche
fait défiler un cycle de quatre couleurs (`non_nettoyee → nettoyee → refus →
noshow`). Cette mécanique est jugée trop lourde pour un usage quotidien où l'immense
majorité des chambres sont, de fait, nettoyées.

Le chantier renverse le postulat : **par défaut, toute chambre vendue est
nettoyée** ; on n'applique un statut qu'en exception. L'interaction se
simplifie en deux gestes : un **clic gauche** qui bascule uniquement entre
`nettoyée` et `refus` (le cas courant), et un **clic droit** qui ouvre un
**menu contextuel** pour les statuts rares — `bloqué`, `no show`, `faux no
show`. Deux de ces statuts (`bloque`, `faux_noshow`) n'existent pas encore et
doivent être ajoutés au modèle.

Contrainte projet à respecter partout : le backend Supabase est **partagé** et
en **lecture seule** côté outillage. Aucune migration n'est exécutée par
l'assistant. Toute évolution de schéma est fournie comme un script SQL séparé,
additif, idempotent et prod-safe, **exécuté par l'utilisateur** dans Supabase →
SQL Editor. Le fichier `rapro_rooms.sql` commence par `drop table … cascade` :
il ne doit JAMAIS être rejoué en production.

## Angles à clarifier

**Décisions actées (2026-07-13 / 14)** : clic gauche = toggle `nettoyee` ↔
`refus` · clic droit = menu contextuel pour `bloque` / `noshow` / `faux_noshow` ·
défaut d'une chambre vendue = `nettoyee` · réutilisation de la primitive shadcn
`context-menu.tsx` sur le patron de `ParkingBoard.tsx`.

- **D2 — TRANCHÉE : découpler le défaut affiché du marqueur d'absence.** On garde
  `non_nettoyee` comme marqueur d'absence technique, mais une chambre vendue est
  AFFICHÉE `nettoyee` et une vraie ligne `nettoyee` est écrite dès qu'elle doit
  être facturée. `monthly.ts` (ELIOR) continue de compter des lignes réelles → le
  récap facturable reste juste. (Option A « inverser le stockage » écartée : elle
  faisait tomber ELIOR à zéro silencieusement.)

- **D4 — TRANCHÉE : « faux no show » = client PRÉSENT.** Cas métier précisé par
  l'utilisateur : un client mal (ou pas) check-in, que le rapport PMS déclare
  absent alors qu'il est bien là. La chambre est donc occupée et nettoyée →
  `faux_noshow` se comporte comme `nettoyee` : **facturable**, sort de la balance
  (« settled »/résolu), NE roule PAS. Il n'entre donc PAS dans
  `JUSTIFIED_STATUSES` (réservé au hors charge non facturable) — il rejoint le
  bucket « nettoyée/facturable » dans `monthly`, `reconcile` et `carryover`.

- **D5 — TRANCHÉE (découle de D2) : ne pas toucher le DEFAULT SQL.** Le défaut
  `nettoyee` est géré côté application ; le DEFAULT de colonne reste
  `non_nettoyee`. Le script de l'étape 1 n'inclut PAS de `alter column … set
  default`.

**Décisions ouvertes** (recommandation par défaut retenue sauf avis contraire) :

- **D1 — Sort de `non_nettoyee` et libellé « Bloquée ».** `non_nettoyee` cumule
  trois rôles : défaut, marqueur d'absence, libellé « Bloquée ». **Option A
  (retenue par défaut)** : `non_nettoyee` reste un marqueur technique interne
  invisible comme geste, et le libellé « Bloquée » migre vers le nouveau `bloque`.
  **Option B** : supprimer `non_nettoyee` du modèle (plus lourd).

- **D3 — `bloque` dans `JUSTIFIED_STATUSES` (hors charge) ?** **Retenu par
  défaut** : oui — `bloque` = chambre indisponible, non facturable, exclue de la
  balance et du roulement. (`noshow` y est déjà ; `faux_noshow` en est exclu, cf.
  D4.)

**Angles morts remontés par la reconnaissance** (à garder en tête) :
facturation ELIOR (`monthly.ts`) tombant à zéro en silence · jours déjà
clôturés réinterprétés rétroactivement si « absence » change de sens ·
décomptes en dur sans garde d'exhaustivité dans `pdf.ts`, `countStats` et les
cards · `STATUS_CYCLE`/`nextStatus` devenant du code mort.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-sql-statuts.md](./1-sql-statuts.md) | Script DB additif (CHECK + défaut) | — | P0 | 30 min | `bloque`/`faux_noshow` insérables, script prod-safe | ⚠ |
| 2 | [2-type-constantes.md](./2-type-constantes.md) | Type union + constantes + garde d'exhaustivité | — | P0 | 1h30 | `RoomStatus` étendu, cycle → toggle, mappings à jour | |
| 3 | [3-stockage-comptable.md](./3-stockage-comptable.md) | Sémantique de stockage + cohérence comptable | 1,2 | P0 | 2h | `setStatus`, `monthly`, `reconcile`, `carryover` alignés | ⚠ |
| 4 | [4-interaction-board.md](./4-interaction-board.md) | Interaction : toggle gauche + menu contextuel droit | 2,3 | P0 | 2h | Clic gauche toggle, clic droit `ContextMenu` | |
| 5 | [5-styles-pdf-cards.md](./5-styles-pdf-cards.md) | Styles, PDF, cards & légende | 2,4 | P1 | 1h | Nouveaux statuts câblés partout (écran + PDF) | |
| 6 | [6-validation.md](./6-validation.md) | Validation globale bout à bout | 1-5 | P0 | 1h | `tsc`/`build` verts, ELIOR & clôtures vérifiés | ⚠ |

## Ordre d'exécution

Séquentiel avec un point de parallélisme. Les décisions ouvertes (surtout **D2**
et **D4**) doivent être actées AVANT l'étape 3, qui en dépend directement. Les
étapes 1 (SQL) et 2 (types/constantes) sont indépendantes et peuvent être menées
en parallèle. L'étape 3 est le cœur du risque (couplage facturation ELIOR) et est
critique. L'étape 4 dépend de la sémantique posée en 3. L'étape 6 valide
l'ensemble, avec relecture manuelle obligatoire du récap ELIOR et du
comportement des jours déjà clôturés.

Découpage alternatif de dé-risquage possible : livrer d'abord les étapes 4-5 sur
les **4 statuts existants** (toggle + menu contextuel), puis n'ajouter
`bloque`/`faux_noshow` (étapes 1-3) qu'une fois D3/D4 tranchés — cela permet de
tester l'interaction sans toucher au comptage facturable.

## Architecture cible

```txt
supabase/
  rapro_rooms_add_statuses.sql   ← script additif CHECK/défaut, prod-safe [nouveau]
src/
  lib/rapro/
    types.ts        ← RoomStatus += 'bloque' | 'faux_noshow' [modifié]
    constants.ts    ← toggle au lieu du cycle, mappings, garde d'exhaustivité [modifié]
    service.ts      ← setStatus : marqueur d'absence / défaut (D2) [modifié]
    monthly.ts      ← facturation ELIOR alignée sur D2 (risque zéro) [modifié]
    reconcile.ts    ← isSettled + pending intègrent les nouveaux statuts [modifié]
    carryover.ts    ← isResolved intègre les nouveaux statuts [modifié]
    pdf.ts          ← CELL_FILL / cellState / LEGEND_ORDER étendus [modifié]
  components/rapro/
    RaproBoard.tsx  ← clic gauche toggle, onContextMenu + ContextMenu [modifié]
  components/ui/
    context-menu.tsx ← réutilisé tel quel [inchangé]
  styles/rapro.css  ← .rapro-room-bloque / -faux-noshow [modifié]
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB / Supabase | — | `supabase/rapro_rooms_add_statuses.sql` |
| Métier | `lib/rapro/{types,constants,service,monthly,reconcile,carryover,pdf}.ts` | — |
| Frontend | `components/rapro/RaproBoard.tsx`, `styles/rapro.css` | — |
| **Total** | **9 modifiés** | **1 nouveau** |
