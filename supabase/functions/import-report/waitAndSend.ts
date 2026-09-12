// PATIENCE de l'envoi automatique du RepJour.
//
// LE PROBLÈME, constaté la nuit du 2026-09-12.
//
// Le rapport ne peut partir que lorsque le Comparison ET le Forecast du cycle
// sont là. Ils arrivent en DEUX e-mails, donc en deux invocations distinctes de
// cette fonction, séparées d'environ une minute. Chaque invocation tentait
// l'envoi à la fin de son import, et si la donnée sœur manquait, elle attendait
// QUATRE SECONDES avant de renoncer.
//
// Quatre secondes, ce n'est pas attendre. Cette nuit-là, le Comparison est
// arrivé à 00:31:05 et le Forecast à 00:31:59 : cinquante-quatre secondes plus
// tard. L'invocation du Comparison avait abandonné depuis cinquante secondes.
// Tout reposait donc sur celle du Forecast — la seule qui pouvait encore
// envoyer. Elle n'a pas abouti, et le rapport n'est jamais parti.
//
// LE PRINCIPE RETENU : les deux invocations deviennent REDONDANTES.
//
// Chacune attend désormais patiemment sa sœur, en réessayant toutes les quinze
// secondes pendant plusieurs minutes. Celle du Comparison aurait trouvé le
// Forecast à la quatrième tentative et envoyé le rapport, quoi qu'il soit
// advenu de l'autre. Il faut que LES DEUX échouent pour que rien ne parte.
//
// POURQUOI APRÈS LA RÉPONSE, ET NON PENDANT.
//
// Le Worker Cloudflare qui nous appelle fait `await fetch(...)` et REJETTE
// l'e-mail si l'appel n'aboutit pas. Faire patienter la réponse ferait donc
// rebondir le rapport côté PMS — on remplacerait une panne par une autre. La
// réponse part donc immédiatement, et l'attente se poursuit en arrière-plan
// (`EdgeRuntime.waitUntil`), invisible du Worker.
//
// LA LIMITE, dite franchement : cette attente vit dans l'invocation. Le runtime
// la borne à quelques minutes, et si l'instance meurt, l'attente meurt avec
// elle. Pour couvrir un rapport qui arriverait une demi-heure plus tard, ou une
// invocation qui disparaît, il faudrait une reprise PLANIFIÉE côté base
// (pg_cron), indépendante de toute invocation. Ce module ne prétend pas la
// remplacer : il supprime la cause constatée, pas toutes les causes possibles.
//
// CE QUI EST ÉCRIT EN BASE. Chaque tentative est journalisée
// (`repjour_auto_send_log`). C'est le second manque de cette nuit-là : aucune
// trace n'existait, et le lendemain matin la seule réponse possible était
// « je ne sais pas ». Désormais, la raison de chaque abstention est lisible.

import { businessDateStr } from '../_shared/businessDay.ts'

/** Ce que ce module a besoin de savoir faire d'un client Supabase : écrire une
 *  ligne de journal. Typé structurellement plutôt qu'importé, pour que la
 *  patience — la seule chose à prouver ici — soit testable sans embarquer la
 *  bibliothèque, le PDF et Resend. */
export interface LogWriter {
  from(table: string): {
    insert(row: unknown): PromiseLike<{ error: { message: string } | null }>
  }
}

/** Issue d'une tentative d'envoi (cf. `AutoSendOutcome` dans autoSend.ts). */
export interface Outcome {
  sent: boolean
  note: string
  retryable: boolean
}

/** La tentative elle-même. Injectée par l'appelant (index.ts passe
 *  `maybeAutoSendRepjour`) : c'est ce qui garde ce module indépendant. */
export type AttemptFn = (
  admin: never,
  dryRun: boolean,
  instant: Date,
) => Promise<Outcome>

/** Délai entre deux tentatives. Assez court pour partir vite, assez long pour
 *  ne pas marteler la base : le rapport sœur met une minute, pas une heure. */
const RETRY_EVERY_MS = 15_000

/** Budget d'attente par défaut, en secondes. Cinq minutes couvrent près de six
 *  fois l'écart observé (54 s) tout en restant sous la durée maximale d'une
 *  invocation. Réglable sans redéploiement par le secret
 *  `AUTO_SEND_PATIENCE_SECONDS` (0 = aucune attente, une seule tentative). */
const DEFAULT_PATIENCE_S = 300

/** Garde-fou : au-delà, on sortirait de la durée de vie d'une invocation et
 *  l'attente serait coupée au milieu, sans rien journaliser. */
const MAX_PATIENCE_S = 330

function patienceMs(): number {
  const raw = Deno.env.get('AUTO_SEND_PATIENCE_SECONDS')
  const parsed = raw != null ? Number(raw) : NaN
  const seconds = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_PATIENCE_S
  return Math.min(seconds, MAX_PATIENCE_S) * 1000
}

/** Une tentative, telle qu'on la relira demain matin. */
interface AttemptLog {
  cycle_date: string
  trigger_report: string
  attempt: number
  waited_seconds: number
  sent: boolean
  retryable: boolean
  note: string
}

