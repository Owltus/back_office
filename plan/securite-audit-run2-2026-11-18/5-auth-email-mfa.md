# Étape 5 — Auth : changement d'e-mail et inscription TOTP

## Objectif

Une session restée ouverte ne doit pas permettre de changer l'e-mail du compte ni d'ajouter un code TOTP. Sinon, elle contourne le correctif du mot de passe livré le 17/11. L'app n'utilise ni l'un ni l'autre.

## Fichier(s) impacté(s)

- `supabase/config.toml` (local, il documente la cible)
- Dashboard Supabase de la prod (réglages, accord Q3)

## Travail à réaliser

### 1. Local

- `[auth.email]` :
  - `double_confirm_changes = true` ;
  - `enable_confirmations = true` : sans effet sur les comptes créés par `create-user`, qui ont `email_confirm: true`, ni sur le seed.
- `[auth.mfa.totp]` et `[auth.mfa.phone]` : `enroll_enabled = false` et `verify_enabled = false`.
- Vérifier les noms de clés avec le modèle de `supabase init` du CLI 2.120.
- Ajouter un commentaire : « à reporter à la main dans le dashboard ».

### 2. Essai local

Avec un compte fictif `*@exemple.test` : `PUT /auth/v1/user {"email": ...}` ne doit plus changer l'e-mail sans confirmation, et `POST /auth/v1/factors` doit être refusé.

### 3. Prod (avec l'accord de l'utilisateur, dans le navigateur)

- Authentication > Sign In / Providers > Email : « Confirm email » ON et « Secure email change » ON.
- Authentication > Multi-Factor : TOTP désactivé (inscription et vérification), téléphone désactivé.
- Recharger la page pour vérifier que les valeurs sont bien enregistrées.
- Livrer ensuite avec `--reglages-reportes`, comme le 17/11.

## Fait le 18/11 vers 01 h, par l'assistant, avec l'accord de l'utilisateur

- **Constat avant :** Confirm email était OFF, Secure email change déjà ON, TOTP « Enabled », téléphone Disabled.
- **Vérification avant d'activer Confirm email :** les 6 comptes de la prod se sont tous déjà connectés, donc ils sont confirmés et aucun ne peut être bloqué.
- **Changé :** Confirm email ON, TOTP Disabled.
- **Relu après rechargement :** Confirm email = true, TOTP = Disabled.
- `config.toml` aligné, local à redémarrer (`supabase stop` puis `start`) pour l'essai local.

## Critère de validation

- L'essai local refuse le changement d'e-mail direct et l'inscription TOTP.
- La connexion par mot de passe, la création de compte par un admin et le changement de mot de passe dans /profil marchent toujours.
- Les valeurs du dashboard sont vérifiées après rechargement.
