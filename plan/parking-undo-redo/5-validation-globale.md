# Étape 5 — Validation globale et scénarios collaboratifs

## Objectif

Vérifier que l'undo/redo fonctionne, respecte les gardes du projet (temporelles,
anti-chevauchement, rôles), et se comporte correctement face à la concurrence
temps réel. Clore le chantier proprement.

## Contexte

Dernière étape, donc critique : elle valide l'ensemble et, surtout, les scénarios
qui font tout l'intérêt du chantier (le collaboratif). C'est là que le choix
« patch par champ » se démontre.

## Fichier(s) impacté(s)

- Aucun (validation). Éventuel ajustement ponctuel si un scénario échoue.

## Travail à réaliser

### 1. Chaîne de validation technique

```bash
npm test
npx tsc --noEmit
pnpm lint
pnpm build
```

### 2. Scénarios fonctionnels (rôle ecriture, puis gestion)

1. **Fat-finger déplacement** : déplacer une résa, `Ctrl+Z` → elle revient à sa
   place/jour/durée d'origine ; `Ctrl+Y` → elle repart.
2. **Création** : créer une résa, `Ctrl+Z` → elle disparaît ; `Ctrl+Y` → réapparaît.
3. **Suppression** : supprimer une résa, `Ctrl+Z` → ré-insérée avec le même id et
   tous ses champs (nom, statut, commentaire).
4. **Renommage / statut / commentaire** : chacun s'annule et se rétablit au champ près.
5. **Non payé** : passer une résa en « Non payé » (avec motif), `Ctrl+Z` → revient
   au statut ET au commentaire d'avant, en une seule annulation.
6. **Chaîne** : plusieurs actions d'affilée, `Ctrl+Z` répétés remontent dans
   l'ordre inverse ; une action neuve au milieu vide la pile redo.

### 3. Scénarios de gardes

7. **Passé verrouillé (ecriture)** : une résa devenue non éditable (hors fenêtre
   de grâce) — son undo est refusé (entrée sautée), la donnée n'est pas réécrite.
8. **Saisie** : `Ctrl+Z` dans le champ nom / le textarea commentaire n'annule pas
   l'action précédente (undo texte natif).
9. **Pendant un geste** : `Ctrl+Z` inerte durant un drag ou un placement.

### 4. Scénarios collaboratifs (deux onglets/sessions A et B)

10. **Préservation par champ** : A déplace la résa X (place). B passe X en « payé »
    + commentaire (reçu par A via realtime). A fait `Ctrl+Z` → seule la place de X
    revient ; le statut et le commentaire posés par B **survivent**.
11. **Entrée périmée** : A crée/déplace X. B supprime X. A fait `Ctrl+Z` →
    l'entrée est **sautée silencieusement** (pas d'erreur, pas de résurrection),
    l'undo passe à l'action précédente s'il y en a une.
12. **Place reprise** : A supprime X. B crée une résa sur la même place/plage. A
    fait `Ctrl+Z` (ré-insertion de X) → refusée car chevauchement (`applyCreate`
    renvoie false), entrée sautée.

## Ordre d'exécution

1. Lancer la chaîne technique (§1).
2. Dérouler les scénarios §2 → §4.
3. Corriger tout écart, re-valider.
4. (Si l'utilisateur le demande) mettre à jour la mémoire projet et proposer un
   commit — sans push, selon l'habitude.

## Critère de validation

- `npm test`, `npx tsc --noEmit`, `pnpm lint`, `pnpm build` : tous verts.
- Les 12 scénarios se comportent comme décrit.
- Aucune écriture Supabase nouvelle ; les gardes temporelles et
  l'anti-chevauchement s'appliquent aussi à l'undo/redo.

## Contrôle /borg

Étape critique (dernière du plan, valide l'ensemble). Auditer :

- que `record` n'est JAMAIS appelé depuis le canal realtime (sinon la pile
  contiendrait les actions d'autrui) ;
- que les commandes `update` ne portent QUE les champs touchés (pas d'instantané
  complet qui écraserait le travail concurrent) — vérifier chaque `record` de
  l'étape 4 ;
- que `applyCreate`/`applyDelete`/`applyUpdate` renvoient bien `false` sur entrée
  périmée et que `undo`/`redo` sautent alors l'entrée sans planter ;
- absence de fuite d'écouteur clavier (cleanup du `useEffect` dans
  `useUndoRedoShortcut`) ;
- que la borne `LIMIT` de la pile ne casse pas l'appariement undo/redo.

`/borg` indisponible → audit manuel via le skill `/verify` sur `ParkingBoard.tsx`,
`useParkingHistory.ts` et `history.ts`.
