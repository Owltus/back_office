# Étape 1 — LLM : voir les changements avant d'importer, refuser un document

## Objectif

Quand on colle la réponse du LLM (bouton accolades `{}`), l'aperçu montre
aujourd'hui la LISTE des documents touchés. Il doit montrer, pour chaque
document modifié, **ce qui change dans le texte** (ajouts en vert, retraits en
rouge, parties inchangées repliées), comme l'Historique, et permettre de
**décocher** un document pour ne pas l'importer.

## Fichier(s) impacté(s)

- `src/components/classeur/dialogs/EchangeJsonDialog.tsx` (aperçu, l. ~430)
- `src/lib/classeur/merge/portee.ts` (plan filtré : exclure des documents)
- `src/lib/classeur/diff.ts` (réutilisé tel quel : `comparerLignes`, `segmenter`, `bilan`)
- `src/components/classeur/dialogs/HistoriqueDocumentDialog.tsx` (extraire le rendu du diff en composant partagé `detail/DiffTexte.tsx`)

## Travail à réaliser

### 1. Composant partagé du diff
Extraire de l'Historique le rendu « lignes ajoutées / retirées / repliées »
en `DiffTexte` (props : ancien, nouveau). L'Historique l'utilise toujours :
aucune différence visible pour lui.

### 2. Aperçu d'import
Pour chaque action « modifier un document » du plan : une ligne repliable
(titre, bilan « +12 −3 », numéro de version qu'il prendra — `evolutionVersion`
— et sa raison), case cochée par défaut ; déplié, le `DiffTexte` du contenu
(et du titre / de la description s'ils changent). « Tout déplier » / « Tout
replier ». Les créations montrent le texte entier en vert ; les suppressions
(option existante) en rouge.

### 3. Refus d'un document
`appliquerFusionPortee(plan, exclus: Set<uuid>)` : les actions des documents
décochés sont retirées du plan AVANT le point de restauration et les
écritures. Bouton « Importer N documents » (compte à jour).

## Critère de validation

- Tests purs : plan filtré sans les exclus ; rien d'écrit pour un exclu.
- Navigateur, SANS écrire : coller un JSON modifié de doc 100 → diff visible,
  décocher → le bouton compte un document de moins ; annuler.
- `npx tsc --noEmit`, `npx vitest run src/lib/classeur`.
