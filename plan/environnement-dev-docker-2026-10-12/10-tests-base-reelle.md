# Étape 10 — Tests sur la vraie base locale

## Objectif

Tester enfin la sécurité RÉELLE (RLS, RPC privilégiées, contraintes) au lieu
de son imitation : jusqu'ici, aucun test ne touchait une base (audit Martin du
2026-09-15 : « couche RLS jamais testée faute de base locale »).

## Fichier(s) impacté(s)

- `supabase/tests/*.test.sql` (pgTAP, nouveaux)
- `src/lib/classeur/test/simulateurSupabase.ts` (corrigé si un écart est
  trouvé)
- `package.json` (`test:db` = `supabase test db`)

## Travail à réaliser

1. **Matrices RLS** : table × opération (select, insert, update, delete) ×
   compte de test (étape 5) × fenêtre (`*_rls_fenetre_*` : dans la fenêtre,
   juste hors fenêtre). Exhaustif sur les refus, pairwise sur les
   autorisations. Oracle : `42501`, ou 0 ligne pour un update refusé.
2. **RPC `private`** : gardes NULL (`admin_update_password` et
   `set_user_grade` appelés par un compte sans profil → refus), dernier admin.
3. **Contraintes** : `parking_no_overlap` (reprise de
   `parking_test_no_overlap.sql`), cases PDJ plafonnées, feuilles clôturées
   figées.
4. **Classeur** : la matrice d'accès par classeur (`verif_classeur_acces.sql`
   en pgTAP), les policies storage.
5. **Simulateur** : rejouer 5 scénarios du simulateur Classeur contre la
   vraie base et comparer les résultats ; tout écart est corrigé dans le
   simulateur, puisque c'est la base qui fait foi.

## Phase de test /martin

- Chaque test en transaction annulée (pgTAP).
- Mutations posées à la main, au moins 3, toutes ATTRAPÉES : une policy
  passée en `using (true)`, une garde `is distinct from` passée en `<>`, une
  fenêtre élargie d'un jour.

## Critère de validation

- `pnpm test:db` vert, trois fois de suite après `db reset`.
- Les 3 mutations sont attrapées (preuve dans le bilan).
- Commit sans push.
