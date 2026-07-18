# Plan — Attribution des imputations : filtre fort par émetteur + éducation pure

## Contexte

L'attribution des imputations comptables (onglet Facturation) doit être pilotée par
l'ÉDUCATION du pull de mots — les imputations se déduisent des MOTS TROUVÉS DANS LE
DOCUMENT, jamais des libellés/descriptions des imputations. Le système part de ZÉRO,
s'éduque au fil des tamponnages, reconnaît les patterns récurrents et propose la
meilleure imputation. Il faut ajouter un axe manquant : un FILTRE FORT par ÉMETTEUR —
un même émetteur revient avec des imputations récurrentes, ce signal doit conditionner
les codes candidats.

- **Émetteur = axe absent aujourd'hui** : le nom d'émetteur est seulement injecté comme
  quelques tokens dans le pull global (`addStrong`, poids 2), noyé dans le TF-IDF. Il
  n'existe AUCUN modèle « émetteur → codes ». Le dictionnaire `facturation_issuers` ne
  sert qu'au pré-remplissage du champ, jamais au scoring.
- **Fuites de libellé restantes** dans `SEED_RULES` : `alcool`, `chauffage urbain`,
  `blanchissage`/`location linge`, `gardiennage` — mots génériques qui recoupent le
  libellé de la ligne (`gaz`/`electricite` déjà retirés). À traiter selon le principe.
- **Anti-collapse** : un émetteur multi-articles (livre alcool ET food ET matériel) ne
  doit pas voir tous ses articles imputés au même code. Le signal émetteur doit rester
  SÉPARÉ du pull de mots (distribution `{codeA:8, codeB:5}`), pas l'amplifier dedans.
- **Contrainte CLAUDE.md** : backend Supabase PARTAGÉ, LECTURE SEULE côté outillage ;
  écritures UNIQUEMENT via RPC `SECURITY DEFINER` avec garde de rôle ; tout SQL est
  exécuté par l'UTILISATEUR dans Supabase, jamais par l'assistant.

---

## Angles à clarifier

**Décisions tranchées par l'utilisateur** : D5 = plan complet (filtre émetteur) ;
D1 = retirer TOUTES les génériques (alcool + chauffage + linge + gardiennage) ;
D4 = GARDER `addStrong` (modèle émetteur→codes additif, galaxie inchangée) ;
D2 = garder la clé `normalize()` (pas de migration). D3 (calibrage) reste à ajuster
à l'usage sur la vraie base.

**D1 — Ampleur du retrait des règles « mot-clé = libellé ». Concerne l'étape 1.**
- **Option A retenue (recommandée)** : retirer TOUTES les règles génériques recoupant le
  libellé — `alcool`, `chauffage` (« chauffage urbain »), `linge` (« blanchissage »,
  « location linge »), et le mot `gardiennage` de la règle `prestataires` (garder `loomis`).
  Cohérent avec le principe « pas d'attribution par le nom de la ligne ».
- **Option B** : ne retirer que `alcool` (le seul explicitement nommé). Plus prudent,
  mais laisse trois court-circuits par libellé.
- Justification A : `chauffage urbain`/`blanchissage`/`gardiennage` sont des mots de la
  ligne, pas des fournisseurs — même défaut que `gaz`. Divergence des agents : l'agent
  détection les liste toutes ; l'agent tests ne visait que `alcool`.

**D2 (rodin) — Clé émetteur : `normalize` vs `normalizeIssuer`. Concerne les étapes 2, 3, 5.**
- **Option A retenue (recommandée)** : garder la clé actuelle `normalize(supplierName).trim()`
  pour la v1 (celle déjà utilisée par `facturation_issuers` déployé) → pas de migration de
  clés. Le modèle émetteur→codes hérite de la même clé.
- **Option B (différée)** : aligner sur `normalizeIssuer` (retrait suffixes juridiques :
  « martin sarl » = « martin ») — meilleure dédup, mais migration des clés existantes,
  moins réversible. À réévaluer une fois la base éduquée.
- Divergence des agents : agents détection ET DB signalent tous deux l'incohérence de clé
  comme risque de doublons — mais la corriger déborde du chantier.

**D3 — Forme de combinaison prior émetteur × proba mots. Concerne l'étape 4.**
- **Option A retenue (recommandée)** : multiplicative douce `probaFinale = probaMots ×
  (ε + prior)` avec `prior = P(code|émetteur)`, PLUS un filtre dur uniquement quand
  l'émetteur est MÛR et CONCENTRÉ (mono-code confirmé). Émetteur multi-codes → prior en
  simple départage (anti-collapse). Émetteur absent/immature → comportement actuel (mots
  seuls).
- **Option B** : filtre dur systématique (ne garder que les codes déjà vus pour l'émetteur)
  — risque de figer une erreur précoce et d'exclure un code légitime nouveau.
- **Option C** : boost additif — plus difficile à calibrer, mélange les échelles.
- Justification : la forme exacte et les seuils demandent un calibrage empirique sur la
  vraie base OKKO (non disponible ici) — valeurs de départ à ajuster à l'usage.

**D4 — Faut-il retirer l'injection de l'émetteur dans le pull de mots (`addStrong`) ?
Concerne l'étape 5.**
- **Option B RETENUE** : GARDER `addStrong(SUPPLIER_WEIGHT)`. Le modèle émetteur→codes est
  donc ADDITIF (un nouveau prior), le pull continue de recevoir le nom d'émetteur comme
  avant. Conséquence : la galaxie n'a PAS à être recâblée (elle reste alimentée par les
  tokens du pool), et `wordpool.ts`/`SUPPLIER_WEIGHT` ne changent pas. Léger double
  comptage assumé, aucun risque de régression galaxie.
