# Étape 6 — Validation globale bout à bout

## Objectif

Vérifier la cohérence transverse du chantier : compilation et build verts,
facturation ELIOR non régressée, comportement des jours déjà clôturés maîtrisé,
et interaction (toggle + menu contextuel + gating) conforme.

## Contexte

Le chantier touche simultanément le schéma DB, la couche métier et le board. Deux
angles morts identifiés par la reconnaissance appellent une vérification manuelle
qu'aucun test automatique ne couvre :

- La facturation ELIOR (`monthly.ts`) peut tomber à zéro silencieusement si la
  convention de stockage a été inversée sans réconcilier le comptage.
- Les jours déjà clôturés (`rapro_sheets` validées) reposent sur l'interprétation
  « absence = non_nettoyee = Bloquée » ; si « absence » change de sens, tout
  l'historique clôturé est réinterprété rétroactivement (écran, PDF déjà générés,
  récaps ELIOR passés).

## Fichier(s) impacté(s)

- Ensemble des fichiers du chantier (revue transverse, pas de nouvelle modif
  attendue sauf correctifs).

## Travail à réaliser

### 1. Compilation et build

```bash
npx tsc --noEmit
pnpm build
```

Vérifier l'absence d'erreurs et le découpage des chunks inchangé.

### 2. Facturation ELIOR (priorité absolue)

Sur un mois de test réel, ouvrir le récap mensuel (`RaproMonthlyBoard` / route
`/rapro/mois`) et confirmer que le total facturable est NON nul et cohérent avec
le nombre de chambres nettoyées. Comparer à un mois de référence avant chantier.

### 3. Jours déjà clôturés

Ouvrir un jour clôturé antérieur au chantier et vérifier que son interprétation
n'a pas changé de manière inattendue (les chambres autrefois « bloquées par
défaut » n'apparaissent pas soudainement « nettoyées » de façon incohérente).
Décider avec l'utilisateur s'il faut un seuil de date d'application.

### 4. Interaction

- Toggle clic gauche `nettoyee` ↔ `refus`.
- Menu contextuel clic droit : les 4 items appliquent bien le statut.
- Gating : jour clôturé / lecture seule → aucune modification possible.
- Balance `reconcile` à zéro sur un jour entièrement traité ; `carryover` ne fait
  pas rouler `bloque`/`noshow`/`faux_noshow`(selon D4).

## Ordre d'exécution

1. `npx tsc --noEmit` puis `pnpm build`.
2. Vérifier le récap ELIOR sur mois test.
3. Contrôler un jour clôturé antérieur.
4. Dérouler les scénarios d'interaction.
5. Corriger les écarts éventuels, re-valider.

## Critère de validation

- `npx tsc --noEmit` et `pnpm build` verts, chunks inchangés.
- Récap ELIOR non nul et cohérent sur le mois de test.
- Aucune réinterprétation surprenante des jours clôturés (ou seuil d'application
  décidé et appliqué).
- Toggle, menu contextuel et gating conformes ; balance et roulement corrects.

## Contrôle /borg

Étape critique (validation transverse, dépend de tout le chantier). Auditer :
- Le récap facturable ELIOR ne peut pas être systématiquement nul (tracer un
  chemin vendu → nettoyé → facturé de bout en bout).
- Aucune écriture client ne fixe les colonnes serveur (`created_by`,
  `updated_at`, `imported_by`).
- Tous les statuts de `RoomStatus` sont couverts à l'affichage (écran + PDF) et
  dans le comptage comptable — aucun statut orphelin.
- Les données des jours déjà clôturés ne sont pas modifiées par le chantier
  (seule leur interprétation d'affichage peut évoluer, à valider).
