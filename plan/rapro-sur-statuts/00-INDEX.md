# Plan — Rapprochement : statuts de base + sur-statuts (qualificatifs)

## Contexte

Sur `/rapro`, l'utilisateur distingue deux natures de statuts. D'un côté de
**vrais statuts terminaux** — le « circuit classique » du ménage : `nettoyee`,
`non_nettoyee` (« Bloquée »), `refus`, `noshow`. De l'autre des **sur-statuts**
(qualificatifs de cas particulier), dont le premier est **« Faux no-show »** : le
PMS a déclaré le client absent (no-show), mais il est en réalité présent. Une fois
ce sur-statut posé, la chambre **repasse par le circuit classique** — elle peut
être nettoyée, refusée ou bloquée. Le sur-statut n'est donc **pas terminal** : il
se **combine** avec un statut de base.

Le modèle actuel (chantier `rapro-statuts-chambres`, encore EN COURS et non
commité) est un enum PLAT : `RoomStatus = nettoyee | non_nettoyee | refus | noshow
| faux_noshow`. `faux_noshow` y est une 5ᵉ valeur qui **duplique le comportement
de `nettoyee`** partout (facturable, résolue, ne roule pas). C'est précisément la
dimension que l'utilisateur veut séparer : `faux_noshow` doit devenir un
**qualificatif orthogonal**, porté par-dessus un statut de base, et extensible à
d'autres cas exotiques « qui arrivent souvent ».

Contrainte projet : backend Supabase partagé, tables historiques en LECTURE
SEULE. `rapro_rooms` est propre au back-office, mais son script de création
commence par `drop table … cascade` — jamais rejoué. Toute évolution de schéma =
script SQL séparé, additif, idempotent, prod-safe, **exécuté par l'utilisateur**.

## Angles à clarifier

**Décisions actées (héritées de `rapro-statuts-chambres`, 2026-07-14)** : défaut
d'une chambre vendue = `nettoyee` (absence de ligne) · matérialisation ELIOR à la
clôture · `non_nettoyee` = « Bloquée » (fusion « à nettoyer »/« bloquée ») · clic
gauche = bascule/rotation, clic droit = menu contextuel · chambre non vendue =
rotation non vendue → nettoyée → refus.

**Décisions ouvertes** (recommandation par défaut retenue sauf avis contraire) :

- **D1 — Représentation du sur-statut (structurant).** **Option A (recommandée)** :
  une **2ᵉ colonne `qualifier text` nullable** (`check (qualifier is null or
  qualifier in ('faux_noshow', …))`) — calque exact du style maison « text +
  check in(...) », clé unique `(report_date, room)` inchangée, trigger inchangé,
  zéro migration. **Option B** : valeurs composées dans `status` (explosion
  combinatoire, à éviter). **Option C** : `flags text[]`/jsonb (utile seulement si
  plusieurs qualificatifs cumulables — sur-dimensionné pour un seul).

- **D2 — Rôle métier du qualificatif.** **Option A (recommandée)** : le
  qualificatif est **orthogonal et informatif** — c'est le **statut de base** qui
  détermine la couleur dominante, la facturation, la balance et le roulement ; le
  qualificatif n'est qu'un marqueur additif (comme « reportée ») + un compteur de
  reporting. **Option B** : le qualificatif modifie le comportement comptable
  (plus complexe, à motiver).

- **D3 — Facturation d'une chambre qualifiée (CHANGE la règle actuelle).**
  Aujourd'hui `faux_noshow` est **toujours** facturable (`monthly.ts`). Avec la
  séparation, **la facturation suit le BASE** : `faux_noshow + nettoyee` =
  facturable ; `faux_noshow + refus` ou `+ bloquée` = **non facturable** (hors
  charge). **Retenu par défaut** : oui, la facturation suit le base. À confirmer,
  car c'est un changement de règle ELIOR.

- **D4 — Contradiction `noshow` (base) × `faux_noshow` (qualificatif).** Un
  no-show réel (client absent) et un faux no-show (client présent) s'excluent.
  **Retenu par défaut** : poser le qualificatif `faux_noshow` **fait sortir** le
  base de `noshow` (le base bascule vers `nettoyee` par défaut, puis circuit
  classique) ; réciproquement passer le base à `noshow` retire le qualificatif.

- **D5 — TRANCHÉE : jeu initial de sur-statuts.** Trois qualificatifs dès le
  départ : `faux_noshow` (client présent malgré un no-show PMS), `depart_anticipe`
  (client parti tôt le matin), `delogement` (client changé de chambre / recouche).
  Colonne `qualifier` extensible ensuite sans refonte.

- **D5bis — TRANCHÉE : rendu par ICÔNE, pas par couleur.** Un sur-statut s'affiche
  comme une **petite icône dans la case chambre** (coin), PAS comme une couleur de
  fond — pour ne pas entrer en conflit avec la couleur du statut de base. Règle
  UX : base = couleur dominante, sur-statut = icône lisible en un coup d'œil. Une
  chambre porte **au plus un** qualificatif (donc au plus une icône).

