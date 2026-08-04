# Étape 6 — F2 : contrainte de format sur `email_recipients`

## Objectif

Poser le CHECK serveur qui empêche une adresse mal formée de détourner l'URL
`mailto:` (ajout de destinataires/paramètres). Le CHECK est déjà rédigé mais laissé
en commentaire (« optionnel ») dans deux fichiers.

## Contexte

`src/lib/repjour/email.ts` interpole `toList`/`ccList` BRUTS dans l'URL `mailto:`.
Un compte de niveau `gestion` (repjour) peut, via PostgREST direct, insérer une
adresse contenant `? & # , < > "` ou des espaces -> détournement au clic « Envoyer
par email » de n'importe quel utilisateur. La seule garantie non contournable est
un CHECK serveur. Il n'a jamais été activé car un CHECK sur une table contenant
déjà une ligne non conforme échoue -> d'où le contrôle préalable (Étape 2, requête 4).

## Fichier(s) impacté(s)

- `supabase/email_recipients_email_format.sql` (décommenter)
- `supabase/email_recipients_rls_hardening.sql` (section optionnelle — cohérence)
- `src/lib/repjour/email.ts` (encodage défensif, par acquit de conscience)

## Travail à réaliser

### 1. Prérequis (Étape 2, requête 4)

Confirmer que la requête des lignes non conformes renvoie **0 ligne**. Sinon,
corriger/supprimer ces adresses d'abord (opération ciblée, à confirmer avec
l'utilisateur car c'est une écriture de données).

### 2. Décommenter et exécuter le CHECK

```sql
alter table public.email_recipients
  drop constraint if exists email_recipients_email_format;
alter table public.email_recipients
  add constraint email_recipients_email_format
  check (email ~ '^[^\s@;,?&#<>"]+@[^\s@;,?&#<>"]+\.[A-Za-z]{2,}$');
```

### 3. Encodage défensif côté client (F2, complément)

Dans `src/lib/repjour/email.ts`, encoder chaque adresse (`encodeURIComponent`) lors
de la construction de l'URL `mailto:` plutôt que d'interpoler `toList` brut —
ceinture + bretelles avec le CHECK serveur.

## Ordre d'exécution

1. Contrôle 0 ligne non conforme (Étape 2).
2. Jouer les deux `alter table`.
3. Adapter `email.ts` (encodage), committer.

## Critère de validation

- `insert into email_recipients (email) values ('a@b?x=1')` est REJETÉ par la contrainte.
- Une adresse normale (`nom@domaine.fr`) passe toujours.
- L'envoi d'email repjour fonctionne (adresses valides).

## Contrôle /borg

Auditer : (1) la regex n'exclut pas de faux positifs légitimes (adresses réelles
utilisées) ; (2) la contrainte est bien posée sur la table live (pas seulement dans
le dépôt) ; (3) l'encodage client ne casse pas les adresses valides.
