# Étape 3 — Chargement dynamique : découplage store ↔ modèles en dur

## Objectif

Alimenter la liste des modèles depuis Supabase au lieu de la constante `collection`, et découpler l'initialisation du store `afficheStore` des modèles en dur (aujourd'hui il lit `getTemplatesList()[0]` de façon **synchrone à l'import**, ce qui casse dès que les modèles deviennent asynchrones).

## Contexte

Pièges identifiés à l'exploration :
- `buildInitialState()` (`afficheStore.ts:23-43`) et `firstKey = getTemplatesList()[0].key` (`afficheStore.ts:20-21`) s'exécutent au chargement du module → init synchrone incompatible avec un fetch.
- `applyAfficheTemplate(key)` (`afficheStore.ts:57-69`) lit une const figée via `getTemplate(key)` → doit désormais recevoir un **objet `AfficheTemplate` déjà résolu**, pas relire une collection.
- `TEMPLATES = getTemplatesList()` est capturé une fois au module dans `AffichageBoard.tsx:67` → doit venir d'un `useQuery`.
- `selectedTemplate` est un `string` (clé, sentinelle `''`) → devient l'`id` DB (ou `''` quand la saisie diverge du modèle).

Selon **D3** : Option A (`useQuery` + invalidation) recommandée ci-dessous ; Option B (Realtime + optimistic) reprendrait le patron `ParkingBoard` (abonnement `postgres_changes` + réconciliation par id).

## Fichier(s) impacté(s)

- `src/lib/afficheStore.ts` (modification : init neutre, `applyAfficheTemplate` prend un objet)
- `src/components/affiche/AffichageBoard.tsx` (modification : liste via `useQuery`)
- `src/lib/poster/templates.ts` (modification selon D2 : `collection` retirée ou conservée en repli)

## Travail à réaliser

### 1. Init neutre du store

Remplacer `buildInitialState()` fondé sur le premier modèle par un état **neutre** (champs texte vides, `selectedTemplate: ''`, couleur/icône par défaut sûres — ex. `colorKey: 'okko'`, `selectedIcon: 'alert'`). Plus aucune lecture de `collection` au niveau module. Gérer le cas « aucun modèle en base » (l'affiche reste éditable à vide).

### 2. `applyAfficheTemplate` prend un objet résolu

```ts
export function applyAfficheTemplate(t: AfficheTemplate) {
  afficheStore.setState((s) => ({
    ...s,
    titleFr: t.titleFr,
    messageFr: t.messageFr,
    titleEn: t.titleEn,
    messageEn: t.messageEn,
    selectedIcon: t.icon,
    colorKey: t.color,
    selectedTemplate: t.id,
  }))
}
```

Ne copie QUE les 7 champs du modèle ; laisse dates / horaires / tailles / `isAutoSizeMode` intacts (état de session, D4).

### 3. Liste des modèles via `useQuery` (D3 = A)

Dans `AffichageBoard` :

```ts
const { data: templates = [] } = useQuery({
  queryKey: ['affiche', 'templates'],
  queryFn: fetchTemplates,
})
```

Le `Select` de modèles est alimenté par `templates` (value = `id`, label = `name`). `onValueChange` → `applyAfficheTemplate(templates.find((t) => t.id === id))`. Optionnel : au premier chargement, appliquer automatiquement le premier modèle si l'affiche est vierge (effet, sans écraser une saisie en cours).

### 4. Sort de `collection` (D2)

- D2 = A : retirer `collection` / `getTemplatesList` / `getTemplate` de `templates.ts` (ou les réduire au strict type), la source devient la DB. Vérifier qu'aucun autre module ne les importe encore.
- D2 = B : conserver `collection` comme repli local, mais la source d'affichage reste la DB.

## Ordre d'exécution

1. Neutraliser l'init du store (plus de lecture `collection` au module).
2. Adapter `applyAfficheTemplate` pour recevoir un `AfficheTemplate`.
3. Brancher `useQuery(['affiche','templates'])` dans le board, alimenter le `Select`.
4. Traiter `collection` selon D2 ; nettoyer les imports morts.
5. `npx tsc --noEmit`.

## Critère de validation

- Au chargement, la liste déroulante affiche les modèles **venus de Supabase** (7 si seed).
- Choisir un modèle applique bien ses 7 champs ; éditer un champ repasse `selectedTemplate` à `''` (placeholder), sans toucher dates / tailles.
- Aucun crash si la table est vide (affiche éditable à blanc).
- Aucune lecture synchrone de `collection` au niveau module ; `npx tsc --noEmit` passe.