- **D6 — TRANCHÉE : faire évoluer le working tree non commité.** On transforme le
  travail `rapro-statuts-chambres` en cours vers le modèle base+qualificatif AVANT
  tout commit (on ne commite jamais `faux_noshow` comme statut plat) ; **un seul
  commit propre** à la fin. Conséquence : le script
  `supabase/rapro_rooms_add_statuses.sql` (qui ajoute `faux_noshow` DANS `status`)
  est **abandonné** au profit du script « colonne qualifier ».

**Angles morts remontés par la reconnaissance** : aucun test sur
`reconcile`/`carryover`/`constants`/`monthly` (refactor sans filet) · la garde
d'exhaustivité `never` de `cellState` doit être reconstruite en 2D · le pseudo-
élément `::after` est déjà pris par « reportée » → le marqueur de qualificatif
doit utiliser `::before`/un autre coin · si `rapro_rooms_add_statuses.sql` a déjà
été exécuté, prévoir un UPDATE de reclassement `status='faux_noshow'` →
`status='nettoyee', qualifier='faux_noshow'` (a priori NON exécuté = migration nulle).

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-sql-qualifier.md](./1-sql-qualifier.md) | Script SQL : colonne `qualifier` | — | P0 | 30 min | Colonne + CHECK prod-safe, `add_statuses.sql` retiré | ⚠ |
| 2 | [2-modele-metier.md](./2-modele-metier.md) | Modèle base+qualificatif (types, constants, service) | — | P0 | 2h | `RoomStatus` de base + `Qualifier`, stockage 2 champs | |
| 3 | [3-coherence-comptable.md](./3-coherence-comptable.md) | Balance / roulement / ELIOR sur le BASE | 1,2 | P0 | 1h30 | reconcile/carryover/monthly raisonnent base-only | ⚠ |
| 4 | [4-interaction-board.md](./4-interaction-board.md) | Menu base + qualificatif, marqueur additif | 2,3 | P0 | 2h | Clic droit base (radio) + qualificatif (case), rendu | |
| 5 | [5-styles-pdf-cards.md](./5-styles-pdf-cards.md) | Icône qualificatif, PDF, cards, légende | 2,4 | P1 | 1h | Icône en case, PDF, cards, légende cohérents | |
| 6 | [6-validation.md](./6-validation.md) | Validation bout à bout | 1-5 | P0 | 1h | `tsc`/`build`, ELIOR, combinaisons vérifiées | ⚠ |

## Ordre d'exécution

Séquentiel, décisions **D1 à D4 à trancher AVANT l'étape 2** (elles fixent le type
et le stockage), **D3 avant l'étape 3** (règle ELIOR). Étapes 1 (SQL) et 2
(modèle) quasi indépendantes ; l'étape 3 est le cœur du risque comptable ; l'étape
4 dépend du modèle posé. Comme ce chantier fait évoluer du code **non commité**
(D6-Option A), il n'y a pas de bascule à committer entre-temps : on avance sur le
working tree existant et on commite l'ensemble à la fin, après validation.

Dé-risquage : livrer d'abord le modèle + la cohérence comptable (étapes 1-3) et
vérifier ELIOR AVANT de brancher l'UI (étapes 4-5), pour ne pas mélanger un bug de
règle comptable avec un bug d'interaction.

## Architecture cible

```txt
supabase/
  rapro_rooms_qualifier.sql       ← colonne qualifier + CHECK, prod-safe [nouveau]
  rapro_rooms_add_statuses.sql    ← ABANDONNÉ (faux_noshow ne va plus dans status) [supprimé]
src/
  lib/rapro/
    types.ts        ← RoomStatus = base pur ; + Qualifier ; RaproDay porte {base, qualifier} [modifié]
    constants.ts    ← statusOf/labels/cellState 2D + garde ; qualificatifs [modifié]
    service.ts      ← setStatus(base, qualifier) ; clearRoom ; materializeCleaned [modifié]
    reconcile.ts    ← classe sur le BASE (qualificatif ignoré) [modifié]
    carryover.ts    ← isResolved sur le BASE [modifié]
    monthly.ts      ← facturable = base nettoyee (qualificatif orthogonal) [modifié]
    pdf.ts          ← couleur de base + ICÔNE de qualificatif en coin [modifié]
  components/rapro/
    RaproBoard.tsx  ← menu base (radio) + qualificatif (radio Aucun+3), ICÔNE en case [modifié]
  styles/rapro.css  ← .rapro-room-qual-icon (icône en coin, pas de couleur de fond) [modifié]
```

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB / Supabase | `supabase/rapro_rooms_add_statuses.sql` (retiré) | `supabase/rapro_rooms_qualifier.sql` |
| Métier | `lib/rapro/{types,constants,service,reconcile,carryover,monthly,pdf}.ts` | — |
| Frontend | `components/rapro/RaproBoard.tsx`, `styles/rapro.css` | — |
| **Total** | **9 modifiés** | **1 nouveau** |
