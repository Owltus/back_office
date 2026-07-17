# Plan — Facturation : imputation auto par nuages de mots (Supabase)

## Contexte

Faire évoluer la détection d'imputation d'un simple matching de mots-clés vers un
**apprentissage statistique par « nuages de mots »**, à **poids 100 % automatiques**,
**stocké sur Supabase** (pas de localStorage). Principe voulu par l'utilisateur :

- Chaque code d'imputation possède un **sac de mots** (fréquences de tokens),
  alimenté **à chaque validation** d'une facture (le tamponnage = vérité terrain :
  les codes finalement gardés).
- Une nouvelle facture : ses mots **votent**, pondérés automatiquement — un mot
  répandu sur beaucoup de codes vaut ~0 (ignoré), un mot rare ET concentré sur peu
  de codes vaut fort, un mot vu une seule fois est ignoré (bruit).
- Résultat : une **vraie probabilité** par code, **multi-imputation** (on
  pré-sélectionne tous les codes au-dessus d'un seuil), et **abstention** honnête
  quand la preuve est mince. Explicable (on peut montrer les mots qui ont voté).
- **Sans IA / sans embeddings** : c'est de la statistique de fréquences (TF-IDF /
  Bayes naïf), transparente et auditable.

Contrainte projet (critique) : backend Supabase **partagé, lecture seule côté
outillage**. On applique le précédent `caisse_sheets` — **table dédiée nouvelle,
préfixée, SQL exécuté par l'utilisateur** (jamais l'assistant), RLS, apprentissage
par **fonction RPC `SECURITY DEFINER`** à garde d'autorisation interne. La feature
facturation n'avait **aucune** connexion Supabase jusqu'ici : c'est son premier
branchement réseau.

