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
// LE PRINCIPE RETENU : une VEILLE, et non une série de tentatives.
//
// L'envoi normal ne repose PAS sur cette veille. Il repose sur une règle
// simple : celui des deux rapports qui arrive EN DERNIER déclenche l'envoi,
// puisque à ce moment-là tout est réuni. Que le Forecast arrive une minute ou
// onze minutes après le Comparison n'y change rien — c'est son arrivée qui fait
// partir le mail, pas une horloge.
//
// La veille est le FILET : celui qui est arrivé en premier reste en stand-by, à
// ne rien faire, et se contente de regarder si la donnée sœur a fini par se
// poser. Si l'arrivée du second n'a pas réussi à déclencher l'envoi — ce qui
// s'est produit le 2026-09-12 — c'est le premier, resté en veille, qui prend le
// relais. Il faut donc que LES DEUX chemins échouent pour que rien ne parte.
//
// PORTÉE DE LA VEILLE. Elle dure quelques minutes, pas indéfiniment : elle vit
// dans l'invocation, que le runtime finit par arrêter. Elle couvre donc un
// second rapport qui tarde de quelques minutes, pas d'une demi-heure. Au-delà,
// c'est l'arrivée du second rapport qui reste le seul déclencheur — et si son
// propre contrôle échoue ce soir-là, rien ne part. Fermer ce dernier trou
// demande une veille PLANIFIÉE côté base (pg_cron), indépendante de toute
// invocation.
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

/** Intervalle entre deux coups d'œil. Assez court pour partir vite dès que la
 *  donnée sœur se pose, assez long pour ne rien marteler : en stand-by, on
 *  regarde, on ne travaille pas. */
const RETRY_EVERY_MS = 15_000

/** Durée de la veille par défaut, en secondes.
 *
 *  QUATRE-VINGT-DIX, et non trois cents. La documentation Supabase donne au worker
 *  une durée de vie de 150 s en plan gratuit (400 s en payant), PARTAGÉE entre les
 *  requêtes qu'il sert : une veille de 300 s était donc hors limite, et aurait été
 *  coupée en silence — y compris au milieu d'un envoi.
 *
 *  Quatre-vingt-dix secondes couvrent 1,7 fois l'écart de la nuit du 2026-09-12
 *  (54 s), ce qui suffit à son office : la veille n'est qu'un filet de LATENCE.
 *  Le filet de FOND, celui qui couvre un rapport en retard d'une demi-heure, est
 *  la veille planifiée, qui ne dépend d'aucune durée de vie.
 *
 *  Réglable sans redéploiement par `AUTO_SEND_PATIENCE_SECONDS` (0 = pas de
 *  veille, un seul contrôle). */
const DEFAULT_PATIENCE_S = 90

/** Garde-fou dur, sous la limite du plan gratuit une fois retranchés le temps des
 *  contrôles et celui de l'envoi final. */
const MAX_PATIENCE_S = 120

/** Marge à laisser APRÈS la veille, dans la durée de vie du worker.
 *
 *  Un contrôle qui aboutit ne se contente pas de lire : il pose une réservation,
 *  construit un PDF et appelle Resend (jusqu'à cinq essais, une quarantaine de
 *  secondes au pire). Être tué entre la réservation et l'envoi laisserait la
 *  journée marquée « envoyée » sans e-mail — l'état le plus difficile à rattraper.
 *
 *  Cette marge ne borne PAS la boucle : la retrancher du budget reviendrait à
 *  rétrécir la veille elle-même, et un premier essai l'avait ramenée à trente
 *  secondes — moins que les 54 s de l'incident qu'elle doit couvrir. Elle sert à
 *  DIMENSIONNER : `DEFAULT_PATIENCE_S + cette marge` doit tenir sous la durée de
 *  vie du worker (150 s en plan gratuit). 90 + 45 = 135 : il reste de quoi
 *  finir un envoi engagé au tout dernier contrôle. */
const FINAL_ATTEMPT_MARGIN_MS = 45_000

