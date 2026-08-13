# Étape 1 — Hook `useKeySequence` (détection de séquence clavier)

## Objectif

Fournir un hook React réutilisable qui écoute le clavier au niveau `window`, maintient un buffer glissant des dernières lettres tapées, et appelle un callback quand la séquence cible (ex. `automode`) est reconnue — sans champ de saisie visible, façon cheat code. Contrairement à `SecretEffect.tsx`, il déclenche une **action** (callback) et non un effet visuel, et il **ignore les frappes venant d'un champ de saisie**.

## Contexte

Le détecteur de séquence de `src/components/shared/SecretEffect.tsx` (buffer `bufferRef`, `normalize` NFD → `a-z` minuscules, `slice(-target.length)`, comparaison au mot cible) est éprouvé mais couplé au moteur d'effets et **sans garde de focus**. On en reprend la logique dans un hook autonome, en ajoutant la garde `INPUT`/`TEXTAREA` de `src/components/shared/useUndoRedoShortcut.ts` (l.22-23), étendue à `SELECT` et `[contenteditable]`. Le handler est lu via `useRef` pour ne s'abonner qu'une fois (motif partagé par `usePrintShortcut.ts` / `useUndoRedoShortcut.ts`).

Décision D1 : hook dédié plutôt que réutilisation de l'infra easter eggs. On ne refactorise PAS `SecretEffect` dans cette étape (report éventuel, option D1-C).

## Fichier(s) impacté(s)

- `src/components/shared/useKeySequence.ts` (nouveau)

## Travail à réaliser

### 1. Écrire le hook

Signature proposée :

```ts
export function useKeySequence(
  target: string,
  onMatch: () => void,
  options?: { enabled?: boolean },
): void
```

- Normalisation identique à `SecretEffect` : minuscules, suppression des accents (NFD + `\p{Diacritic}`), on ne garde que `a-z`. Le mot cible est normalisé une fois.
- `onMatch` lu via `useRef` (mise à jour à chaque render) pour ne pas ré-abonner l'écouteur à chaque changement de closure.
- Écouteur `keydown` sur `window`, posé dans un `useEffect` (dépendances : `target` normalisé, `options.enabled`), avec cleanup `removeEventListener`.
- Garde de focus (avant tout traitement) :

```ts
const tag = (e.target as HTMLElement | null)?.tagName
if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
if ((e.target as HTMLElement | null)?.isContentEditable) return
```

- Ignorer les touches non-lettres : `if (e.key.length !== 1) return`, puis `const typed = normalize(e.key); if (!typed) return`.
- Buffer glissant : `buffer = (buffer + typed).slice(-target.length)` ; si `buffer === target` → réinitialiser le buffer et appeler `onMatchRef.current()`.
- `options.enabled === false` → ne pas armer l'écouteur (permet de couper l'automode quand la page n'est pas prête).
- Pas de `preventDefault` (lettres normales, aucun conflit navigateur).

### 2. Exports et conventions

Named export uniquement, imports en `#/…` avec extension explicite, simple quotes, pas de point-virgule final (conventions du repo).

## Ordre d'exécution

1. Créer `src/components/shared/useKeySequence.ts`.
2. Reprendre `normalize` de `SecretEffect.tsx` (copie locale ou petit util partagé — copie locale acceptable ici).
3. Vérifier la compilation.

## Critère de validation

- `npx tsc --noEmit` passe.
- Le hook n'a aucune dépendance au moteur d'effets ni à Supabase (pur clavier).
- Revue manuelle : la garde focus couvre `INPUT`/`TEXTAREA`/`SELECT`/`contenteditable`.