Principe de robustesse retenu : la **graine** (mots des `SEED_RULES` + `hint` des
`BUDGET_LINES`) est calculée **côté client, toujours disponible**. Les nuages
Supabase sont **additifs par-dessus**. Donc l'imputation fonctionne dès le jour 1
(et même si la table n'est pas encore créée), et s'affûte à mesure des validations.

**Taille bornée (anti-monstre).** On ne stocke NI les PDF NI leur texte : seulement
des compteurs de tokens **agrégés par code**. 250 PDF (ou 2500) se réduisent aux
mêmes ~55 nuages de quelques centaines de mots — la taille du modèle dépend du
**vocabulaire métier** (qui sature), pas du nombre de factures. Aucune table par
document, rien de reconstructible. L'ordre vient d'une **hygiène stricte des tokens**
(étape 2 : on écarte chiffres/dates/montants/n°, stop-words, hapax, mots ubiquitaires ;
on plafonne à top-K par code ; on sature les répétitions) et d'un **élagage
périodique** (étape 1), pas d'un stockage exotique.

---

## Angles à clarifier

**D1 — Modèle de scoring. Concerne l'étape 2.**
- **Option A retenue (recommandée)** : **TF-IDF + centroïde cosinus**. L'IDF encode
  DIRECTEMENT la « concentration » voulue ; robuste à la longueur des factures ;
  s'amorce bien depuis les `hint` ; très explicable (contribution `tf·idf` par mot).
  Proba d'affichage par **softmax** des scores ; pré-sélection multi-label par
  **un-contre-tous seuillé** (une facture peut légitimement toucher 2 postes).
- **Option B** : Bayes naïf multinomial (posterior = vraie proba native), mais prior
  fragile au démarrage et moins aligné sur le mental model « poids par concentration ».

**D2 — Stockage du modèle. Concerne l'étape 1.**
- **Option A retenue (recommandée)** : table en **lignes `(code, token, count)`**.
  Incrément atomique natif via RPC `... on conflict (code, token) do update set
  count = count + excluded.count` — delta only, pas de read-modify-write, sûr en
  concurrence. Lecture du vocabulaire via pagination `.range()` (déjà maîtrisée).
- **Option B** : document JSONB par code. Lecture d'un bloc simple, mais écriture
  concurrente délicate (races) et write-amplification. Écartée.

**D3 — Déclencheur d'apprentissage. Concerne l'étape 5.**
- **Option A retenue (recommandée)** : apprendre au **tamponnage** (`handleStamp`
  réussi), sur `record.codes` (codes finaux après édition humaine). Garde
  d'idempotence (flag `learned` sur `InvoiceRecord`) pour ne pas compter deux fois.
- **Option B** : apprendre au bouton « Mémoriser » seulement. Convergence plus lente.

**D4 — Articulation avec la mémoire d'émetteur existante. Concerne l'étape 4.**
- **Option A retenue (recommandée)** : **superposition**. La mémoire d'émetteur
  (validation humaine explicite) reste **prioritaire et déterministe** ; les nuages
  **complètent/suggèrent** et fournissent la vraie proba quand aucune règle apprise
  ne tranche. On ne dilue jamais une vérité terrain dans un vote statistique.
- **Option B** : remplacement (tout par les nuages). Régression, déconseillée.

**D5 — « Pas de localStorage » : migrer aussi la mémoire d'émetteur ? Étape 4/5.**
La mémoire d'émetteur vit aujourd'hui en `localStorage`
(`facturation:regles-apprises`). L'utilisateur veut « pas de localStorage ».
- **Option A retenue (recommandée)** : traiter le **nom d'émetteur comme un token
  très fort** versé dans les nuages Supabase au tamponnage → un seul système
  d'apprentissage, tout sur Supabase, plus de localStorage. Le champ « Émetteur »
  reste (il ajoute son nom comme token concentré).
- **Option B** : garder deux systèmes (émetteur en localStorage + nuages Supabase).
  Contredit « pas de localStorage ». À éviter.

**D6 — Confidentialité / rétention (rodin). Transverse.**
Les nuages stockent du **vocabulaire issu de vraies factures** (noms de
fournisseurs, termes métier) sur une base **partagée avec une autre app en prod**.
À confirmer par l'utilisateur : est-ce acceptable ? Prévoir un **élagage** des
tokens rares/anciens et un plafond de vocabulaire. (Ce sont des fragments de mots,
pas des documents, mais la décision doit être explicite.)

**D7 — Seuils d'abstention (rodin). Concerne l'étape 2.**
Impossibles à calibrer finement sans corpus réel. **Recommandé** : démarrer
**conservateur** (le système actuel ne s'abstient jamais — tout ajout est un
progrès), seuils centralisés et faciles à ajuster (`τ_min`, `τ_margin`).

**D8 — Rupture de contrat sur `confidence`. Concerne les étapes 3-4.**
Passer d'une confiance heuristique à une vraie proba **change la distribution** :
les paliers de couleur de `DetectionCard` (0,75 / 0,5) et 2 assertions de test
(`confidence > 0.5`, `≥ 0.75`) devront être **recalibrés**. Impact assumé.

**D9 — Tokenisation : maison vs clé en main. Concerne l'étape 2.**
Des solutions open source existent (`natural` en Node : TF-IDF/Bayes ; Postgres FTS
`to_tsvector('french')` : lemmatisation + stop-words FR intégrés).
- **Option A retenue (recommandée)** : tokeniseur **maison** minimal (~40 lignes) —
  contrôle total de ce qui entre (filtres, plafond, élagage), explicabilité, zéro
  dépendance, tourne hors-ligne sur la graine. Un classifieur clé en main stocke un
  modèle **opaque**, difficile à élaguer/inspecter (le « monstre » à éviter).
- **Option B (upgrade qualité)** : lemmatisation Postgres FTS français côté serveur
  (« ascenseurs » → « ascenseur »). Mieux, mais le scoring client devrait passer par
  une RPC de tokenisation (perte du hors-ligne) ou diverger. À garder en réserve.

**D10 — Visualisation 3D / temporelle. DIFFÉRÉE, hors périmètre v1.**
Pas de 2D (refusé). La **3D** est faisable **sans IA** (Three.js + placement classique
force-directed / MDS sur la co-occurrence, aucun embedding). La **4ᵉ dimension
temporelle** (rejouer la croissance des nuages) est possible mais impose de GARDER un
**historique** (snapshots périodiques ou journal d'événements) → stockage + complexité
en plus. **Recommandé** : visualisation en **module séparé ultérieur** qui LIT le
modèle ; le cœur ne doit pas être dicté par la visu. N'ajouter l'historique 4D que si
on décide vraiment de la faire (voir « Extensions différées »).

---

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-schema-supabase-wordpool.md](./1-schema-supabase-wordpool.md) | SQL : table `facturation_wordpool` + RLS + RPC (exécuté par l'utilisateur) | — | P0 | 1h | `supabase/facturation_wordpool.sql` prêt à exécuter | ⚠ |
| 2 | [2-module-wordpool.md](./2-module-wordpool.md) | Métier pur : tokenisation, poids IDF, scoring, abstention | — | P0 | 2h | `lib/facturation/wordpool.ts` + tests | |
| 3 | [3-service-cache.md](./3-service-cache.md) | Service Supabase + lecture cachée (useQuery) + graine additive | 1, 2 | P0 | 1h30 | `lib/facturation/cloudService.ts`, modèle chargé/caché | |
| 4 | [4-integration-detect.md](./4-integration-detect.md) | Fusion nuages ↔ détection existante (émetteur prioritaire) | 2, 3 | P0 | 1h30 | `detect()` produit proba + codes + mots votants | |
| 5 | [5-apprentissage-ui.md](./5-apprentissage-ui.md) | Apprentissage au tamponnage (RPC delta) + card proba/abstention | 3, 4 | P0 | 1h30 | Apprentissage réel + card explicable | |
| 6 | [6-validation-globale.md](./6-validation-globale.md) | Validation | 1, 5 | P0 | 45 min | tsc + tests + build + vérif | ⚠ |

---

## Ordre d'exécution

- **Sprint données** : étape 1 (SQL, à faire exécuter par l'utilisateur) en parallèle
  de l'étape 2 (module pur, indépendant de la DB).
- **Sprint intégration** : 3 → 4 → 5 (séquentiel).
- **Clôture** : étape 6.

Note : les étapes 2-5 sont **buildables et testables** même avant que le SQL de
l'étape 1 soit exécuté, grâce à la graine côté client (dégradation gracieuse). Le
gain « corpus partagé » n'apparaît qu'une fois la table créée et alimentée.

---

## Architecture cible

```
supabase/
  facturation_wordpool.sql   (NOUVEAU) table (code,token,count) + RLS + RPC learn/read — EXÉCUTÉ PAR L'UTILISATEUR
src/lib/facturation/
  wordpool.ts       (NOUVEAU) PUR : tokenize, idf, score→proba, abstain, mergeSeed
  cloudService.ts   (NOUVEAU) fetchClouds() / learnClouds() via supabase (.rpc)
  detect.ts         détection = émetteur/seed prioritaire + nuages en soutien
  types.ts          Detection += { scores?, votingWords?, abstained? } ; InvoiceRecord += learned
  constants.ts      SEED_RULES + hint = graine des nuages (inchangé, réutilisé)
src/components/facturation/
  FacturationBoard.tsx  useQuery(['facturation','clouds']) → passe le modèle à detect
  InvoicePanel.tsx      handleStamp → apprentissage RPC (garde idempotence)
  DetectionCard.tsx     vraie proba + mots votants + état « abstention »
```

---

## Extensions différées (hors périmètre v1)

- **Visualisation 3D** (D10) : galaxie de nuages en Three.js, positions par layout
  classique (force-directed / MDS sur la co-occurrence des tokens) — sans IA. Module
  en LECTURE seule du modèle, à ajouter plus tard sans toucher au cœur.
- **4ᵉ dimension temporelle** : rejeu de la croissance des nuages. Nécessite un
  historique — option la plus légère = **snapshots périodiques** (table
  `facturation_wordpool_snapshot(date, code, token, count)` échantillonnée), plutôt
  qu'un journal d'événements complet. À décider seulement si la 3D est adoptée.
- **Lemmatisation FTS française** (D9-B) : upgrade qualité de la tokenisation.

---

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB | — | `supabase/facturation_wordpool.sql` |
| Métier (lib) | `detect.ts`, `types.ts`, `facturation.test.ts` | `wordpool.ts`, `cloudService.ts` |
| Composants (UI) | `FacturationBoard.tsx`, `InvoicePanel.tsx`, `DetectionCard.tsx` | — |
| Réutilisés (sans modif) | `constants.ts` (graine), `lib/supabase.ts`, `lib/query.ts` | — |
| **Total** | **7 modifiés** | **3 nouveaux** |
