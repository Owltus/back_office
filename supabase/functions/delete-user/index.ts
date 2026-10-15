// Edge Function `delete-user` — révocation d'un compte par un ADMIN depuis le
// front (/comptes). Pendant de `create-user`.
//
// POURQUOI une Edge Function
//   « Supprimer » un compte doit empêcher la reconnexion. Retirer la seule ligne
//   `profiles` (ce que faisait le front) ne touche PAS `auth.users` : la personne
//   garde son identifiant + mot de passe et peut toujours se connecter. Agir sur
//   `auth.users` exige l'API Admin d'Auth, donc la clé SERVICE_ROLE — SECRÈTE,
//   jamais côté navigateur → elle reste ici, côté serveur.
//
// CHOIX : SUPPRESSION DÉFINITIVE (deleteUser), avec repli sur ban si impossible
//   L'admin veut que le compte disparaisse de `auth.users` (Authentication →
//   Users). On supprime donc l'identité pour de bon. Le backend étant PARTAGÉ
//   avec l'app repjour, la suppression dure peut être bloquée par des données
//   liées (clés étrangères vers auth.users : rapports, audit…). Dans ce cas on
//   ne casse RIEN : on REPLIE sur un ban (~100 ans, réversible) pour au moins
//   couper l'accès, et on le signale à l'appelant.
//
// ORDRE : on retire d'abord la ligne `profiles` (service_role) — sinon la FK
//   `profiles → auth.users` bloquerait la suppression de l'identité — PUIS on
//   supprime `auth.users`. Comptes/identités étant communs aux deux apps, la
//   suppression vaut PARTOUT.
//
// SÉCURITÉ (défense en profondeur) — identique à create-user
//   1. verify_jwt (passerelle) : requête sans JWT valide rejetée en amont.
//   2. Contrôle applicatif : le rôle de l'APPELANT est lu dans `profiles` via
//      service_role ; SEUL un `admin` peut poursuivre (403 sinon).
//   3. Garde anti-auto-exclusion : un admin ne peut pas révoquer son propre compte.

import { createClient } from 'jsr:@supabase/supabase-js@2.115.0'
import { traiter } from './handler.ts'

// Toute la logique vit dans handler.ts (testée par handler.test.ts).
Deno.serve((req) =>
  traiter(req, {
    lire: (n) => Deno.env.get(n),
    creerClient: (url, cle) =>
      createClient(url, cle, {
        auth: { autoRefreshToken: false, persistSession: false },
      }),
  }),
)
