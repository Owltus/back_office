# Étape 2 — Métier : extension `csv.ts` (rows datées) + `pdj/service.ts`

## Objectif

Produire, à partir du CSV, des lignes DB datées (`csvToDbRows`) prêtes à l'upsert, avec la règle RGPD « nom seulement si jour courant » (D2), sans casser le parsing existant. Créer le service Supabase (`pdj/service.ts`) : mappers, chargement par jour, import idempotent, purge des noms.

## Contexte

`processCsv`/`GuestMap` alimente le board actuel — à préserver. On factorise l'extraction de lignes et on ajoute un producteur DB. Piège CSV confirmé : plusieurs `Res. Notes` contiennent des retours à la ligne dans un champ quoté ; le parsing survit car **toutes les colonnes utilisées sont situées AVANT `Res. Notes` (col 26)**. Ne jamais lire `Guest Notes`/`Party` (après col 26) sans corriger d'abord le découpage (papaparse est dispo dans le projet si besoin un jour). La colonne `Guests` du CSV est incohérente → toujours recalculer `adults + children`.

## Fichier(s) impacté(s)

- `src/lib/pdj/csv.ts` (modification : factoriser `parseRows`, ajouter `csvToDbRows`, index de colonnes supplémentaires)
- `src/lib/pdj/service.ts` (nouveau)

## Travail à réaliser

### 1. Factoriser le parsing (`csv.ts`)

Extraire une fonction interne qui produit les lignes brutes filtrées (séparateur, `parseCsvLine`, filtre room numérique, `hasActiveGuests`, filtre IN HOUSE/DUE OUT vs archive, calcul PDJ `hasPDJ`/`BB1PAX`). `processCsv` (inchangé en surface) et `csvToDbRows` la partagent. Ajouter les index de colonnes non-PII exploitables (D3) : `Room Type`, `No of Nights`, `TravelAgent`, `Company`, `Guarantee`, `Payment Type`, `Adr`, `Arrival`, `Departure`.

### 2. `csvToDbRows` — lignes DB datées + règle nom (D2)

```ts
export interface DbPdjRow {
  service_date: string // 'YYYY-MM-DD' issu de dateFromFilename
  room: number
  guest_name: string | null // null si service_date != aujourd'hui (D2)
  status: string
  vip: boolean
  adults: number
  children: number
  guests: number
  no_of_nights: number | null
  room_type: string | null
  rate_plan: string | null
  channel: string | null
  company: string | null
  guarantee: string | null
  payment_type: string | null
  addons: string | null
  adr: number | null
  arrival_date: string | null
  departure_date: string | null
  stay_count: number
  breakfasts_included: number
  source_file: string
}

// Lève une erreur explicite si la date n'est pas extractible (sinon on daterait mal).
export function csvToDbRows(content: string, fileName: string): DbPdjRow[]
```

- `service_date` = date `_YYYYMMDD` du nom de fichier, formatée `yyyy-MM-dd`.
- **Règle RGPD (D2)** : `guest_name = isSameDay(service_date, todayParis) ? name : null`. Un import passé n'écrit donc aucun nom.
- Ne JAMAIS mapper les colonnes [B] : `Reservation Id`, `Confirm No`, `Balance`, `Accompanying`, `Vehicle Reg. No.`, `Res. Notes`, `Guest Notes`, `Party`, `Group` (minimisation à la source).
- Dates arrivée/départ : extraire la **date seule** (drop de l'heure) si D3 les retient.

### 3. `pdj/service.ts` — accès Supabase (miroir `parking/service.ts`)

```ts
export const PDJ_TABLE = 'pdj_breakfasts'

export interface Guest { /* modèle applicatif pour le board (réutilise csv.ts Guest) */ }

export async function fetchServiceDates(): Promise<string[]>          // distinct service_date desc
export async function fetchDay(serviceDate: string): Promise<DbPdjRow[]> // .eq('service_date', d)
export async function importRows(rows: DbPdjRow[]): Promise<void>     // upsert onConflict service_date,room
export async function setServed(serviceDate: string, room: number, breakfastsServed: number): Promise<void> // update conso (D4)
export async function purgeOldGuestNames(todayParis: string): Promise<void> // update ... is null where < today
```

- `importRows` : `supabase.from(PDJ_TABLE).upsert(rows, { onConflict: 'service_date,room' })`. Rejouable (réimport = mise à jour, pas de doublon). **N'inclut PAS** `breakfasts_served`/`served` dans le payload → un réimport ne réinitialise pas la saisie du staff (D4 : `ON CONFLICT DO UPDATE` ne touche que les colonnes fournies).
- `setServed` : `update({ breakfasts_served, served: breakfasts_served > 0 }).eq('service_date', d).eq('room', room)` — met à jour la seule consommation (D4).
- `purgeOldGuestNames` : `supabase.from(PDJ_TABLE).update({ guest_name: null, purged_at: new Date().toISOString() }).lt('service_date', todayParis).not('guest_name', 'is', null)`. Barré par la RLS pour le rôle `utilisateur` (normal).
- Convention d'erreur : `{ data, error }` → `if (error) throw error`.
- Mapper `DbPdjRow` → `Guest` (board) pour l'affichage d'un jour chargé.

## Ordre d'exécution

1. Factoriser `parseRows` dans `csv.ts` ; ajouter les index de colonnes.
2. Ajouter `csvToDbRows` (+ helper `todayParis`/`isSameDay`).
3. Créer `pdj/service.ts` (mappers + fetchServiceDates + fetchDay + importRows + purgeOldGuestNames).
4. `npx tsc --noEmit`.

## Critère de validation

- `npx tsc --noEmit` passe.
- `csvToDbRows(contenuTest, 'In-House Guests _20260426012157.csv')` → toutes les lignes ont `guest_name === null` (date passée) et `service_date === '2026-04-26'`, avec les stats renseignées (room_type, nights, channel, breakfasts_included…).
- Aucune colonne [B] présente dans `DbPdjRow`.
- Named exports, alias `#/` avec extension, simple quotes, pas de `;` final ; métier pur (pas de React).