function patienceMs(): number {
  const raw = Deno.env.get('AUTO_SEND_PATIENCE_SECONDS')?.trim()
  // Chaîne vide traitée comme ABSENTE : poser le secret à "" supprimait la veille
  // sans le dire (Number('') vaut 0).
  const parsed = raw ? Number(raw) : NaN
  const seconds = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_PATIENCE_S
  return Math.min(seconds, MAX_PATIENCE_S) * 1000
}

/** Un coup d'œil de la veille, tel qu'on le relira demain matin. */
interface AttemptLog {
  cycle_date: string
  trigger_report: string
  attempt: number
  waited_seconds: number
  sent: boolean
  retryable: boolean
  note: string
}

/** Journalise un contrôle. N'échoue JAMAIS bruyamment : une trace manquante ne
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

/** Ce que la lecture du journal a besoin de savoir faire. */
export interface LogReader {
  from(table: string): {
    select(cols: string): {
      eq(
        col: string,
        val: string,
      ): {
        order(
          col: string,
          opts: { ascending: boolean },
        ): {
          limit(n: number): PromiseLike<{
            data: { note: string }[] | null
            error: { message: string } | null
          }>
        }
      }
    }
  }
}

/**
 * Dernier motif journalisé pour le cycle courant, ou `null`.
 *
 * Sert au mode sobre de la veille planifiée : elle repasse toutes les deux
 * minutes et n'écrit qu'au CHANGEMENT d'état. Sans cette relecture, chaque
 * passage repartirait de zéro et réécrirait le même motif cent fois — ou, si on
 * choisissait de ne rien écrire, laisserait le journal vide les nuits où aucun
 * e-mail n'arrive, c'est-à-dire justement celles qu'il doit documenter.
 *
 * Ne lève jamais : sans mémoire, on retombe sur « écrire », ce qui est le défaut
 * le moins grave.
 */
export async function lastNoteOfCycle(
  admin: LogReader,
  instant: Date = new Date(),
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from('repjour_auto_send_log')
      .select('note')
      .eq('cycle_date', businessDateStr(instant))
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) return null
    return data?.[0]?.note ?? null
  } catch {
    return null
  }
}

/**
 * Regarde si tout est réuni ; si oui, envoie. Sinon, reste EN VEILLE et regarde
 * de nouveau, sans rien forcer.
 *
 * Se retire dès que : le rapport est parti, l'autre chemin l'a envoyé, ou la
 * situation n'a rien à espérer du temps (hors fenêtre, budget du mois absent,
 * secret manquant) — dans ce dernier cas, immédiatement : veiller ne ferait pas
 * apparaître un budget. Sinon regarde toutes les quinze secondes jusqu'au bout
 * de la veille, et dit alors explicitement qu'elle se retire sans avoir vu
 * arriver la donnée attendue.
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
    /** Mode SOBRE, pour la veille planifiée qui repasse toutes les deux minutes :
     *  on n'écrit au journal que si l'état a CHANGÉ depuis le dernier contrôle,
     *  ou si quelque chose d'anormal se produit. Écrire à chaque passage
     *  noierait la nuit sous une centaine de lignes « déjà envoyé » ; ne rien
     *  écrire du tout, comme au premier jet, laissait le journal VIDE les nuits
     *  où aucun e-mail n'arrive — exactement celles qu'il doit documenter. */
    quiet?: boolean
    /** Dernier motif déjà journalisé pour ce cycle, s'il est connu. Permet au
     *  mode sobre de n'écrire qu'au changement d'état, d'un passage à l'autre. */
    lastNote?: string | null
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
  let lastNote = deps.lastNote ?? null

  for (;;) {
    attempt += 1
    // L'heure est relue À CHAQUE contrôle. Figée au départ, elle faisait conclure
    // « hors fenêtre » à une veille ouverte à 01h58 — définitivement, alors que la
    // fenêtre s'ouvrait deux minutes plus tard.
    const at = new Date(now())
    const outcome = await attemptFn(admin as never, dryRun, at)
    // Mesuré APRÈS la tentative : un contrôle qui envoie dure plusieurs secondes
    // (PDF + Resend), et c'est ce temps-là qui dit si la veille est bien taillée.
    const waitedSeconds = Math.round((now() - startedAt) / 1000)

    // En mode sobre : on écrit quand l'état CHANGE, et toujours quand le rapport
    // part. Rien d'autre. Forcer l'écriture sur toute issue définitive paraissait
    // prudent, mais « hors fenêtre horaire » en est une : la veille planifiée
    // aurait laissé une ligne à chaque passage, trente par nuit d'hiver, pour
    // dire trente fois la même chose. Une anomalie qui dure est écrite UNE fois,
    // horodatée ; sa disparition l'est aussi, puisque c'est un changement.
    const notable = outcome.sent || outcome.note !== lastNote
    if (!dryRun && (!deps.quiet || notable)) {
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
    lastNote = outcome.note
    const line = `[AUTO-SEND repjour] ${triggerReport} — contrôle ${attempt} à +${waitedSeconds}s : ${
      outcome.sent ? 'ENVOYÉ' : 'rien à faire'
    } (${outcome.note})`
    if (outcome.sent || (!outcome.retryable && !outcome.note.startsWith('déjà')))
      console.log(line)
    else if (!deps.quiet) console.log(line)

    // Parti, ou rien à espérer du temps : on s'arrête.
    if (outcome.sent || !outcome.retryable) return

    // Un seul contrôle demandé (veille planifiée, dry-run) : on se retire sans
    // parler de « fin de veille », il n'y en a jamais eu.
    if (budgetMs <= 0) return

    const elapsed = now() - startedAt
    if (elapsed + retryEveryMs > budgetMs) {
      const totalWaited = Math.round(elapsed / 1000)
      const note = `fin de veille après ${totalWaited}s sans que la donnée attendue se pose (${attempt} contrôles) — dernier état : ${outcome.note}`
      if (!dryRun) {
        await logAttempt(admin, {
          cycle_date: cycleDate,
          trigger_report: triggerReport,
          attempt,
          waited_seconds: totalWaited,
          sent: false,
          retryable: false,
          note,
        })
      }
      console.log(`[AUTO-SEND repjour] ${note}`)
      return
    }

    await sleep(retryEveryMs)
  }
}

