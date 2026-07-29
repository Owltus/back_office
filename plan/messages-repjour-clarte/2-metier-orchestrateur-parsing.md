# Étape 2 — Orchestrateur, parsing, services (métier)

## Objectif

Humaniser tous les messages techniques du flux d'import : `throw new Error(...)` remplis
de jargon (« CSV Comparison », « En-tête index 0 attendu DATE », « TODAY/MTD/OCC/REV »),
messages d'exception Supabase montrés bruts, et échecs silencieux (date illisible rangée
à une fausse date, lecture des destinataires avalée). Objectif transversal : un message
utilisateur SIMPLE, et le détail technique en `console.error` (jamais montré brut).

## Contexte

C'est l'étape la plus large (7 fichiers) et la seule à changer un COMPORTEMENT (refus
d'un fichier sans date, propagation d'erreurs enveloppées). D'où le marquage critique et
l'audit `/borg` final. Attention : ne pas casser les chemins d'erreur existants ni
introduire de dépendance à un texte de message ailleurs.

## Fichier(s) impacté(s)

- `src/lib/repjour/import/orchestrator.ts`
- `src/lib/repjour/parse/comparison.ts`
- `src/lib/repjour/parse/forecast.ts`
- `src/lib/repjour/parse/metrics.ts`
- `src/lib/repjour/parse/date.ts`
- `src/lib/repjour/services/recipients.ts`
- `src/lib/repjour/services/data.ts`
- `src/lib/repjour/sendServer.ts`

## Travail à réaliser

### 1. `orchestrator.ts` — messages avant → après

| Ligne(s) | Avant | Après |
|----------|-------|-------|
| 59, 149 | `Aucune donnée forecast dans le fichier` | `Ce fichier de prévisions est vide. Vérifie que tu as exporté le bon fichier.` |
| 165 | `Erreur sauvegarde forecast : ${error.message}` | `Les prévisions n'ont pas pu être enregistrées. Réessaie dans un instant.` (+ `console.error` du détail) |
| 190-191 | `Le détail du Comparison n'a pas été archivé. Votre rapport est bien enregistré. Cause : ...` | `Le détail du rapport n'a pas pu être enregistré, mais ton rapport du jour est bien sauvegardé.` (+ `console.error`) |
| 227, 412 | `Budget introuvable pour ${month}/${year}` | `Aucun objectif n'est défini pour ${MOIS} ${année}. Ajoute-le dans la gestion budgétaire avant d'importer.` |
| 244-246 | `Lecture du forecast indisponible, projeté non calculable. Réessaie.` | `Impossible de lire les prévisions du mois pour l'instant. Réessaie dans un instant.` |
| 268-269 | `Pas de forecast importé, projeté du mois indisponible.` | `Aucune prévision n'a encore été chargée pour ce mois : les chiffres prévus ne peuvent pas s'afficher.` |
| 280, 426 | préfixe `Rapport invalide :` | `Ce rapport ne peut pas être enregistré :` |
| 379-382 | `Impossible de détecter les types de fichiers. Un fichier Comparison By Date et un Forecast By Date Range sont requis.` | `Impossible de reconnaître les fichiers. Il faut le fichier des chiffres du jour (« Comparison By Date ») et celui des prévisions (« Forecast By Date Range »).` |
| 451-453 | préfixe `Données forecast invalides :` | `Ces prévisions ne peuvent pas être enregistrées :` |
| 320, 494 | `Erreur sauvegarde rapport : ${upsertError.message}` | `Le rapport n'a pas pu être enregistré. Réessaie dans un instant.` (+ `console.error`) |
| 515-516 | `Erreur sauvegarde forecast : ${forecastError.message}` | `Les prévisions n'ont pas pu être enregistrées, mais ton rapport du jour est bien sauvegardé.` (+ `console.error`) |

Le mois en toutes lettres vient de `MONTHS` (`constants.ts`). Ne plus jamais injecter
`error.message` de Supabase dans un texte affiché.

### 2. `parse/comparison.ts`, `parse/forecast.ts`, `parse/metrics.ts` — avant → après

