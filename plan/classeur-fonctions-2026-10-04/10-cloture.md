# Étape 10 — Clôture ⚠

## Objectif

Tout vérifier, tout consigner et passer une revue adverse avant de proposer
un push.

## Dépend de

Toutes les étapes réalisées.

## Fichier(s) impacté(s)

- `CLAUDE.md`, section Classeur :
  - les règles nées du chantier ;
  - la correction de la mention html2canvas, qui est périmée.
- `plan/classeur-fonctions-2026-10-04/00-INDEX.md` : statut de chaque étape et
  décisions prises.
- Aide « ? » de l'éditeur, si le zoom y est décrit.
- Vitrine du chapitre 34, **seulement** si une fonction de DOCUMENT a changé
  (a priori aucune).
- Mémoire de l'assistant.

## Phase de test /martin (vague finale)

1. `pnpm test`, `npx tsc --noEmit`, `pnpm build`. Vérifier le découpage des
   chunks : `jszip`, `mermaid` et un éventuel PDF restent hors du chunk
   d'entrée.
2. `pnpm test:mutation` sur le périmètre de l'étape 0, avec les seuils 80 / 60.
   Comparer au score de départ.
3. **Lecture en prod** : `verif_advisor.sql` et `verif_perf.sql`.
   `verif_classeur_acces.sql` écrit puis annule : sous le verrou /martin, il
   est joué en local (D21 = A) ou par l'utilisateur.
4. **Revue adverse** des correctifs avant tout push (règle du 2026-09-28 : une
   vague de correctifs a déjà introduit ses propres régressions).
5. Commit sans push. Le push se fait à la demande de l'utilisateur.

## Critère de validation

- Tout est vert.
- Les décisions D1 à D30 sont reportées dans l'index.
- L'utilisateur a confirmé ses tests d'écriture réelle : étape 1 (import avec
  refus), étape 6 (restauration), étape 7b (transfert).

## Contrôle /borg

- Les audits /borg des étapes ⚠ sont tous clos.
- Aucune lecture nominative n'est persistée sur le disque
  (`queryPersist.test.ts`).
- Les silhouettes correspondent au DOM réel de l'accueil
  (`PageShapes.test.tsx`).
