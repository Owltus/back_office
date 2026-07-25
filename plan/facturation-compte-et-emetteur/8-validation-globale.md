# Étape 8 — Validation globale

## Objectif

Vérifier le chantier de bout en bout : types, build, tests, et recette manuelle du parcours complet.

## Fichier(s) impacté(s)

- Aucun fichier nouveau : contrôle transverse (plus les deux nettoyages ci-dessous).

## Travail à réaliser

### 1. Contrôles automatiques

- `npx tsc --noEmit` sans erreur.
- `pnpm build` (vérifier le découpage des chunks ; facturation en `ssr: false`).
- `pnpm test` vert (tests couple + émetteur + SIRET ; wordpool retiré).
- `pnpm lint` (ne pas aggraver l'existant).

### 2. Recette manuelle

- Réimport du référentiel réel, vérifier la présence du compte dans chaque couple.
- Dépôt d'une facture d'un émetteur connu → candidats corrects (par couple).
- Facture d'un émetteur inconnu → saisie manuelle, apprentissage effectif à la validation suivante.
- Cas « gaz » : une facture de climatisation ne propose jamais le gaz de ville.
- Tampon : code + compte visibles sur le PDF.
- Historique : la facture validée y apparaît.

### 3. Nettoyage

- Corriger le commentaire périmé « ProtectedRoute » dans `src/routes/facturation/index.tsx`.
- Vérifier qu'aucune trace du wordpool ne subsiste (grep `wordpool`).

## Critère de validation

- Tous les contrôles automatiques verts.
- La recette manuelle passe sur les six cas ci-dessus.

## Contrôle /borg

Étape critique (validation finale du chantier). Audit :
- Cohérence bout en bout : référentiel ↔ apprentissage ↔ tampon ↔ historique.
- Aucune régression sur les autres pages (tables/RPC touchées bien cloisonnées à facturation).
- Toutes les RPC nouvelles ou modifiées ont garde de rôle + `set search_path = public`.