/** Journalise une tentative. N'échoue JAMAIS bruyamment : une trace manquante ne
 *  doit pas empêcher un envoi. */
async function logAttempt(admin: LogWriter, row: AttemptLog): Promise<void> {
  try {
    const { error } = await admin.from('repjour_auto_send_log').insert(row)
    if (error) console.error('[AUTO-SEND] journalisation échouée :', error.message)
  } catch (err) {
    console.error(
      '[AUTO-SEND] journalisation échouée :',
      err instanceof Error ? err.message : String(err),
    )
  }
}

/**
 * Tente l'envoi, puis PATIENTE tant que l'abstention reste transitoire.
 *
 * S'arrête dès que : le rapport est parti, une autre invocation l'a envoyé, ou
 * la raison n'a rien à espérer du temps (hors fenêtre, budget absent, secret
 * manquant). Sinon réessaie toutes les quinze secondes jusqu'à épuisement du
 * budget, et journalise alors explicitement qu'elle a attendu pour rien.
 */
export async function waitThenAutoSend(
  /** La tentative d'envoi (`maybeAutoSendRepjour` en production). */
  attemptFn: AttemptFn,
  admin: LogWriter,
  dryRun: boolean,
  instant: Date,
  /** Rapport qui a déclenché cette attente ('comparison' | 'forecast'). */
  triggerReport: string,
  /** Points d'injection, pour rejouer une nuit en test sans attendre cinq
   *  minutes ni subir le temps réel. Valeurs réelles par défaut. */
  deps: {
    retryEveryMs?: number
    budgetMs?: number
    sleep?: (ms: number) => Promise<void>
    /** Horloge, pour qu'un test puisse faire passer le temps sans le subir. */
    now?: () => number
  } = {},
): Promise<void> {
  const retryEveryMs = deps.retryEveryMs ?? RETRY_EVERY_MS
  const budgetMs = deps.budgetMs ?? (dryRun ? 0 : patienceMs())
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const now = deps.now ?? (() => Date.now())
  const startedAt = now()
  const cycleDate = businessDateStr(instant)
  let attempt = 0

  for (;;) {
    attempt += 1
    const waitedSeconds = Math.round((now() - startedAt) / 1000)
    const outcome = await attemptFn(admin as never, dryRun, instant)

    if (!dryRun) {
      await logAttempt(admin, {
        cycle_date: cycleDate,
        trigger_report: triggerReport,
        attempt,
        waited_seconds: waitedSeconds,
        sent: outcome.sent,
        retryable: outcome.retryable,
        note: outcome.note,
      })
    }
    console.log(
      `[AUTO-SEND repjour] tentative ${attempt} (+${waitedSeconds}s, déclenchée par ${triggerReport}) — ${
        outcome.sent ? 'ENVOYÉ' : 'non envoyé'
      } : ${outcome.note}`,
    )

    // Parti, ou rien à espérer du temps : on s'arrête.
    if (outcome.sent || !outcome.retryable) return

    // Budget épuisé : on le DIT, plutôt que de disparaître en silence. C'est
    // cette ligne-là qui manquait le matin du 2026-09-12.
    const elapsed = now() - startedAt
    if (elapsed + retryEveryMs > budgetMs) {
      const totalWaited = Math.round(elapsed / 1000)
      const note = `abandon après ${totalWaited}s d'attente et ${attempt} tentative(s) — dernière raison : ${outcome.note}`
      if (!dryRun) {
        await logAttempt(admin, {
          cycle_date: cycleDate,
          trigger_report: triggerReport,
          attempt: attempt + 1,
          waited_seconds: totalWaited,
          sent: false,
          retryable: false,
          note,
        })
      }
      console.error(`[AUTO-SEND repjour] ${note}`)
      return
    }

    await sleep(retryEveryMs)
  }
}

/**
 * Lance l'attente EN ARRIÈRE-PLAN si le runtime le permet, sinon en ligne.
 *
 * `EdgeRuntime.waitUntil` laisse la réponse HTTP partir tout de suite tout en
 * laissant vivre la promesse : le Worker Cloudflare n'attend pas, et le PMS ne
 * voit jamais son e-mail rebondir. Sur un runtime qui ne l'expose pas (exécution
 * locale, test), on retombe sur une attente en ligne : le comportement reste
 * correct, seule la réponse est plus lente.
 */
export function scheduleAutoSend(
  attemptFn: AttemptFn,
  admin: LogWriter,
  dryRun: boolean,
  instant: Date,
  triggerReport: string,
): Promise<void> | void {
  const task = waitThenAutoSend(
    attemptFn,
    admin,
    dryRun,
    instant,
    triggerReport,
  ).catch((err) => {
    console.error(
      '[AUTO-SEND repjour] exception inattendue :',
      err instanceof Error ? err.message : String(err),
    )
  })
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime
  if (typeof runtime?.waitUntil === 'function') {
    runtime.waitUntil(task)
    return
  }
  return task
}
