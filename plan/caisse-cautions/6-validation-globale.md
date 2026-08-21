# Étape 6 — Validation globale

## Objectif

Vérifier le chantier de bout en bout : build, tests, typecheck, matrice de rôles, cohérence RLS, et revue de code ciblée sur les points critiques (schéma DB, calcul du fond effectif toujours en direct — y compris pour une feuille déjà clôturée, D4).

## Fichier(s) impacté(s)

Aucun — validation transverse.

## Travail à réaliser

### 1. Build + tests + typecheck

```
npx tsc --noEmit
npx vitest run
pnpm build
```

### 2. Matrice de rôles (manuel, via l'app)

| Rôle / niveau page caisse | Voir les cautions | Créer une caution | Rembourser | Supprimer |
|---|---|---|---|---|
| `lecture` | oui | non | non | non |
| `ecriture` | oui | oui | oui | non |
| `gestion` / admin | oui | oui | oui | oui |

### 3. Scénario de bout en bout

1. Créer une caution (chambre 12, 300 €) aujourd'hui.
2. Vérifier que le fond attendu du jour passe à 450 € (carte + dialogue de clôture, Étape 5).
3. Naviguer sur le jour suivant (encore non clôturé) : le fond attendu y est aussi à 450 € (cascade, Étape 2/3).
4. Rembourser la caution : à partir de ce moment, le fond attendu redescend IMMÉDIATEMENT à 150 € — y compris pour le jour même du remboursement (D3, pas de « jour où elle compte encore »).
5. **Rétroactivité (D4)** : clôturer une feuille SANS caution active, puis créer une caution avec une `taken_date` antérieure à cette feuille déjà clôturée. Revenir sur cette feuille : le fond attendu affiché doit désormais inclure la caution (450 € au lieu de 150 €), et un écart peut apparaître si le compte réel enregistré à l'époque ne l'incluait pas. **Confirmer explicitement avec l'utilisateur, en le lui montrant, que c'est bien le comportement voulu** (un rapport déjà clôturé peut changer d'aspect si on le rouvre après coup) — c'est la conséquence assumée de sa décision D4, mais à valider en conditions réelles avant de considérer le chantier terminé.
6. Rôle non-gestion : tenter de supprimer une caution → refusé (RLS + UI).

### 4. Revue de code ciblée (étapes critiques, en l'absence de `/borg`)

- Étape 1 (SQL) : cohérence des contraintes CHECK, comportement du trigger sur un `UPDATE` qui ne touche pas `status` (cf. Contrôle qualité de l'Étape 1).
- Cette étape (validation globale) : relire l'ensemble du diff avec le skill `code-review` avant tout commit, en particulier la logique de `effectiveFundTarget`/`isCautionActiveOn` (borne EXCLUSIVE au remboursement, D3) et la bonne mise à jour de TOUS les appelants de `fundEcart`/`isBalanced` (nouvelle signature, Étape 2) — un appelant oublié fausserait silencieusement un écart affiché.

## Critère de validation

- Build vert, tests verts, tsc propre.
- Les 6 points du scénario de bout en bout confirmés manuellement, en particulier le point 5 (rétroactivité) validé EN DIRECT avec l'utilisateur.
- Revue de code sans finding bloquant sur les étapes 1 et 2.
