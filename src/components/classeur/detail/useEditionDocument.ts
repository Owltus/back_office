import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'

import { useAuth } from '#/components/auth/AuthContext.tsx'
import { useInvaliderClasseur } from '#/components/classeur/hooks/useClasseur.ts'
import {
  brouillonDiffere,
  ecrireBrouillon,
  effacerBrouillon,
  lireBrouillon,
  purgerBrouillonsPerimes,
  stockageNavigateur,
} from '#/lib/classeur/brouillon.ts'
import type { Brouillon } from '#/lib/classeur/brouillon.ts'
import {
  sauvegarderDocumentSiInchange,
  updateItem,
} from '#/lib/classeur/service.ts'
import type { ResultatSauvegarde } from '#/lib/classeur/service.ts'
import { SANS_TITRE } from '#/lib/classeur/sommaire.ts'
import type { DbDocument } from '#/lib/classeur/types.ts'

/*
 * L'édition d'un document, « sans perdre de travail » — améliorations 1 à 5
 * de `plan/classeur-editeur-ameliorations` :
 *
 *   1. quitter avec des modifications demande confirmation : bouton
 *      Annuler, navigation dans l'app (`useBlocker`), fermeture ou
 *      rechargement de l'onglet (`beforeunload`, message du navigateur) ;
 *   2. la sauvegarde est conditionnée à la version de départ
 *      (`sauvegarderDocumentSiInchange`) : si un collègue a sauvegardé
 *      entre-temps, on le dit au lieu d'écraser ;
 *   3. le texte non sauvegardé est recopié sur le poste (brouillon de
 *      secours, par compte) et proposé à la réouverture du document ;
 *   5. `modifie` alimente l'indicateur « Non enregistré ».
 *
 * « Modifié » se mesure par rapport à l'état AU DÉBUT de l'édition, pas au
 * document du cache : une relecture en arrière-plan (sauvegarde d'un
 * collègue) ne doit ni masquer ni inventer une modification.
 */

interface Champs {
  titre: string
  description: string
  contenu: string
}

const DELAI_BROUILLON_MS = 500

