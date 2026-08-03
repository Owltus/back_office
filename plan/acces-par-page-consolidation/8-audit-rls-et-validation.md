# Étape 8 — Audit RLS complet + validation

## Objectif

Vérifier que, page par page et action par action, la garde UI et la RLS serveur
coïncident sur le bon seuil (`lecture ≥ 1`, `ecriture ≥ 2`, `gestion = 3` + fenêtres
temporelles), puis valider l'ensemble du chantier (types, build, tests).

## Contexte

Le durcissement sécurité a déjà un tableau de bord `supabase/verif_securite.sql`
(8/8 OK au 2026-07-27). Ce chantier ajoute des dimensions (fenêtre temporelle
parking, réouverture rapro gestion, gating facturation, DELETE affichage). L'audit
final étend ce tableau de bord et sert de porte de sortie.

## Fichier(s) impacté(s)

- `supabase/verif_securite.sql` (modifié — nouveaux contrôles)
- (revue transverse, pas de nouveau code applicatif)

## Travail à réaliser

### 1. Matrice de contrôle UI ⇄ RLS

Dresser et vérifier, pour chaque page, que chaque action mutante est gardée aux
deux niveaux (client + serveur) :

| Page | Action | Niveau attendu | Garde UI | Garde RLS |
|------|--------|----------------|----------|-----------|
| parking | modifier résa d'actualité | ecriture | ✓ | ✓ (≥2 + fin ≥ J−7) |
| parking | modifier résa figée (> 7 j) | gestion | ✓ | ✓ (= gestion) |
| caisse | rouvrir feuille clôturée | gestion | ✓ (déjà) | ✓ (déjà) |
| rapro | rouvrir jour validé | gestion | ✓ (étape 5) | ✓ (RPC gestion) |
| facturation | *(différé — hors périmètre)* | — | n/a | RPC ≥2 déjà en place |
| affichage | supprimer template | gestion | ✓ (étape 6) | ✓ (DELETE = gestion) |
| repjour (budget) | éditer budget | gestion | ✓ (étape 7, `repjour:gestion`) | ✓ (RLS `budget` migrée) |
| repjour | envoyer par email | ecriture | ✓ (étape 6) | n/a (pas de table) |

### 2. Étendre `verif_securite.sql`

Ajouter des requêtes de contrôle (renvoyant un verdict OK/KO) :
- Les policies d'écriture parking portent bien la borne `(start_date + nights) >=
  current_date - 7` sur INSERT/UPDATE/DELETE, avec `with check` sur INSERT/UPDATE.
- La réouverture rapro (RPC) exige `gestion`.
- `affiche_templates` n'a plus de policy `get_user_role(...)`.
- La table `budget` est bornée par `repjour:gestion` (plus de `get_user_role() = 'admin'`).
- Aucun compte `super_utilisateur` résiduel.

### 3. Validation applicative

- `npx tsc --noEmit` — 0 erreur (hors avertissement lint préexistant connu).
- `pnpm build` — OK, découpage des chunks inchangé.
- `npx vitest run` — tous verts, y compris les nouveaux `editability.test.ts` et
  les tests rapro.
- Revue manuelle : se connecter avec un compte `lecture`, un `ecriture`, un
  `gestion` sur parking/caisse/rapro/facturation et vérifier les boutons visibles.

## Ordre d'exécution

1. Remplir la matrice, corriger tout écart détecté.
2. Étendre `verif_securite.sql`, l'utilisateur l'exécute (doit être tout-OK).
3. tsc / build / vitest.
4. Revue navigateur par niveau.

## Contrôle /borg

Dernière étape (validation globale) — critique par nature. Auditer :
- Aucune action mutante sans double garde (UI + RLS) dans la matrice.
- `verif_securite.sql` renvoie OK sur tous les nouveaux contrôles.
- Pas de régression sur les 8/8 contrôles historiques.
- Le comportement « lecture voit l'analytique, écriture édite l'actualité, gestion
  rouvre le passé » est vérifié en navigateur sur au moins parking + une autre page.
