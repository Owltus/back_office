# Étape 5 — Validation globale

## Objectif

Vérifier que l'ensemble du chantier (étapes 1 à 4) est cohérent, compile, passe les
tests, se construit, et se comporte correctement dans le navigateur.

## Fichier(s) impacté(s)

- Aucun (étape de vérification).

## Travail à réaliser

### 1. Vérifications automatiques

```bash
npx tsc --noEmit
npx vitest run
pnpm build
```

Tous doivent passer sans erreur. Si un test de scoring a été modifié volontairement à
l'étape 4, vérifier que le changement est justifié en commentaire.

### 2. Vérification navigateur (scénario de bout en bout)

Avec `pnpm dev` puis la page `/facturation` :

1. Déposer 2-3 PDF « à froid » (base vide/quasi vide). Vérifier le **bandeau de maturité**
   (étape 3) et une confiance non « verte ».
2. Vérifier l'**affichage multi-imputation** (étape 2) sur une facture à plusieurs codes.
3. Tamponner le 1er PDF sur un code, **sans rafraîchir** : le 2e PDF non tamponné et non
   édité doit voir sa détection **se mettre à jour** (étape 1).
4. Modifier à la main l'imputation d'un record, tamponner un autre : le record **édité
   n'est pas écrasé** (D6).
5. Vérifier qu'un émetteur déjà appris ne **verrouille plus** systématiquement son code
   unique au détriment d'un autre plausible (étape 4).

### 3. Prettier

```bash
npx prettier --write src/lib/facturation/*.ts src/components/facturation/*.tsx
```

## Critère de validation

- `npx tsc --noEmit`, `npx vitest run`, `pnpm build` : tous verts.
- Les 5 scénarios navigateur ci-dessus se comportent comme attendu.
- Aucune régression sur le tamponnage/téléchargement PDF ni sur la galaxie.

## Contrôle /borg

Dernière étape → audit global. Auditer :
- **Pas de boucle de rendu** introduite par l'effet de re-détection (étape 1) : vérifier
  les dépendances du `useEffect` et l'absence de re-patch quand le résultat est identique.
- **Dégradation gracieuse préservée** : table absente / rôle insuffisant → l'app reste
  utilisable, le tamponnage/téléchargement fonctionne, l'échec d'apprentissage est signalé
  (D7) et non silencieux.
- **Aucune écriture DB directe** ni DDL introduit (chemin v1 = RPC existantes seulement) ;
  la contrainte « backend partagé, lecture seule côté outillage » est respectée.
- **Tests de scoring** : si des seuils/poids ont changé (étape 4), cohérence entre code,
  commentaires chiffrés et tests mis à jour.