| Fichier:ligne | Avant | Après |
|---------------|-------|-------|
| comparison 12 / metrics 72 | `CSV Comparison vide ou illisible` | `Le fichier des chiffres du jour est vide ou illisible. Recommence l'export.` |
| comparison 27 | `Colonnes TODAY et/ou MTD introuvables dans le CSV Comparison` | `Ce fichier n'a pas le bon format. Vérifie que c'est bien le fichier « Comparison By Date ».` |
| metrics 81 | `Colonne TODAY introuvable dans le CSV Comparison` | `Ce fichier n'a pas le bon format. Vérifie le fichier « Comparison By Date ».` |
| forecast 19 | `CSV Forecast vide ou trop court` | `Le fichier des prévisions est vide ou incomplet. Recommence l'export.` |
| forecast 27-29 | `En-tête index N attendu "X", trouvé "..."` (×3) | Un seul message : `Ce fichier n'a pas le bon format. Vérifie que c'est bien le fichier « Forecast By Date Range ».` (+ `console.error` du détail d'en-tête) |

### 3. `parse/date.ts` — couvrir la date illisible (changement de comportement)

Aujourd'hui, si le nom de fichier ne contient pas de date (`/(\d{4})(\d{2})(\d{2})/`),
`extractReportDate` retombe SILENCIEUSEMENT sur hier → le rapport est rangé à une fausse
date. Proposé : lever une erreur claire.

```ts
// Avant : fallback muet sur new Date()-1 si aucune date dans le nom.
// Après : refus explicite.
if (!match) {
  throw new Error(
    "Impossible de lire la date dans le nom du fichier. Garde le nom d'origine donné par ton logiciel : il contient la date.",
  )
}
```

Note : l'UI (`ImportSection`, étape 3) captera ce cas au dépôt pour l'afficher dans le
slot plutôt que de laisser remonter une exception.

### 4. `services/recipients.ts` et `services/data.ts` — avant → après

| Fichier:ligne | Avant | Après |
|---------------|-------|-------|
| recipients 47, 63 | `Adresse email invalide` | `Cette adresse email n'est pas valide.` |
| data 103 | `Accès refusé : session requise pour cette opération` | `Tu dois être connecté pour faire ça.` |

`recipients.ts` l.37 (lecture en échec journalée puis liste vide) : renvoyer un signal
exploitable par l'UI (ex. relancer l'erreur ou un drapeau) plutôt que d'avaler
silencieusement — l'appelant (étape 4, DashboardBoard) affichera « Impossible de charger
la liste des destinataires. » Conserver `console.error` pour le détail.

### 5. `sendServer.ts` — avant → après

| Ligne | Avant | Après |
|-------|-------|-------|
| 66, 68 | `Échec de l'envoi : ${error.message}` / `${data.error}` | `L'envoi a échoué. Réessaie dans un instant.` (+ `console.error`) |

Le message de succès (l.74-76) reste, éventuellement léger lissage de ton.

## Ordre d'exécution

1. `parse/*.ts` (throws de parsing) et `date.ts` (nouveau refus).
2. `orchestrator.ts` (tableau complet).
3. `services/*.ts` et `sendServer.ts`.
4. Vérifier qu'aucun code ne teste un des textes modifiés (grep des anciennes chaînes).

## Critère de validation

- `npx tsc --noEmit` sans erreur.
- Grep : plus aucune des anciennes chaînes techniques (`CSV Comparison`, `En-tête index`,
  `TODAY`, `${error.message}` dans un texte affiché) dans le flux d'import.
- Un `error.message` Supabase n'apparaît plus dans un message utilisateur ; il est en
  `console.error`.

## Contrôle /borg

Audit après exécution :
- Aucun chemin d'erreur cassé : chaque `throw` reformulé lève toujours au bon endroit,
  et les `catch` appelants reçoivent bien une `Error` (pas un objet nu).
- Le refus « date illisible » (date.ts) ne bloque pas un import légitime dont le nom de
  fichier contient bien la date (vérifier le format `AAAAMMJJ` toujours reconnu).
- Aucune dépendance résiduelle à un texte de message (recherche de `.includes(`,
  `=== '...'` sur les anciennes chaînes) dans tout le dépôt.
- La propagation d'erreur de `recipients.ts` (nouveau signal) ne provoque pas de crash
  chez les appelants qui attendaient une liste vide.
