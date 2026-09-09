# Étape 7 — Validation globale

## Objectif

Vérifier le chantier de bout en bout, sur la base et dans l'application, et
laisser la documentation du projet à jour.

## Contexte

Le chantier touche le chemin de démarrage de l'application et ajoute une
colonne à `profiles`. Deux familles de régressions sont à écarter
explicitement : une redirection qui boucle ou qui envoie sur une page
interdite, et une écriture de profil qui cesserait de fonctionner — la panne du
2026-08-05, restée invisible un mois, était de cette nature. Aucune policy
n'ayant été modifiée par ce chantier, la seconde est peu probable, mais elle se
vérifie en une requête.

## Fichier(s) impacté(s)

- `CLAUDE.md` (modifié)
- `supabase/verif_advisor.sql` (rejoué)
- `supabase/verif_audit_2026-09-06.sql` (rejoué)
- `supabase/verif_complet.sql` (rejoué)

## Travail à réaliser

### 1. Contrôles de base

Rejouer les trois scripts de vérification et les attendre au vert :
`verif_advisor.sql` 11/11, `verif_audit_2026-09-06.sql` 20/20,
`verif_complet.sql`.

Vérifier en plus, par endossement de rôle dans une transaction annulée, qu'un
compte non-admin peut toujours modifier `first_name` sur sa propre ligne.

### 2. Parcours applicatifs

Sur chaque parcours, un compte à une seule page et un compte à sept pages :

- ouverture de la racine ;
- connexion depuis `/login` ;
- ouverture de `/login` avec une session déjà active ;
- clic sur le logo ;
- rechargement direct d'une URL de page ;
- réseau coupé, poste sans cache local.

Aucun de ces parcours ne doit produire de saut visible vers une page
intermédiaire, d'écran blanc, ni de message « Aucun accès » abusif.

### 3. Contrôles automatiques

```
npx tsc --noEmit
pnpm test
pnpm lint
pnpm build
```

Le nombre d'erreurs ESLint ne doit pas augmenter : le dépôt en compte
plusieurs, préexistantes, qui servent de référence.

### 4. Documentation

Mettre à jour `CLAUDE.md` : la section « Authentification » mentionne les
rôles et le gating par page, elle doit dire que l'ordre des pages est désormais
une préférence par compte stockée dans `profiles.page_order`, que la page de
tête vaut page d'accueil, que le réglage est ouvert à l'admin comme à chacun
pour son propre compte, et que l'ordre du registre `PAGES` n'est plus qu'un
repli.

Rappeler qu'une nouvelle clé de page devra être ajoutée à **trois** endroits :
le CHECK de `user_page_permissions`, celui de `profiles.page_order`, et le
registre `pages.ts`.

### 5. Commit

Commit sur `main`, message décrivant la décision de stockage et les angles
tranchés. Push sur demande explicite.

## Critère de validation

- Trois scripts de vérification au vert.
- Six parcours applicatifs sans anomalie, sur deux profils de compte.
- `tsc`, tests, lint et build au vert, sans augmentation du nombre d'erreurs
  ESLint.
- `grep -rn "'/repjour'" src/` ne renvoie plus que le registre `pages.ts`.
- Un ordre réglé depuis `/profil` et un ordre réglé depuis `/comptes` donnent
  le même résultat sur le même compte.
- `CLAUDE.md` décrit le nouveau comportement.

## Contrôle qualité (revue)

Étape critique (dernière du plan, validation globale). Revue manuelle : (1)
relire le diff complet du chantier d'un seul tenant, en cherchant
spécifiquement les chemins de repli qui reliraient la préférence ; (2)
confirmer que la garde de panne de `PageGuard.tsx:94` est intacte et que la
racine se comporte de même ; (3) vérifier qu'aucun script marqué « NE PLUS
REJOUER » n'a été appliqué pendant le chantier ; (4) confirmer que les six
comptes existants sans préférence se comportent exactement comme avant.