- Option A (écartée) : retirer `addStrong` + alimenter la galaxie depuis le nouveau modèle.
  Plus propre mais touche la galaxie — écarté pour limiter le risque.

**D5 (rodin) — Le modèle émetteur séparé est-il justifié maintenant ?**
- Alternative moins coûteuse : se contenter du pull de mots (déjà en place) + retrait des
  règles-libellé (étape 1), SANS nouvelle table/RPC/intégration. Le pull TF-IDF capture
  déjà indirectement l'émetteur (ses tokens récurrents).
- Contre-argument (retenu) : l'utilisateur demande explicitement un FILTRE FORT par
  émetteur, et le pull dilue ce signal (poids 2, noyé). Le modèle séparé est le seul moyen
  d'un prior fort sans collapse. Mais c'est le poste le plus coûteux du plan (DB + RPC +
  intégration + galaxie) — à valider comme prioritaire.

**D6 (rodin) — Sur-apprentissage émetteur à froid.**
- « Partir de zéro » signifie 1-2 exemples par émetteur au début → un émetteur mono-code
  figerait une imputation sur très peu de preuves. Un garde de MATURITÉ par émetteur
  (analogue à `maturity`) est nécessaire : ne filtrer fort qu'au-delà de N confirmations,
  sinon simple biais léger. Intégré à l'étape 4.

---

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-retrait-regles-libelle.md](./1-retrait-regles-libelle.md) | Retrait des règles mot-clé = libellé | — | P0 | 30 min | `SEED_RULES` sans court-circuit par libellé | |
| 2 | [2-modele-emetteur-codes.md](./2-modele-emetteur-codes.md) | Modèle émetteur→codes (métier pur) | — | P0 | 2h | `issuerCodes.ts` : prior + maturité par émetteur, testé | |
| 3 | [3-persistance-supabase.md](./3-persistance-supabase.md) | Persistance Supabase (table + RPC) | 2 | P0 | 2h30 | Table `facturation_issuer_codes` + RPC + wrappers | ⚠ |
| 4 | [4-integration-filtre-detection.md](./4-integration-filtre-detection.md) | Filtre émetteur dans la détection | 2 | P0 | 3h | `detect` combine prior émetteur × proba mots | |
| 5 | [5-flux-apprentissage-ui.md](./5-flux-apprentissage-ui.md) | Flux d'apprentissage + UI + galaxie | 3, 4 | P1 | 3h | Apprentissage co-occurrence, source affichée, galaxie recâblée | |
| 6 | [6-validation-globale.md](./6-validation-globale.md) | Validation globale | 1, 2, 3, 4, 5 | P0 | 1h | tsc + vitest + build verts, scénario bout-en-bout | ⚠ |

---

## Ordre d'exécution

- **Sprint A (parallélisable)** : étapes 1 et 2 (indépendantes — l'une touche `constants.ts`,
  l'autre crée `issuerCodes.ts`).
- **Sprint B** : étape 3 (persistance, dépend du modèle 2) et étape 4 (intégration, dépend
  du modèle 2) — parallélisables entre elles.
- **Sprint C** : étape 5 (UI + flux + galaxie, dépend de 3 et 4).
- **Fin** : étape 6 (validation globale).

---

## Architecture cible

```
src/lib/facturation/
  constants.ts              (MODIF) — retrait règles alcool/chauffage/linge/gardiennage
  issuerCodes.ts            (NOUVEAU, pur) — IssuerCodes, prior P(code|émetteur), maturité émetteur
  wordpool.ts               (MODIF) — helper de combinaison prior × proba (addStrong CONSERVÉ)
  detect.ts                 (MODIF) — detect/redetect reçoivent le prior émetteur, combinaison
  cloudService.ts           (MODIF) — fetchIssuerCodes / learnIssuerCodes / unlearnIssuerCodes
  types.ts                  (MODIF) — Detection.scores gagne `source: 'issuer'|'words'|'rule'`
  facturation.test.ts       (MODIF) — tests adaptés + nouveaux (retrait alcool, filtre émetteur)
src/components/facturation/
  useFacturationModel.ts    (MODIF) — 3e query : issuerCodes
  FacturationBoard.tsx      (MODIF) — résout l'émetteur avant detect, transmet le prior
  InvoicePanel.tsx          (MODIF) — apprend/désapprend la co-occurrence au tamponnage (addStrong gardé)
  confidence.ts             (MODIF) — source de la suggestion (badge émetteur vs mots)
supabase/
  facturation_issuer_codes.sql  (NOUVEAU, EXÉCUTÉ PAR L'UTILISATEUR) — table + RPC learn/unlearn
  facturation_corrections.sql   (MODIF, EXÉCUTÉ PAR L'UTILISATEUR) — propager rename/merge/delete émetteur
```

`galaxy.ts` reste INCHANGÉ (D4 : `addStrong` conservé → la galaxie garde ses nœuds
émetteur). Un seul DDL nouveau (table `facturation_issuer_codes`), réversible (`drop
table`), isolé des tables partagées. SQL exécuté par l'utilisateur, jamais l'assistant.

---

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| DB | `supabase/facturation_corrections.sql` | `supabase/facturation_issuer_codes.sql` |
| Métier (lib) | `constants.ts`, `wordpool.ts`, `detect.ts`, `cloudService.ts`, `types.ts`, `facturation.test.ts` | `issuerCodes.ts` |
| Composants (UI) | `useFacturationModel.ts`, `FacturationBoard.tsx`, `InvoicePanel.tsx`, `confidence.ts` | — |
| Réutilisés (sans modif) | `issuers.ts`, `text.ts`, `similarity.ts`, `galaxy.ts` | — |
| **Total** | **11 modifiés** | **2 nouveaux** |
