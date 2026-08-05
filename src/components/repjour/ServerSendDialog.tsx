import { useEffect, useState } from 'react'
import { Loader2, Send } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog.tsx'
import { serverReportRecipients } from '#/lib/repjour/services/recipients.ts'
import type { EmailRecipient } from '#/lib/repjour/services/recipients.ts'
import type { ServerSendResult } from '#/lib/repjour/sendServer.ts'

/*
 * Confirmation AVANT l'envoi serveur (Resend, envoi RÉEL immédiat). Ajoute de la
 * friction UX volontaire : on ouvre d'abord cette modale, qui LIT et AFFICHE la
 * liste réelle des destinataires (`server_report_recipients`), puis on ne part
 * qu'après un clic explicite. Sans destinataire actif, le bouton est désactivé.
 *
 * L'envoi est attendu ici : en cas de refus (anti-spam serveur « réessaie dans
 * X min », erreur réseau…), le message s'affiche DANS la modale, qui reste ouverte.
 * Sur succès, la modale se ferme. Aucun toast persistant ailleurs.
 */

interface Props {
  open: boolean
  onClose: () => void
  /** Déclenche l'envoi réel et renvoie son résultat (ok + message). */
  onConfirm: () => Promise<ServerSendResult>
}

export function ServerSendDialog({ open, onClose, onConfirm }: Props) {
  const [loading, setLoading] = useState(true)
  const [recipients, setRecipients] = useState<EmailRecipient[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    setBusy(false)
    serverReportRecipients.fetch().then((list) => {
      setRecipients(list)
      setLoading(false)
    })
  }, [open])

  const active = recipients.filter((r) => r.active)
  const to = active.filter((r) => r.type === 'to')
  const cc = active.filter((r) => r.type === 'cc')
  const canSend = !loading && to.length > 0 && !busy

  const send = async () => {
    setBusy(true)
    setError(null)
    const result = await onConfirm()
    setBusy(false)
    if (result.ok) onClose()
    else setError(result.message)
  }

  const Line = (r: EmailRecipient) => (
    <li key={r.id} className="truncate text-sm text-foreground">
      {r.name || r.email}
    </li>
  )

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="size-5 text-primary" />
            Envoyer le rapport
          </DialogTitle>
          <DialogDescription>
            Le rapport du jour va être envoyé par email (PDF joint) aux
            destinataires ci-dessous.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : to.length === 0 ? (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Aucun destinataire actif. Ajoute-les via l’icône ⚙️ « Destinataires
              serveur » avant d’envoyer.
            </div>
          ) : (
            <>
              <div>
                <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Destinataires
                </p>
                <ul className="space-y-1">{to.map(Line)}</ul>
              </div>
              {cc.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                    En copie
                  </p>
                  <ul className="space-y-1">{cc.map(Line)}</ul>
                </div>
              )}
            </>
          )}

          {error && (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button disabled={!canSend} onClick={send}>
            {busy ? <Loader2 className="animate-spin" /> : <Send />}
            {busy ? 'Envoi…' : 'Envoyer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
