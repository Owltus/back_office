// Edge Function `create-user` — création d'un compte par un ADMIN depuis le
// front (/comptes), SANS réactiver l'inscription publique Supabase
// (« Allow new users to sign up » reste OFF sur le projet partagé).
//
// POURQUOI une Edge Function
//   Créer un utilisateur avec mot de passe quand l'inscription publique est
//   désactivée exige l'API Admin d'Auth (auth.admin.createUser), qui requiert la
//   clé SERVICE_ROLE. Cette clé est SECRÈTE et ne doit JAMAIS vivre côté
//   navigateur → elle reste ici, côté serveur (injectée par Supabase dans
//   l'environnement de la fonction, jamais committée).
//
// SÉCURITÉ (défense en profondeur)
//   1. verify_jwt (passerelle) : toute requête sans JWT valide du projet est
//      rejetée avant même d'exécuter la fonction.
//   2. Contrôle applicatif : on lit le rôle de l'APPELANT dans `profiles` via la
//      clé service_role ; SEUL un `admin` peut poursuivre. Un super_utilisateur,
//      un utilisateur ou un anonyme est refusé (403). Impossible à contourner
//      depuis le navigateur : la décision est prise côté serveur.
//   3. La fonction ne crée QUE l'identifiant `auth.users` (email confirmé).
//      L'insertion de la ligne `profiles` (avec le rôle choisi) reste côté front,
//      sous la session de l'admin, afin de conserver INTACT le chemin RLS +
//      trigger anti-escalade de rôle déjà en place.
//
// Empreinte sur le backend partagé : identique au flux signUp actuel (seule
// `auth.users` est touchée par la création). Aucune écriture sur les tables
// « repjour ».

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
