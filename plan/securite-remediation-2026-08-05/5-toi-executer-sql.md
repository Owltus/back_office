# Étape 5 — [TOI] Exécuter les 2 scripts SQL

> Cette fiche est pour TOI. L'assistant a écrit les scripts (fiche 1) ; toi tu les
> lances. Aucune connaissance requise : copier-coller-cliquer. Compte 5 minutes.

## Ce que tu vas faire

Exécuter 2 fichiers dans Supabase : d'abord celui qui corrige, ensuite celui qui
vérifie que tout est bien en place.

## Pas à pas

### 1. Ouvrir le SQL Editor
1. Va sur ton dashboard Supabase : https://supabase.com/dashboard/project/ozpavwghrmmkrnmkxodg
2. Dans le menu de gauche, clique **SQL Editor** (icône terminal `>_`).
3. Clique **+ New query** (en haut).

### 2. Jouer le script de correction
1. Sur ton ordinateur, ouvre le fichier **`supabase/remediation_securite_2026-08-05.sql`** (dans le dossier du projet).
2. Sélectionne **tout** son contenu (Ctrl+A) et copie (Ctrl+C).
3. Colle-le dans la zone SQL de Supabase (Ctrl+V).
4. Clique **Run** (ou Ctrl+Entrée).
5. Attendu : en bas, **Success**. Tu peux voir des lignes « NOTICE » (ex. « F2 : CHECK posé ») — c'est **normal**, ce sont des messages d'information, pas des erreurs.
   - Si tu vois **ERROR** en rouge : **ne touche à rien**, copie-moi le message complet, je corrige le script.

### 3. Jouer le script de vérification
1. Clique **+ New query** (nouvelle requête, pour repartir propre).
2. Ouvre **`supabase/verif_securite_2026-08-05.sql`**, copie tout, colle, **Run**.
3. Attendu : un tableau de résultats avec une colonne **`ok`**. **Toutes les lignes doivent afficher `true`.**
   - Si une ligne montre `false` : copie-moi le tableau, je regarde ce qui n'a pas pris.

### 4. Me prévenir
Écris-moi simplement « **SQL fait, tout est true** » (ou colle le tableau si un `false`).

## Ce que tu NE fais PAS
- Ne relance pas les anciens scripts (`remediation_securite_2026-08-04.sql`, etc.) : ils sont déjà passés.
- Ne joue jamais un fichier contenant `drop table` ou `_ROLLBACK` sans que je te le dise.

## En cas de doute
Copie-moi ce que tu vois à l'écran (le message d'erreur ou le tableau). Je prends le relais.