export function useEditionDocument(doc: DbDocument | null) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const invalider = useInvaliderClasseur()

  const [editing, setEditing] = useState(false)
  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [contenu, setContenu] = useState('')
  const [origine, setOrigine] = useState<Champs | null>(null)
  const [base, setBase] = useState<string | null>(null)
  const [confirmerAnnulation, setConfirmerAnnulation] = useState(false)
  const [conflit, setConflit] = useState<{ updatedAt: string } | null>(null)
  const [brouillonPropose, setBrouillonPropose] = useState<Brouillon | null>(
    null,
  )
  const [brouillonEcritLe, setBrouillonEcritLe] = useState<number | null>(null)

  const modifie =
    editing &&
    origine !== null &&
    (titre !== origine.titre ||
      description !== origine.description ||
      contenu !== origine.contenu)

  // Lu par le bloqueur et par `pagehide` : toujours la dernière valeur.
  const modifieRef = useRef(modifie)
  modifieRef.current = modifie
  const courant = useRef<Omit<Brouillon, 'enregistreLe'> | null>(null)
  courant.current =
    modifie && base !== null ? { titre, description, contenu, base } : null

  // ── 3. Brouillon de secours ────────────────────────────────────────────
  useEffect(() => {
    purgerBrouillonsPerimes(stockageNavigateur(), Date.now())
  }, [])

  // Proposé à l'ouverture (hors édition) s'il apporte quelque chose.
  useEffect(() => {
    if (editing || !doc || !userId) return
    const stockage = stockageNavigateur()
    const b = lireBrouillon(stockage, userId, doc.id, Date.now())
    if (b && !brouillonDiffere(b, doc)) {
      effacerBrouillon(stockage, userId, doc.id)
      setBrouillonPropose(null)
      return
    }
    setBrouillonPropose(b)
  }, [editing, doc, userId])

  // Recopie différée pendant la frappe ; effacé dès qu'il n'y a plus rien
  // à sauver (retour à l'identique).
  useEffect(() => {
    if (!editing || !doc || !userId) return
    const stockage = stockageNavigateur()
    if (!modifie || base === null) {
      effacerBrouillon(stockage, userId, doc.id)
      setBrouillonEcritLe(null)
      return
    }
    const minuterie = window.setTimeout(() => {
      const maintenant = Date.now()
      if (
        ecrireBrouillon(stockage, userId, doc.id, {
          titre,
          description,
          contenu,
          base,
          enregistreLe: maintenant,
        })
      ) {
        setBrouillonEcritLe(maintenant)
      }
    }, DELAI_BROUILLON_MS)
    return () => window.clearTimeout(minuterie)
  }, [editing, modifie, titre, description, contenu, base, doc, userId])

  // Onglet fermé ou mis en arrière-plan avant la fin du délai : on écrit
  // tout de suite (sur mobile, `pagehide` peut être le dernier signal).
  useEffect(() => {
    if (!editing || !doc || !userId) return
    const docId = doc.id
    const vider = () => {
      if (courant.current)
        ecrireBrouillon(stockageNavigateur(), userId, docId, {
          ...courant.current,
          enregistreLe: Date.now(),
        })
    }
    const surVisibilite = () => {
      if (document.visibilityState === 'hidden') vider()
    }
    window.addEventListener('pagehide', vider)
    document.addEventListener('visibilitychange', surVisibilite)
    return () => {
      window.removeEventListener('pagehide', vider)
      document.removeEventListener('visibilitychange', surVisibilite)
    }
  }, [editing, doc, userId])

  // ── 1. Garde de sortie ─────────────────────────────────────────────────
  const bloqueur = useBlocker({
    shouldBlockFn: () => modifieRef.current,
    enableBeforeUnload: () => modifieRef.current,
    withResolver: true,
  })

  // ── Transitions ────────────────────────────────────────────────────────
  const ouvrir = useCallback(
    (champs: Champs, depuis: string, docActuel: DbDocument) => {
      setTitre(champs.titre)
      setDescription(champs.description)
      setContenu(champs.contenu)
      setOrigine({
        titre: docActuel.title,
        description: docActuel.description,
        contenu: docActuel.content,
      })
      setBase(depuis)
      setConflit(null)
      setBrouillonPropose(null)
      setEditing(true)
    },
    [],
  )

  const commencer = useCallback(() => {
    if (!doc) return
    ouvrir(
      { titre: doc.title, description: doc.description, contenu: doc.content },
      doc.updated_at,
      doc,
    )
  }, [doc, ouvrir])

  /** Reprend le brouillon, avec SA version de départ (conflit détecté). */
  const reprendreBrouillon = useCallback(() => {
    if (!doc || !brouillonPropose) return
    ouvrir(brouillonPropose, brouillonPropose.base, doc)
  }, [doc, brouillonPropose, ouvrir])

  /**
   * Historique (amélioration n° 20) : ouvre l'éditeur sur une ancienne
   * version. Départ = le document ACTUEL (base de conflit comprise) : rien
   * n'est écrit avant Sauvegarder, et l'écart se voit comme une
   * modification (« Non enregistré »).
   */
  const reprendreVersion = useCallback(
    (v: { title: string; description: string; content: string }) => {
      if (!doc) return
      ouvrir(
        { titre: v.title, description: v.description, contenu: v.content },
        doc.updated_at,
        doc,
      )
    },
    [doc, ouvrir],
  )

  const ignorerBrouillon = useCallback(() => {
    if (doc && userId) effacerBrouillon(stockageNavigateur(), userId, doc.id)
    setBrouillonPropose(null)
  }, [doc, userId])

  const fermer = useCallback(() => {
    if (doc && userId) effacerBrouillon(stockageNavigateur(), userId, doc.id)
    modifieRef.current = false
    setEditing(false)
    setOrigine(null)
    setBase(null)
    setConflit(null)
    setConfirmerAnnulation(false)
    setBrouillonEcritLe(null)
  }, [doc, userId])

  /** Bouton Annuler : confirmation seulement s'il y a quelque chose à perdre. */
  const annuler = useCallback(() => {
    if (modifieRef.current) setConfirmerAnnulation(true)
    else fermer()
  }, [fermer])

  // ── 2. Sauvegarde conditionnée ─────────────────────────────────────────
  const sauvegarde = useMutation({
    mutationFn: async ({
      forcer,
    }: {
      forcer: boolean
    }): Promise<ResultatSauvegarde> => {
      if (!doc || base === null) throw new Error('Aucun document en édition.')
      const patch = {
        title: titre.trim() || SANS_TITRE,
        description: description.trim(),
        content: contenu,
      }
      if (forcer) {
        await updateItem('document', doc.id, patch)
        return { statut: 'ok', updatedAt: '' }
      }
      return sauvegarderDocumentSiInchange(doc.id, patch, base)
    },
    onSuccess: async (resultat) => {
      if (resultat.statut === 'conflit') {
        setConflit({ updatedAt: resultat.updatedAt })
        return
      }
      // Relire AVANT de fermer : sinon la page affiche l'ancienne version
      // le temps de la relecture, puis se remet en page une seconde fois
      // (constaté le 2026-10-01). « Sauvegarder » reste en cours jusque-là.
      await invalider()
      fermer()
    },
  })

  const sauvegarder = useCallback(() => {
    if (sauvegarde.isPending) return
    // Rien de modifié : on sort sans écrire (ni point de restauration).
    if (!modifieRef.current) {
      fermer()
      return
    }
    sauvegarde.reset()
    sauvegarde.mutate({ forcer: false })
  }, [sauvegarde, fermer])

  /** Conflit : garder ma version et écraser celle du collègue. */
  const ecraser = useCallback(() => {
    setConflit(null)
    sauvegarde.mutate({ forcer: true })
  }, [sauvegarde])

  /** Conflit : abandonner ma version et afficher la sienne. */
  const prendreLaSienne = useCallback(async () => {
    fermer()
    await invalider()
  }, [fermer, invalider])

  return {
    editing,
    titre,
    setTitre,
    description,
    setDescription,
    contenu,
    setContenu,
    /** 5. Des modifications ne sont pas encore enregistrées. */
    modifie,
    /** Heure de la dernière copie de secours (indicateur). */
    brouillonEcritLe,
    commencer,
    annuler,
    sauvegarder,
    saving: sauvegarde.isPending,
    erreur: sauvegarde.isError ? sauvegarde.error : null,
    // 1. Confirmation d'abandon (bouton Annuler ou navigation bloquée).
    confirmation: confirmerAnnulation
      ? ({ raison: 'annuler' } as const)
      : bloqueur.status === 'blocked'
        ? ({ raison: 'quitter' } as const)
        : null,
    continuerEdition: () => {
      setConfirmerAnnulation(false)
      if (bloqueur.status === 'blocked') bloqueur.reset()
    },
    abandonner: () => {
      const suite = bloqueur.status === 'blocked' ? bloqueur.proceed : null
      fermer()
      suite?.()
    },
    // 2. Conflit.
    conflit,
    fermerConflit: () => setConflit(null),
    ecraser,
    prendreLaSienne,
    // 3. Brouillon proposé à la réouverture.
    brouillonPropose,
    reprendreBrouillon,
    ignorerBrouillon,
    reprendreVersion,
  }
}
