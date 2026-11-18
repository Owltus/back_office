// Lecture du PRÉAMBULE des rapports planifiés du PMS, pour l'Edge Function
// « import-report » (étape 8 du plan securite-audit-run2-2026-11-18).
//
// Les quatre exports planifiés commencent par :
//   Hotel Code,Hotel Name,Generated Date,Generated Time,Report Name
//   4401NACH,Okko Hotels Nantes Centre Ville,14-10-2026,02:30:41,Forecast By Date Range
// Les exports MANUELS n'ont pas toujours ce bloc : son absence n'est jamais une
// erreur.
//
// Tout ce fichier est PUR (aucun accès réseau, aucune variable d'environnement
// lue ici) : l'appelant passe les réglages. Rien ne lève : un préambule
// illisible rend null, jamais une exception.

// Découpe une ligne CSV en gérant les guillemets et guillemets échappés ("").
function decouper(ligne: string, separateur: string): string[] {
  const cellules: string[] = []
  let courante = ''
  let entreGuillemets = false
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i]
    if (c === '"') {
      if (entreGuillemets && ligne[i + 1] === '"') {
        courante += '"'
        i++
      } else {
        entreGuillemets = !entreGuillemets
      }
    } else if (c === separateur && !entreGuillemets) {
      cellules.push(courante)
      courante = ''
    } else {
      courante += c
    }
  }
  cellules.push(courante)
  return cellules.map((x) => x.trim())
}

/** Nombre de lignes regardées en tête : le préambule est toujours tout en haut. */
const LIGNES_EXAMINEES = 20

/**
 * Le bloc « Hotel Code,... » et sa ligne de valeurs, sous forme de table
 * colonne (en minuscules) → valeur. null si le bloc est absent ou n'a pas de
 * ligne de valeurs. Gère le BOM, les fins de ligne Windows et le séparateur
 * « , » ou « ; ».
 */
function lireBloc(contenu: string): Map<string, string> | null {
  const propre = contenu.charCodeAt(0) === 0xfeff ? contenu.slice(1) : contenu
  const lignes = propre
    .slice(0, 20_000)
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, LIGNES_EXAMINEES)
  for (let i = 0; i < lignes.length; i++) {
    for (const sep of [',', ';']) {
      const entete = decouper(lignes[i], sep).map((c) => c.toLowerCase())
      if (!entete.includes('hotel code')) continue
      const suivante = lignes[i + 1]
      if (suivante === undefined) return null
      const valeurs = decouper(suivante, sep)
      const bloc = new Map<string, string>()
      entete.forEach((nom, k) => bloc.set(nom, valeurs[k] ?? ''))
      return bloc
    }
  }
  return null
}

/**
 * Le Hotel Code du rapport (ex. « 4401NACH »), ou null si le fichier n'a pas
 * le bloc « Hotel Code » ou si la valeur est vide.
 */
export function hotelCodeOf(contenu: string): string | null {
  const code = lireBloc(contenu)?.get('hotel code')?.trim() ?? ''
  return code === '' ? null : code
}

export type EtatHotelCode = 'sans-controle' | 'absent' | 'ok' | 'different'

/**
 * Décision sur le Hotel Code d'un fichier :
 *   - `attendu` absent ou vide : aucun contrôle ;
 *   - code absent du fichier : journal seul, jamais refusé ;
 *   - code identique (casse et espaces ignorés) : OK ;
 *   - code différent : refusé SEULEMENT si `enforce` vaut exactement « true »,
 *     sinon observation (journal seul).
 */
export function decisionHotelCode(
  code: string | null,
  attendu: string | undefined,
  enforce: string | undefined,
): { etat: EtatHotelCode; refuser: boolean } {
  const cible = (attendu ?? '').trim().toUpperCase()
  if (cible === '') return { etat: 'sans-controle', refuser: false }
  if (code === null) return { etat: 'absent', refuser: false }
  if (code.trim().toUpperCase() === cible) return { etat: 'ok', refuser: false }
  return { etat: 'different', refuser: enforce === 'true' }
}

/** Valeur venue d'un fichier, rendue sûre pour une ligne de journal (pas de
 * retour à la ligne forgé, longueur bornée). */
export function pourJournal(valeur: string): string {
  // deno-lint-ignore no-control-regex -- on cible justement les caractères de contrôle.
  return valeur.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 40)
}

// --- Fraîcheur du Forecast ---------------------------------------------------

export interface DateGeneration {
  date: string // AAAA-MM-JJ
  heure: string | null // HH:MM:SS, null si absente ou illisible
}

/** « Generated Date » (JJ-MM-AAAA) et « Generated Time » du préambule, ou null
 * si la date est absente ou n'est pas une vraie date du calendrier. */
export function generatedAtOf(contenu: string): DateGeneration | null {
  const bloc = lireBloc(contenu)
  if (!bloc) return null
  const m = (bloc.get('generated date') ?? '').match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/)
  if (!m) return null
  const [j, mo, a] = [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)]
  const d = new Date(Date.UTC(a, mo - 1, j))
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== j)
    return null
  const h = (bloc.get('generated time') ?? '').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  const heure =
    h && parseInt(h[1], 10) < 24 && parseInt(h[2], 10) < 60 && parseInt(h[3] ?? '0', 10) < 60
      ? `${h[1].padStart(2, '0')}:${h[2]}:${h[3] ?? '00'}`
      : null
  return { date: `${m[3]}-${m[2]}-${m[1]}`, heure }
}

/** Décalage (minutes) de l'heure de Paris sur l'UTC à un instant donné. */
function decalageParis(instant: Date): number {
  const parties = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const v = (t: string) => parseInt(parties.find((p) => p.type === t)?.value ?? '0', 10)
  const commeUtc = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second'))
  return Math.round((commeUtc - instant.getTime()) / 60_000)
}

/**
 * Âge du fichier en minutes, en lisant la date de génération comme une heure
 * de PARIS (le fuseau réel du PMS n'est pas connu : c'est l'objet de
 * l'observation). Peut être négatif si l'hypothèse est fausse.
 */
export function ageForecastMinutes(g: DateGeneration, maintenant: Date): number {
  const [a, mo, j] = g.date.split('-').map((x) => parseInt(x, 10))
  const [h, mi, s] = (g.heure ?? '00:00:00').split(':').map((x) => parseInt(x, 10))
  const murale = Date.UTC(a, mo - 1, j, h, mi, s)
  // Deux passes : le décalage dépend de l'instant que l'on cherche.
  let instant = murale - decalageParis(new Date(murale)) * 60_000
  instant = murale - decalageParis(new Date(instant)) * 60_000
  return Math.round((maintenant.getTime() - instant) / 60_000)
}
