# Étape 3 — UI du flux d'import

## Objectif

Rendre clairs tous les libellés du flux d'import : zones de dépôt, titres et boutons de
modale, messages de succès et d'erreur, et le message du garde-fou TVA. Supprimer le
jargon PMS (« Comparison By Date », « Forecast By Date Range » deviennent des libellés
plains avec le nom exact en indice) et ne plus jamais afficher une exception brute.

## Fichier(s) impacté(s)

- `src/components/repjour/ImportSection.tsx`
- `src/components/repjour/ForecastImportButton.tsx`

## Travail à réaliser

### 1. `ImportSection.tsx` — avant → après

| Ligne(s) | Avant | Après |
|----------|-------|-------|
| 239 | `Type de fichier non reconnu` | `Ce fichier n'est pas reconnu. Attendus : les chiffres du jour et les prévisions.` |
| 218 | `Ce fichier date du ${d}. Importe celui du jour.` | `Ce fichier date du ${d}. Charge plutôt celui d'aujourd'hui.` |
| 358 | `— fichiers CSV du PMS (Comparison + Forecast)` | `— les deux fichiers exportés de ton logiciel (chiffres du jour + prévisions)` |
| 293 | `Import réussi. Le rapport a été mis à jour.` | `C'est enregistré. Le rapport du jour est à jour.` |
| 372 | `title="Comparison By Date"` | `title="Chiffres du jour — « Comparison By Date »"` |
| 388 | `title="Forecast By Date Range"` | `title="Prévisions du mois — « Forecast By Date Range »"` |
| 412-414 | `Import refusé :` | `Fichier refusé :` |
| 431 | `Import en cours...` | `Enregistrement…` |
| 433 | `Importer et calculer` | `Enregistrer le rapport` |
| 435 | `Importer le Comparison seul` | `Enregistrer seulement les chiffres du jour` |
| 436 | `Sélectionnez les 2 fichiers` | `Choisis les deux fichiers` |

### 2. `ImportSection.tsx` — modale d'avertissement + garde-fou TVA

| Ligne(s) | Avant | Après |
|----------|-------|-------|
| 479-483 (bloqué non-admin) | `Cet avertissement ne peut pas être forcé depuis ton compte. Reprends l'export en t'assurant qu'il inclut la TVA, ou demande à un admin de vérifier ce fichier.` | `Ce fichier a un problème de TVA. Tu ne peux pas le forcer depuis ton compte : reprends l'export en vérifiant qu'il inclut bien la TVA, ou demande à un administrateur.` |
| 485-488 (peut forcer) | `Forcer un mauvais fichier fausse tes calculs. En cas de doute, recommence l'export.` | (conservé — déjà clair) |
| 468 / 471 | `Quelques points à vérifier` / `Contrôles informatifs, pas forcément un problème` | (conservés) |

Rappel logique (inchangée) : `forceBlocked = !isAdmin && warnings.some(forceRequiresAdmin)`
masque le bouton « Forcer l'import » pour l'hôtelier ; l'admin le garde.

### 3. `ImportSection.tsx` — erreur générique humanisée

Le state `error` (l.296, 329) affiche `err.message` brut (l.419-423). Après l'étape 2,
les erreurs propagées sont déjà humaines ; il reste à humaniser le fallback :

```ts
// Avant : 'Erreur inattendue'
setError(err instanceof Error ? err.message : "Une erreur inattendue s'est produite. Réessaie.")
```

### 4. `ForecastImportButton.tsx` (admin) — avant → après

| Ligne | Avant | Après |
|-------|-------|-------|
| 122 | `Importer un forecast (plusieurs mois ou l'année)` | `Importer des prévisions (plusieurs mois ou l'année)` |
| 128 | `aria-label="Importer un forecast"` | `aria-label="Importer des prévisions"` |
| 142 | `Import du forecast` | `Import des prévisions` |
| 163 | `À vérifier avant d'importer` | (conservé) |
| 202 | `Import refusé` | (conservé) |
| 61 (`fail`) | `err.message` / `'Erreur inattendue'` | message humanisé (comme ImportSection §3) |

Le résumé de succès (l.73-74, « ${n} prévisions enregistrées… ») est déjà clair.

## Ordre d'exécution

1. `ImportSection.tsx` : libellés (§1), puis modale/garde TVA (§2), puis erreur (§3).
2. `ForecastImportButton.tsx` (§4).

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- La page `/repjour` répond (HTTP 200).
- Revue visuelle : zones de dépôt avec libellés clairs + nom exact du fichier en indice ;
  modale d'avertissement lisible ; bouton « Forcer » absent pour un compte non-admin sur
  une alerte TVA ; aucun message d'exception brut visible.
