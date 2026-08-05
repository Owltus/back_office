# Étape 7 — [TOI] Régler 3 options dans le dashboard Supabase (A8)

> Pour TOI. Ces protections ne sont PAS dans le code : ce sont des interrupteurs du
> dashboard Supabase, que seul toi peux activer. 3 réglages, ~5 minutes.

## Pourquoi
Le changement de mot de passe self-service passe par Supabase (GoTrue), pas par
notre code : la seule barrière de robustesse (longueur, complexité, mot de passe
déjà fuité, bourrage) vient de ces réglages. Aujourd'hui ils sont probablement au
minimum par défaut.

## Pas à pas

Va sur : https://supabase.com/dashboard/project/ozpavwghrmmkrnmkxodg
Menu de gauche : **Authentication**.

### Réglage 1 — Politique de mot de passe (A8)
1. **Authentication** → **Policies** (ou **Providers** → **Email** → section « Password »), rubrique **Password Requirements**.
2. **Minimum password length** : mets **12**.
3. **Password strength / required characters** : choisis l'option la plus exigeante disponible (minuscule + MAJUSCULE + chiffre + caractère spécial).
4. **Save**.
   - Objectif : refléter côté serveur les 5 critères déjà exigés par notre UI, pour qu'on ne puisse pas poser un mot de passe faible en contournant le formulaire.

### Réglage 2 — Protection « mot de passe compromis » (HaveIBeenPwned)
1. Même zone **Password Requirements**.
2. Active **Leaked password protection** (« Check against HaveIBeenPwned »).
3. **Save**.

### Réglage 3 — Limitation anti-bourrage (rate limit)
1. **Authentication** → **Rate Limits**.
2. Vérifie que la limite sur **sign-in / token** est bien active (valeur par défaut raisonnable, ex. quelques dizaines/heure). Si elle a été montée très haut, redescends-la à la valeur par défaut.
3. **Save** si tu changes quelque chose.

### Me prévenir
Écris « **dashboard réglé** » (et dis-moi si une option n'existe pas / est nommée autrement dans ton interface, je t'oriente).

## Note
Ces réglages sont côté fournisseur : je ne peux pas les faire ni les vérifier à ta place. Si tu ne trouves pas une option, décris-moi ce que tu vois à l'écran.
