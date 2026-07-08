# Étape 5 — Validation globale

## Objectif

Vérifier de bout en bout que la réconciliation (balance), le report/roulement
(y compris après clôture) et la garde à la clôture fonctionnent ensemble, sans
régression, et que les cas limites (navigation, PDJ manquant, clôture/réouverture)
sont couverts.

## Contexte

Dernière étape (validation globale) — **critique**. Elle croise les couches
métier (étapes 1, 2) et UI/PDF (étapes 3, 4). Aucune modification de schéma n'a eu
lieu : les risques à re-vérifier sont surtout la **dépendance au PDJ** (un jour
sans occupation fausse balance et report) et la **cohérence du roulement à travers
une clôture** (D7 : une bloquée doit continuer de rouler après clôture, mais rester
bornée).

## Fichier(s) impacté(s)

- Aucun nouveau ; vérification transverse de `src/lib/rapro/*` et `src/components/rapro/RaproBoard.tsx`.

## Travail à réaliser

### 1. Scénarios fonctionnels

- Journée « propre » : toutes les occupées nettoyées → balance 0, card « OK », clôture sans avertissement.
- Journée avec refus/no-show : ces chambres sortent de la balance (justifiées, D6).
- Chambre bloquée non résolue → visible **reportée** le lendemain, même inoccupée ; disparaît une fois nettoyée/justifiée.
- **Après clôture** : une chambre bloquée le jour clôturé reste **reportée** les jours suivants (D7) ; une arrivée/occupation qui change le PDJ d'un jour clôturé se **recalcule** correctement (report dérivé).
- Résidu assumé à la clôture (D5) : avertissement affiché, clôture possible, commentaire général justifiant l'exotique.

### 2. Cas limites

- Jour **sans PDJ importé** : balance/report affichent « — » / se dégradent proprement (pas de plantage, pas de faux zéro).
- Navigation multi-jours : le roulement reste **borné** (D4), les lectures restent en cache.
- Clôture puis réouverture : aucun état incohérent (report calculé, donc pas de double comptage).

### 3. Vérifications techniques

- `npx tsc --noEmit` et `pnpm build` verts ; vérifier le découpage des chunks (jsPDF toujours en `import()` dynamique, hors du chunk `rapro`).

## Ordre d'exécution

1. Dérouler les scénarios fonctionnels et les cas limites (l'utilisateur teste l'écriture réelle avec un compte super/admin — jamais l'assistant).
2. `npx tsc --noEmit` puis `pnpm build`.
3. Consigner les écarts éventuels et corriger.

## Critère de validation

- Tous les scénarios (dont « après clôture ») se comportent comme décrit ; les cas limites ne plantent pas.
- Balance et report sont cohérents entre écran et PDF.
- `npx tsc --noEmit` et `pnpm build` verts.

## Contrôle /borg

Dernière étape (validation globale). Auditer :

- Report **borné** (pas de lecture non bornée des jours anciens) et robuste aux jours sans occupation PDJ.
- Roulement correct **à travers une clôture** (D7) : une bloquée non résolue continue de rouler ; une bloquée résolue par un statut cesse de rouler.
- Aucune régression sur la convention « absence de ligne = `non_nettoyee` » ni sur le verrou `canEditFields`.
- Aucune écriture assistant sur la base ; aucun SQL requis par ce chantier.
