# Plan — Rapprochement : balance comptable et report

## Contexte

L'onglet Rapprochement (`/rapro`) est aujourd'hui un suivi ménage par chambre et
par jour : chaque chambre porte un statut (`nettoyee`, `non_nettoyee` affiché
« Bloquée », `refus`, `noshow`), l'occupation (« le dû ») est reprise du PDJ, et
un jour peut être clôturé avec un commentaire. Ce plan fait passer la feature
d'un **suivi** à une **réconciliation comptable** : savoir chaque jour ce qui est
fait, et faire en sorte qu'aucune chambre due ne soit perdue d'un jour à l'autre.

Le modèle métier (verrouillé avec l'utilisateur) distingue **trois familles**, sur
les **4 statuts existants** — aucune raison à qualifier, aucun nouveau statut :

- **Fait** — `nettoyee`.
- **Hors charge** (aucun ménage dû → sort de la balance, **ne roule pas**) —
  `refus` (client en séjour de plusieurs nuits qui refuse le ménage, **pas** en
  checkout) et `noshow` (vendue mais client absent).
- **Dû non fait** (reste à nettoyer → **dans la balance, roule au jour suivant**) —
  `non_nettoyee`, la « Bloquée » = « la chambre a été utilisée mais non nettoyée, à
  refaire demain ». Peu importe la cause précise : une bloquée est une bloquée.

Exemple de référence : 20 chambres, 10 louées (TO 50 %) → 5 nettoyées, 3 refus
(hors charge), 2 bloquées (roulent). Demain : 5 nouvelles louées + **2 reportées**
= 7 à nettoyer. La « balance à zéro » est atteinte quand toute chambre due est
faite ou hors charge ; le reste roule jusqu'à ce qu'il soit fait.

**Aucun changement de base de données** : les 4 statuts existants suffisent, et le
report comme la balance sont **dérivés** (aucun stockage). Contrainte projet
rappelée pour mémoire : backend Supabase **partagé / lecture seule** hors
`rapro_rooms`/`rapro_sheets` — mais ici, rien à migrer, aucun SQL à exécuter.

## Angles à clarifier

**Décisions actées (2026-07-08)** — toutes tranchées avec l'utilisateur :

- **D1 — La raison n'est pas structurée.** Une chambre non faite = statut
  « Bloquée » ; on ne qualifie pas *pourquoi*. Pas de champ texte par chambre ; le
  commentaire du jour reste **général** (cas exotiques). Convention « absence de
  ligne = `non_nettoyee` » préservée.
- **D2 — Pas de nouveau statut.** Les 4 statuts actuels suffisent
  (`nettoyee`/`non_nettoyee`/`refus`/`noshow`). Aucune migration.
- **D3 — Report calculé / dérivé.** On reconstruit les chambres reportées en
  relisant les jours précédents. Aucun stockage, aucun double comptage.
- **D4 — Report borné par une fenêtre.** Look-back borné à une fenêtre de N jours
  (ex. 7). La clôture n'interrompt PAS le roulement (D7). Une chambre cesse de
  rouler dès qu'elle est nettoyée ou passe hors charge.
- **D5 — Clôture : avertir sans bloquer.** On peut clôturer avec un résidu ; un
  avertissement le signale.
- **D6 — Hors charge = `refus`/`noshow`.** Eux seuls sortent de la balance ; la
  « Bloquée » reste dans la balance et roule.
- **D7 — Le roulement traverse la clôture.** Une chambre bloquée non résolue
  continue de rouler après la clôture de son jour, jusqu'à résolution par un
  statut réel (option A, la moins contraignante).

Plus de décision ouverte : le plan est exécutable en l'état.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-metier-reconciliation.md](./1-metier-reconciliation.md) | Métier : réconciliation (3 familles) + prédicat balance | — | P0 | 1h | `reconcile()`/`isReconciled()` purs | |
| 2 | [2-metier-roulement.md](./2-metier-roulement.md) | Métier : roulement calculé multi-jours | 1 | P1 | 1h30 | `carryOver()` dérivé et borné | |
| 3 | [3-ui-board.md](./3-ui-board.md) | UI : card balance, marquage reportées, garde clôture | 1,2 | P1 | 2h | Board réconcilié (balance, report visible) | |
| 4 | [4-pdf.md](./4-pdf.md) | PDF : balance et reportées au document | 3 | P2 | 45 min | Feuille imprimée alignée (une page A4) | |
| 5 | [5-validation.md](./5-validation.md) | Validation globale (nav, PDJ manquant, clôture) | 1-4 | P0 | 45 min | `tsc` + `build` verts, scénarios validés | ⚠ |

## Ordre d'exécution

Séquentiel, sans décision restante. Étape 1 (pur calcul dérivé) est le socle ;
étape 2 s'appuie dessus pour le roulement ; étape 3 consomme les deux dans l'UI ;
étape 4 (PDF) suit l'UI ; étape 5 valide l'ensemble (dernière étape →
**critique**). Aucune étape ne touche le schéma ni n'exige de SQL : risque faible,
confiné au code applicatif.

## Architecture cible

```txt
src/lib/rapro/
  reconcile.ts       ← modèle comptable : reconcile(), isReconciled(), balance [nouveau]
  carryover.ts       ← roulement calculé, borné : carryOver(), carryoverWindow() [nouveau]
  constants.ts       ← JUSTIFIED_STATUSES ; countStats réexprimé via reconcile [modifié]
  service.ts         ← lecture d'une plage de jours pour le roulement [modifié]
  pdf.ts             ← bandeau balance + repère reportées [modifié]
src/components/rapro/
  RaproBoard.tsx     ← card Balance (OK à zéro), overlay « reportée », garde clôture [modifié]
src/styles/rapro.css ← état visuel « reportée » + état « OK » de la card balance [modifié]
```

Aucun fichier `supabase/` modifié. `types.ts` inchangé (pas de nouveau statut).

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB / Supabase | — | — |
| Métier | `src/lib/rapro/constants.ts`, `service.ts`, `pdf.ts` | `src/lib/rapro/reconcile.ts`, `src/lib/rapro/carryover.ts` |
| Frontend | `src/components/rapro/RaproBoard.tsx`, `src/styles/rapro.css` | — |
| **Total** | **5 modifiés** | **2 nouveaux** |
