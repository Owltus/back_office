# Étape 7 — Validation globale

## Objectif

Vérifier la cohérence de bout en bout du journal d'apprentissage : types, tests, build, et le
comportement métier attendu (empreinte, doublon, désapprentissage exact), sans régression sur la
détection, la galaxie ni la symétrie learn/unlearn existante.

## Contexte

Dernière étape. Le chantier touche la DB (nouvelle table + RPC, exécutée par l'utilisateur), le
métier (hash, journal), les services et l'UI — un contrôle global s'impose. Point sensible : le
désapprentissage par hash rejoue des compteurs PARTAGÉS ; il doit retirer EXACTEMENT les deltas du
document et rien d'autre.

## Fichier(s) impacté(s)

- Aucun nouveau. Validation transverse des étapes 1 à 6.

## Travail à réaliser

### 1. Contrôles automatiques

```bash
npx tsc --noEmit
npx vitest run src/lib/facturation
pnpm build
npx prettier --write <fichiers modifiés>
```

### 2. Scénario métier (base réelle, par l'utilisateur)

- Tamponner une facture → une entrée apparaît au journal ; les nuages/émetteur sont incrémentés.
- Re-déposer le MÊME PDF → marqué « doublon » ; re-tamponner télécharge le PDF mais NE réapprend pas.
- Modal « Contrôle des imputations » → « Factures apprises » liste la facture ; « Désapprendre »
  la retire ET remet les compteurs à leur état d'avant (vérifier un code + l'émetteur).
- « Annuler l'apprentissage » en séance retire aussi l'entrée du journal, sans double décrément.
- Facture apprise AVANT le journal (sans entrée) : le repli « Corriger une facture déjà tamponnée ? »
  reste disponible.

### 3. Non-régression

- Détection sans émetteur / base immature : comportement identique à l'existant.
- Dégradation gracieuse si `facturation_learned_docs` non déployée (journal vide, aucun doublon,
  tampon et apprentissage inchangés).
- Galaxie et affichage des probabilités cohérents ; symétrie learn/unlearn préservée (instantané).

## Ordre d'exécution

1. Contrôles automatiques.
2. Scénario métier (idéalement base réelle peuplée).
3. Non-régression détection / galaxie / undo.

## Critère de validation

- `npx tsc --noEmit`, `npx vitest run`, `pnpm build` verts.
- Scénario métier conforme (empreinte, doublon non réappris, désapprentissage exact sans PDF).
- Aucune régression détection / galaxie / symétrie learn-unlearn.

## Contrôle /borg

- **Sécurité** : aucune écriture DB directe ni DDL exécuté par l'assistant ; toutes les écritures
  passent par les RPC `SECURITY DEFINER` à garde de rôle. `service_role` jamais exposée.
- **Cohérence du désapprentissage** : `forgetLearnedDoc(hash)` décrémente EXACTEMENT les deltas de
  la ligne (borné à 0 + purge), sans toucher aux contributions d'autres factures ; pas de double
  décrément entre `handleUndoLearn` et le journal.
- **Symétrie / instantané** : le journal stocke l'instantané figé au tampon (`codes`/`issuerKey`/
  `deltas`), jamais l'état courant ; clé émetteur via `issuerKey` (pas de fragmentation).
- **Dégradation gracieuse** : table absente → journal vide, aucun chemin cassé (dépôt, tampon,
  apprentissage, undo classiques inchangés).
- **Confidentialité / volumétrie** : en-tête SQL assume le stockage d'un sac de mots par facture ;
  vérifier qu'aucun texte brut ni PDF n'est stocké, et que la table figure dans le reset.
