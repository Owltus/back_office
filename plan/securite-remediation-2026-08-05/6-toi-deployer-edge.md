# Étape 6 — [TOI] Déployer l'Edge Function delete-user

> Pour TOI. L'assistant a modifié le code de `delete-user` (fiche 3) et l'a poussé ;
> il faut envoyer cette nouvelle version à Supabase. Une seule commande. 1 minute.

## Ce que tu vas faire

Mettre à jour UNE fonction existante (`delete-user`) — tu ne crées rien.

## Pas à pas

### 1. Ouvrir un terminal à la racine du projet
Dans le terminal (ou tape `! <commande>` directement ici dans le chat), place-toi
dans le dossier du projet (c'est déjà le cas si tu es dans `back_office`).

### 2. Lancer le déploiement
Tape exactement :
```
supabase functions deploy delete-user
```

### 3. Vérifier le résultat
Attendu, une ligne comme :
```
Deployed Functions on project ozpavwghrmmkrnmkxodg: delete-user
```
- Le message `WARNING: Docker is not running` est **sans importance** (Docker ne sert que pour tester en local).
- Si tu vois une vraie erreur (pas le warning Docker), copie-la-moi.

### 4. Me prévenir
Écris « **delete-user déployée** ».

## Note
`create-user` et `send-report` ont déjà été déployées au pentest #1 — pas besoin d'y retoucher ici, seule `delete-user` a changé.
