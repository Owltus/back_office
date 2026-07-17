# Étape 5 — Apprentissage au tamponnage + card explicable

## Objectif

Apprendre réellement : au tamponnage d'une facture, verser ses mots dans les nuages
des codes validés (RPC delta), une seule fois. Et rendre la détection lisible : la
card affiche la vraie proba, les mots qui ont voté, et l'état d'abstention.

## Contexte

Le tamponnage (`handleStamp`) = validation humaine = vérité terrain (`record.codes`
après édition). C'est le point d'apprentissage (D3). Garde d'idempotence nécessaire
(le bouton reste actif → risque de compter deux fois). D5 : le nom d'émetteur
(`record.supplierName`) est ajouté comme **token fort** au moment d'apprendre — plus
de `rememberRule`/localStorage.

## Fichier(s) impacté(s)

- `src/components/facturation/InvoicePanel.tsx` (modification : apprentissage + garde)
- `src/components/facturation/DetectionCard.tsx` (modification : proba réelle + mots + abstention)
- `src/lib/facturation/detect.ts` (retrait de la persistance localStorage — D5)

## Travail à réaliser

### 1. Apprentissage au tamponnage (`InvoicePanel.handleStamp`)

Après un `stampAndDownload` réussi, si pas déjà appris :

```ts
async function handleStamp() {
  setStamping(true); setStampError(null)
  try {
    const { stampAndDownload } = await import('#/lib/facturation/stamp.ts')
    await stampAndDownload(record.file, stampDataOf(record), record.fileName, record.position)
    if (!record.learned && record.codes.length > 0) {
      // tokens de la facture + nom d'émetteur comme token fort (D5)
      const deltas = countTokens(record.text)
      if (canLearn(record.supplierName))
        addStrong(deltas, tokenize(record.supplierName), SUPPLIER_WEIGHT)
      await learnClouds(record.codes, deltas)          // RPC delta
      onPatch({ learned: true })                        // garde d'idempotence
      // patch optimiste du cache (pas de refetch) :
      queryClient.setQueryData(['facturation','clouds'], (old) => mergeDelta(old, record.codes, deltas))
    }
  } catch (e) {
    setStampError(...)
  } finally { setStamping(false) }
}
```

- N'apprendre **que** sur `record.codes` (post-édition), jamais sur `detection.codes`.
- Garde `record.learned` (nouveau flag) → un re-tamponnage ne réapprend pas.
- Apprentissage **best-effort** : un échec RPC n'empêche pas le téléchargement du PDF
  (le tampon a déjà réussi) ; on log l'échec sans bloquer.
- `queryClient` : le composant devra y accéder (`useQueryClient`).

### 2. Retrait du localStorage (D5)

Retirer l'écriture `rememberRule`/`forgetRule` vers `localStorage` et le bouton
« Mémoriser » distinct : la mémorisation est désormais **implicite au tamponnage**
(le nom d'émetteur entre dans les nuages). Le champ « Émetteur » reste (il fournit le
token fort). `loadLearnedRules`/`allRules` deviennent inutiles → à supprimer ou vider.
(À confirmer selon D5 : si l'utilisateur préfère garder un bouton explicite, le
brancher sur `learnClouds` au lieu de localStorage.)

### 3. `DetectionCard` — proba réelle + mots + abstention (D8)

```tsx
// abstention : état visuel distinct de « aucune détection »
if (detection?.abstained) return <Card muted>Preuve insuffisante — à choisir manuellement.</Card>
// sinon, pour le top des scores : une barre par code (proba) + mots votants en pastilles
{detection.scores?.slice(0, 3).map((s) => (
  <div key={s.code}>
    <Row><span>{s.code} {budgetLabel(s.code)}</span><span>{Math.round(s.proba*100)} %</span></Row>
    <Bar value={s.proba} />
    <div className="flex flex-wrap gap-1">{s.words.map((w) => <Chip key={w}>{w}</Chip>)}</div>
  </div>
))}
```

Recalibrer `confidenceTone()` (seuils) pour la nouvelle distribution de proba.

## Ordre d'exécution

1. `InvoicePanel` : apprentissage au tamponnage + garde `learned` + patch cache.
2. Retrait localStorage (D5) / ou rebranchement du bouton sur `learnClouds`.
3. `DetectionCard` : proba réelle, mots votants, abstention.
4. `npx tsc --noEmit` + `npx vitest run src/lib/facturation`.

## Critère de validation

- Tamponner une facture → un appel RPC `facturation_wordpool_learn` (vérifiable réseau),
  une seule fois par facture (re-tamponnage n'apprend pas).
- Le cache des nuages est patché sans refetch (patch optimiste).
- La card montre la/les proba(s) et les mots qui ont voté ; l'abstention est distincte.
- Aucune écriture localStorage restante pour l'apprentissage (D5).
