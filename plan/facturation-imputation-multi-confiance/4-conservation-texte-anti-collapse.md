# Étape 4 — Conservation du texte & anti-collapse émetteur

## Objectif

Revoir **ce que le système conserve** dans les nuages de mots (borner le vocabulaire,
retirer le bruit) et **atténuer le « collapse »** par lequel l'émetteur rappelle
toujours le même code et écrase les autres imputations possibles.

## Contexte

Constats des agents :
- **Rétention non bornée en pratique** : `STORAGE_TOP_K = 300` est déclaré mais **jamais
  appliqué en TS** ; la RPC `facturation_wordpool_prune(p_min_count, p_top_k)` existe et
  fait le travail (retire les hapax, plafonne à top-K par code) mais **n'est jamais
  appelée automatiquement**. Le vocabulaire grossit donc sans limite.
- **Collapse émetteur (D3)** : au tamponnage, le nom d'émetteur est injecté comme token
  fort (`SUPPLIER_WEIGHT = 5`) dans **chacun** des codes retenus. Ce token concentré
  obtient un `idf` élevé et **domine le cosinus** ; à la facture suivante il propulse le
  code historique de l'émetteur et `CLOUD_KEEP_RATIO = 0.75` écrase les autres. Mécanisme
  déduit, non tranché face à l'hypothèse « règle couche 1 prioritaire » — **à confirmer
  sur données réelles** avant d'ajuster les règles.
- **Sans IA**, on ne peut pas garder « seulement les mots liés à ce qui est commandé » :
  le levier réaliste est l'**hygiène** (stopwords, bornes, élagage), pas la sémantique.

Décisions : **D3** (plafonner l'influence de l'émetteur), **D5** (delta identique à tous
les codes → différé), **D6/D2** hors périmètre ici.

## Fichier(s) impacté(s)

- `src/lib/facturation/wordpool.ts` (constantes de rétention / poids émetteur)
- `src/lib/facturation/cloudService.ts` (exposer l'appel `prune`)
- `src/components/facturation/InvoicePanel.tsx` (pondération à l'apprentissage)

## Travail à réaliser

### 1. Atténuer le collapse émetteur (D3)

Réduire l'ascendant du token d'émetteur, en gardant sa valeur de pré-remplissage :
- baisser `SUPPLIER_WEIGHT` (ex. de 5 à 2-3), OU **borner** la contribution d'un token
  d'émetteur au cosinus dans `scoreInvoice` (plafond sur `satTf` du token émetteur), pour
  qu'il **informe sans dominer** ;
- documenter le choix (commentaire chiffré, style `wordpool.ts`).
- **Vérifier ensuite sur données réelles** si le collapse persiste par la couche 1
  (règle générique prioritaire) ; si oui, ajuster séparément (hors ce lot).

### 2. Hygiène de conservation

- **Appliquer réellement `STORAGE_TOP_K`** (ou s'appuyer sur `prune`) : exposer
  `pruneClouds()` dans `cloudService.ts` (RPC `facturation_wordpool_prune`, déjà déployée,
  gardée par rôle) et l'appeler à un moment maîtrisé (ex. bouton de maintenance admin, ou
  après N apprentissages), **jamais** en boucle. Aucune modif de schéma.
- Revoir `STOPWORDS` si des termes ubiquitaires parasitent encore (au-delà de
  `facture/total/ttc/…`, `okko/nantes` déjà présents). Garder le côté « bag-of-words »
  assumé (pas de sémantique sans IA).

### 3. Multi-code à l'apprentissage (D5 — différé, à documenter)

Noter dans le code (commentaire) que `addStrong` applique le **même delta à tous les
codes** sélectionnés, ce qui dilue la discrimination d'un article multi-imputé. Correctif
(répartir/pondérer par code) = changement de la RPC `facturation_wordpool_learn` →
**différé**, hors v1.

## Ordre d'exécution

1. Réduire/borner le poids émetteur + commentaire justificatif.
2. Exposer `pruneClouds()` (RPC existante) + point d'appel maîtrisé.
3. Revue rapide des stopwords.
4. Commentaire D5 sur `addStrong`.

## Critère de validation

- Un émetteur tamponné une fois sur un code ne « verrouille » plus systématiquement ce code au détriment d'un autre plausible (constaté sur cas réel).
- `pruneClouds()` existe, gardé par rôle, non appelé en boucle.
- Aucun test de `wordpool` cassé ; si des valeurs de scoring changent volontairement, mettre à jour les tests concernés avec justification.
- `npx tsc --noEmit` et `npx vitest run` passent.
