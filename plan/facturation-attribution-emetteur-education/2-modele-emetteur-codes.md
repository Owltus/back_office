# Étape 2 — Modèle émetteur→codes (métier pur)

## Objectif

Créer la structure de données et la logique PURE (sans React/DOM/Supabase) du signal
« filtre fort par émetteur » : une co-occurrence `émetteur × code → count`, un prior
`P(code | émetteur)`, et une maturité par émetteur (garde-fou anti sur-apprentissage à
froid, décision **D6**). Aucune persistance à ce stade — logique testable en Node.

## Contexte

Diagnostic confirmé par les agents détection et DB : aucun modèle émetteur→codes n'existe.
Le seul signal émetteur est l'injection de tokens dans le pull global (`addStrong`, poids 2)
— noyé, non exploitable comme filtre. On construit ici l'axe séparé (anti-collapse : un
émetteur multi-codes garde sa distribution `{codeA:8, codeB:5}` au lieu d'un vote unique).

## Fichier(s) impacté(s)

- `src/lib/facturation/issuerCodes.ts` (nouveau, pur)
- `src/lib/facturation/facturation.test.ts` (tests du prior + maturité)

## Travail à réaliser

### 1. Type et prior

```ts
/** Co-occurrence apprise émetteur → codes (compteurs de confirmations). */
export interface IssuerCodes {
  perIssuer: Record<string, Record<string, number>> // issuer (clé normalize) → { code: count }
}

/** Prior P(code | émetteur) = count(code) / Σ counts. Vide si émetteur inconnu. */
export function issuerPrior(model: IssuerCodes, issuerKey: string): Record<string, number>
```

### 2. Maturité par émetteur (garde-fou D6)

```ts
export const ISSUER_STRONG_MIN = 3 // confirmations avant filtre fort (à calibrer)

export interface IssuerMaturity {
  total: number            // Σ counts pour cet émetteur
  distinctCodes: number    // nb de codes distincts vus
  concentrated: boolean    // total >= ISSUER_STRONG_MIN ET 1 seul code dominant
  strong: boolean          // total >= ISSUER_STRONG_MIN (prior digne d'un filtre)
}

export function issuerMaturity(model: IssuerCodes, issuerKey: string): IssuerMaturity
```

### 3. Helpers d'apprentissage (pur, miroir du delta serveur)

```ts
export function learnIssuerCodes(model: IssuerCodes, issuerKey: string, codes: string[]): IssuerCodes
export function mergeIssuerCodes(a: IssuerCodes, b: IssuerCodes): IssuerCodes
```

Ces helpers servent au patch optimiste du cache (étape 5), pas à écrire en base.

## Ordre d'exécution

1. Créer `issuerCodes.ts` (types + `issuerPrior` + `issuerMaturity` + helpers).
2. Écrire les tests : prior normalisé à 1, émetteur inconnu → `{}`, maturité
   `strong`/`concentrated` selon seuils, `learnIssuerCodes` incrémente bien.
3. `npx tsc --noEmit` puis `npx vitest run src/lib/facturation`.

## Critère de validation

- `issuerPrior` renvoie une distribution qui somme à 1 pour un émetteur connu, `{}` sinon.
- `issuerMaturity` distingue émetteur immature / mûr / concentré selon `ISSUER_STRONG_MIN`.
- Aucune dépendance React/DOM/Supabase dans `issuerCodes.ts` (métier pur).
- `npx tsc --noEmit` et `npx vitest run` verts.