/**
 * Ouvre la veille EN ARRIÈRE-PLAN.
 *
 * `EdgeRuntime.waitUntil` laisse la réponse HTTP partir tout de suite tout en
 * laissant vivre la promesse : le Worker Cloudflare n'attend pas, et le PMS ne
 * voit jamais son e-mail rebondir. C'est le comportement normal sur l'hébergé,
 * où cette API existe depuis novembre 2024.
 *
 * SI ELLE MANQUE (exécution locale, runtime inattendu), on ne fait QU'UN SEUL
 * contrôle, sans veille. Attendre en ligne serait bien pire que perdre le filet :
 * le handler e-mail du Worker Cloudflare est arrêté au bout d'une trentaine de
 * secondes, et `setReject` y est une erreur SMTP PERMANENTE — le PMS ne réessaie
 * pas et le rapport est perdu pour de bon. On préserve donc l'ingestion, quitte
 * à se passer du filet ; la veille planifiée, elle, reste entière.
 */
export function scheduleAutoSend(
  attemptFn: AttemptFn,
  admin: LogWriter,
  dryRun: boolean,
  instant: Date,
  triggerReport: string,
): void {
  const runtime = (
    globalThis as {
      EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void }
    }
  ).EdgeRuntime
  const detached = typeof runtime?.waitUntil === 'function'
  if (!detached)
    console.error(
      "[AUTO-SEND repjour] EdgeRuntime.waitUntil indisponible — veille désactivée, un seul contrôle. L'ingestion n'est pas affectée ; la veille planifiée prend le relais.",
    )
  const task = waitThenAutoSend(
    attemptFn,
    admin,
    dryRun,
    instant,
    triggerReport,
    detached ? {} : { budgetMs: 0 },
  ).catch((err) => {
    console.error(
      '[AUTO-SEND repjour] exception inattendue :',
      err instanceof Error ? err.message : String(err),
    )
  })
  if (detached) runtime!.waitUntil!(task)
  // Sans `waitUntil`, la promesse est lancée sans être attendue : le contrôle
  // unique est bref, et la réponse au Worker ne doit JAMAIS être retardée.
}
