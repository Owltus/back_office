# Étape 7 — Surfaces techniques + validation globale

## Objectif

Réconcilier l'écran (noms humains) et le technique (numéros pour le comptable), puis vérifier
le chantier de bout en bout.

## Contexte

Dernière étape. Le tampon PDF et l'historique servent le comptable : ils doivent garder le
CODE + le NUMÉRO de compte (traçabilité comptable), tandis que l'écran de travail parle en
noms. On confirme cette séparation puis on valide tout.

## Fichier(s) impacté(s)

- `src/lib/facturation/stampLayout.ts` / `stamp.ts` (vérification : numéro conservé)
- `src/components/facturation/HistoriqueDialog.tsx` (nom humain à l'écran, numéro en repli)
- Vérification transverse (aucune modif fonctionnelle attendue au-delà)

## Travail à réaliser

### 1. Séparation écran / technique

- Tampon PDF : garder `code   compte` (numéro) via `imputationParts` — inchangé (le comptable
  lit le numéro sur le document). Aucune régression du chantier `facturation-compte-fiabilisation`.
- Historique : afficher le nom humain du compte (`compteLabel`) pour la lecture courante, avec
  le numéro consultable (survol/sous-texte). Décision : l'historique est un écran, il parle
  humain, mais le couple technique reste retrouvable.

### 2. Validation automatique

```bash
npx tsc --noEmit
pnpm test
pnpm build
```

### 3. Recette bout en bout

- Import d'une facture d'un émetteur connu « technique » → résumé directionnel + picker orienté
  (familles techniques en avant, alcool/restauration grisées mais accessibles).
- Import d'un émetteur inconnu → aucune orientation trompeuse (vue neutre).
- Choix d'un compte : présenté par son nom ; garde-fou compte manquant toujours actif ; alerte
  « inhabituel » si famille improbable.
- Tampon PDF : code + numéro corrects ; historique lisible en noms.
- Éditeur : renommer un compte se propage à l'écran.

### 4. Non-régression (hors périmètre)

- Galaxie, `detect.ts` (détection des codes), apprentissage émetteur→code, table legacy
  `facturation_budget_lines` : comportement inchangé.
- Le guidage famille n'altère JAMAIS `d.codes` ni ne masque une imputation légitime.
- Démarrage à froid : jamais de direction inventée.

## Ordre d'exécution

1. Séparation écran/technique (tampon, historique).
2. Validation automatique.
3. Recette bout en bout.
4. Non-régression.

## Contrôle /borg

Étape critique (validation globale). Auditer :
- Source unique des noms (`compteLabel`) : aucun numéro affiché en premier plan à l'écran,
  aucun nom sur les surfaces techniques (tampon).
- Guidage strictement doux : aucune famille jamais masquée/interdite ; démarrage à froid neutre.
- Le guidage famille n'a pas modifié la détection des codes (comparaison avant/après).
- RLS du dictionnaire (lecture par page, écriture gestion) ; pas de secret ; SQL de l'étape 1
  bien joué avant tout push.
- Non-régression du garde-fou compte (chantier précédent) et du format unique.
