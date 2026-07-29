# Étape 5 — Validation globale + inventaire avant/après

## Objectif

Valider tout le chantier (compilation, build, page fonctionnelle, revue navigateur) et
produire le livrable que tu as demandé : l'inventaire complet AVANT → APRÈS de tous les
messages de repjour (erreurs, avertissements, succès, informations, états vides).

## Fichier(s) impacté(s)

Aucun code modifié ici — c'est une étape de vérification et de restitution.

## Travail à réaliser

### 1. Validation technique

```bash
npx tsc --noEmit
pnpm build
```

- `tsc` sans erreur.
- `build` réussi, découpage des chunks inchangé (aucun poids lourd ajouté).

### 2. Revue navigateur des messages clés

Vérifier en conditions réelles (compte admin ET compte non-admin si possible) :

- Import d'un fichier au mauvais format → message clair, pas de jargon ni d'exception.
- Import d'un fichier au mauvais jour / sans date dans le nom → message clair.
- Avertissement TVA : hôtelier voit le message et NE PEUT PAS forcer ; admin peut forcer.
- Succès d'import → message clair.
- Jour sans données vs échec de chargement → deux messages distincts.
- Suppression d'un jour en erreur → message humanisé (plus d'`alert` natif).

### 3. Grep de non-régression

Vérifier qu'il ne reste aucune trace de jargon ou de fuite technique dans les messages :

```bash
# Ne doit plus rien remonter dans les messages affichés :
#   "CSV", "TODAY", "MTD", "En-tête index", "${error.message}" dans un texte UI,
#   "forecast" / "Comparison" en dehors des noms de fichiers cités en indice.
```

### 4. Livrable : inventaire complet avant → après

Produire un tableau récapitulatif unique, par zone (validation, orchestrateur, parsing,
UI import, UI page), listant chaque message avec sa version avant et sa version après.
C'est ce tableau qui sera présenté dans le chat.

## Ordre d'exécution

1. `tsc` + `build`.
2. Revue navigateur.
3. Grep de non-régression.
4. Rédaction de l'inventaire avant/après.

## Critère de validation

- `tsc` et `build` OK.
- Aucun jargon ni exception brute dans les messages (grep vide).
- Inventaire avant/après complet remis à l'utilisateur.

## Contrôle /borg

Dernière étape du plan → audit global :
- Cohérence de ton sur l'ensemble (tutoiement, phrases courtes, pas de jargon).
- Aucune régression fonctionnelle : les chemins d'erreur mènent toujours au bon message,
  le garde-fou TVA bloque toujours le non-admin, l'admin force toujours.
- Aucun message orphelin (clé `MSG` définie mais jamais utilisée, ou inversement).
