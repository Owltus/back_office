/*
 * Mise en forme d'un texte Markdown SANS connaître le Markdown — la barre
 * d'outils de l'éditeur des documents (demande utilisateur du 2026-09-27 :
 * « le Markdown n'est pas un format inné, simplifier au maximum »).
 *
 * Tout est PUR : chaque fonction reçoit le texte et la sélection, et rend
 * une `Edition` — la plage à remplacer, le texte qui la remplace et la
 * sélection à poser ensuite (en coordonnées du texte APRÈS remplacement).
 * Le composant l'applique par `insertText`, ce qui garde Ctrl + Z.
 *
 * Chaque bouton est une BASCULE quand c'est possible : un second clic sur
 * « Gras » retire les `**`, un second clic sur « Liste » retire les tirets.
 */

export interface Edition {
  /** Début de la plage remplacée (dans le texte AVANT). */
  debut: number
  /** Fin de la plage remplacée (dans le texte AVANT). */
  fin: number
  /** Texte qui remplace la plage. */
  texte: string
  /** Sélection à poser ensuite, dans le texte APRÈS. */
  selection: readonly [number, number]
}

/** Applique une édition à un texte (tests, et repli sans `insertText`). */
export function appliquerEdition(valeur: string, e: Edition): string {
  return valeur.slice(0, e.debut) + e.texte + valeur.slice(e.fin)
}

/* ------------------------------------------------------------------------ *
 * Entourage : gras, italique, barré.
 * ------------------------------------------------------------------------ */

export type Entourage = 'gras' | 'italique' | 'barre'

const MARQUES: Record<Entourage, { marque: string; exemple: string }> = {
  gras: { marque: '**', exemple: 'texte en gras' },
  italique: { marque: '*', exemple: 'texte en italique' },
  barre: { marque: '~~', exemple: 'texte barré' },
}

/**
 * Entoure la sélection de la marque (`**…**`), ou la retire si elle y est
 * déjà — dedans (`**mot**` sélectionné) ou autour (`mot` sélectionné entre
 * deux `**`). Sans sélection, insère un exemple sélectionné, prêt à être
 * remplacé par la frappe. Les espaces aux bords restent HORS des marques :
 * `** mot **` ne serait pas mis en gras.
 */
export function basculerEntourage(
  valeur: string,
  debut: number,
  fin: number,
  type: Entourage,
): Edition {
  const { marque, exemple } = MARQUES[type]
  const n = marque.length
  let d = Math.min(debut, fin)
  let f = Math.max(debut, fin)
  // Espaces de bord exclus de l'entourage.
  while (d < f && /\s/.test(valeur[d] ?? '')) d++
  while (f > d && /\s/.test(valeur[f - 1] ?? '')) f--
  const selection = valeur.slice(d, f)

  const entoureDedans =
    selection.length >= 2 * n &&
    selection.startsWith(marque) &&
    selection.endsWith(marque) &&
    !estAutreMarque(selection, marque, type)
  if (entoureDedans) {
    const interieur = selection.slice(n, selection.length - n)
    return {
      debut: d,
      fin: f,
      texte: interieur,
      selection: [d, d + interieur.length],
    }
  }
  const entoureAutour =
    valeur.slice(d - n, d) === marque &&
    valeur.slice(f, f + n) === marque &&
    !(
      type === 'italique' &&
      (valeur[d - n - 1] === '*' || valeur[f + n] === '*')
    )
  if (entoureAutour) {
    return {
      debut: d - n,
      fin: f + n,
      texte: selection,
      selection: [d - n, d - n + selection.length],
    }
  }
  const contenu = selection === '' ? exemple : selection
  return {
    debut: d,
    fin: f,
    texte: `${marque}${contenu}${marque}`,
    selection: [d + n, d + n + contenu.length],
  }
}

/** `**gras**` commence et finit par `*` : ce n'est pas de l'italique. */
function estAutreMarque(s: string, marque: string, type: Entourage): boolean {
  return (
    type === 'italique' &&
    marque === '*' &&
    s.startsWith('**') &&
    s.endsWith('**') &&
    !s.startsWith('***')
  )
}

/* ------------------------------------------------------------------------ *
 * Préfixes de ligne : titres, listes, citation.
 * ------------------------------------------------------------------------ */

export type Prefixe =
  'titre1' | 'titre2' | 'titre3' | 'puces' | 'numeros' | 'cases' | 'citation'

/** Préfixe de ligne reconnu (titre, liste, case, citation), avec son retrait. */
const RE_PREFIXE =
  /^(\s*)(#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/

function familleDe(p: string): Prefixe | null {
  const t = p.trim()
  if (t === '#') return 'titre1'
  if (t === '##') return 'titre2'
  if (/^#{3,6}$/.test(t)) return 'titre3'
  if (/^[-*+]\s+\[[ xX]\]$/.test(t)) return 'cases'
  if (/^[-*+]$/.test(t)) return 'puces'
  if (/^\d+[.)]$/.test(t)) return 'numeros'
  if (t === '>') return 'citation'
  return null
}

function prefixeDe(type: Prefixe, rang: number): string {
  switch (type) {
    case 'titre1':
      return '# '
    case 'titre2':
      return '## '
    case 'titre3':
      return '### '
    case 'puces':
      return '- '
    case 'numeros':
      return `${String(rang)}. `
    case 'cases':
      return '- [ ] '
    case 'citation':
      return '> '
  }
}

/** Bornes des lignes couvertes par la sélection. */
function lignesCouvertes(
  valeur: string,
  debut: number,
  fin: number,
): { debut: number; fin: number } {
  const d = Math.min(debut, fin)
  let f = Math.max(debut, fin)
  // Une sélection qui s'arrête au tout début d'une ligne ne la couvre pas.
  if (f > d && valeur[f - 1] === '\n') f--
  const debutLigne = valeur.lastIndexOf('\n', d - 1) + 1
  const finLigne = valeur.indexOf('\n', f)
  return { debut: debutLigne, fin: finLigne === -1 ? valeur.length : finLigne }
}

/**
 * Pose le préfixe demandé sur chaque ligne sélectionnée (ou celle du
 * curseur), en REMPLAÇANT un préfixe existant (un titre 2 devient titre 1,
 * une liste à puces devient numérotée). Si toutes les lignes portent déjà
 * ce préfixe, il est retiré : le bouton est une bascule. Les lignes vides
 * d'une sélection de plusieurs lignes restent vides.
 */
export function basculerPrefixe(
  valeur: string,
  debut: number,
  fin: number,
  type: Prefixe,
): Edition {
  const bornes = lignesCouvertes(valeur, debut, fin)
  const lignes = valeur.slice(bornes.debut, bornes.fin).split('\n')
  const plusieurs = lignes.length > 1
  const utiles = lignes.filter((l) => !plusieurs || l.trim() !== '')
  const dejaTous =
    utiles.length > 0 &&
    utiles.every((l) => {
      const m = RE_PREFIXE.exec(l)
      return m !== null && familleDe(m[2]) === type
    })

  let rang = 0
  const nouvelles = lignes.map((l) => {
    if (plusieurs && l.trim() === '') return l
    const m = RE_PREFIXE.exec(l)
    const retrait = m?.[1] ?? /^\s*/.exec(l)?.[0] ?? ''
    const corps = m ? l.slice(m[0].length) : l.slice(retrait.length)
    if (dejaTous) return retrait + corps
    rang++
    // Un titre ne garde pas de retrait (il ne serait plus un titre).
    const garde = type.startsWith('titre') ? '' : retrait
    return garde + prefixeDe(type, rang) + corps
  })
  const texte = nouvelles.join('\n')
  // Une seule ligne : le curseur va en fin de ligne, prêt à écrire.
  const selection: readonly [number, number] = plusieurs
    ? [bornes.debut, bornes.debut + texte.length]
    : [bornes.debut + texte.length, bornes.debut + texte.length]
  return { debut: bornes.debut, fin: bornes.fin, texte, selection }
}

/* ------------------------------------------------------------------------ *
 * Blocs : tableau, séparateur, saut de page, lien.
 * ------------------------------------------------------------------------ */

export type Bloc = 'tableau' | 'separateur' | 'saut'

const BLOCS: Record<Bloc, { texte: string; selection?: [number, number] }> = {
  tableau: {
    texte:
      '| Colonne 1 | Colonne 2 |\n| --- | --- |\n| Texte | Texte |\n| Texte | Texte |',
    selection: [2, 11],
  },
  separateur: { texte: '---' },
  saut: { texte: '===' },
}

/**
 * Insère un bloc SUR SES PROPRES LIGNES, séparé du texte voisin par une
 * ligne vide (sans quoi Markdown le collerait au paragraphe : un `---` sous
 * une ligne de texte en fait un TITRE). Remplace la sélection éventuelle.
 */
export function insererBloc(
  valeur: string,
  debut: number,
  fin: number,
  bloc: Bloc,
): Edition {
  const d = Math.min(debut, fin)
  const f = Math.max(debut, fin)
  const avant = valeur.slice(0, d)
  const apres = valeur.slice(f)
  const prefixe =
    avant === ''
      ? ''
      : avant.endsWith('\n\n')
        ? ''
        : avant.endsWith('\n')
          ? '\n'
          : '\n\n'
  const suffixe =
    apres === ''
      ? '\n'
      : apres.startsWith('\n\n')
        ? ''
        : apres.startsWith('\n')
          ? '\n'
          : '\n\n'
  const { texte, selection } = BLOCS[bloc]
  const origine = d + prefixe.length
  const sel: readonly [number, number] = selection
    ? [origine + selection[0], origine + selection[1]]
    : [
        origine + texte.length + suffixe.length,
        origine + texte.length + suffixe.length,
      ]
  return { debut: d, fin: f, texte: prefixe + texte + suffixe, selection: sel }
}

/**
 * Lien : `[texte](adresse)`. Si la sélection EST une adresse, elle devient
 * l'adresse et le texte est à écrire ; sinon elle devient le texte et
 * l'adresse est sélectionnée, prête à être collée.
 */
export function insererLien(
  valeur: string,
  debut: number,
  fin: number,
): Edition {
  const d = Math.min(debut, fin)
  const f = Math.max(debut, fin)
  const selection = valeur.slice(d, f).trim()
  if (/^(https?:\/\/|www\.|mailto:)\S+$/i.test(selection)) {
    const libelle = 'texte du lien'
    return {
      debut: d,
      fin: f,
      texte: `[${libelle}](${selection})`,
      selection: [d + 1, d + 1 + libelle.length],
    }
  }
  const libelle = selection === '' ? 'texte du lien' : selection
  const adresse = 'https://'
  const texte = `[${libelle}](${adresse})`
  const debutAdresse = d + libelle.length + 3
  return {
    debut: d,
    fin: f,
    texte,
    selection: [debutAdresse, debutAdresse + adresse.length],
  }
}

/* ------------------------------------------------------------------------ *
 * Entrée et Tab dans une liste — ce que fait tout traitement de texte.
 * ------------------------------------------------------------------------ */

const RE_LISTE = /^(\s*)([-*+]\s+\[[ xX]\]\s+|[-*+]\s+|(\d+)([.)])\s+|>\s?)/

/**
 * Entrée dans une ligne de liste (ou de citation) : la ligne suivante
 * reçoit le même préfixe (numéro + 1, case décochée). Entrée sur un
 * élément VIDE termine la liste (le préfixe est retiré). `null` : la
 * touche garde son comportement normal.
 */
export function continuerListe(
  valeur: string,
  debut: number,
  fin: number,
): Edition | null {
  if (debut !== fin) return null
  const debutLigne = valeur.lastIndexOf('\n', debut - 1) + 1
  const finLigne = valeur.indexOf('\n', debut)
  const ligne = valeur.slice(
    debutLigne,
    finLigne === -1 ? valeur.length : finLigne,
  )
  const m = RE_LISTE.exec(ligne)
  if (!m) return null
  const longueurPrefixe = m[0].length
  // Curseur dans le préfixe lui-même : comportement normal.
  if (debut - debutLigne < longueurPrefixe) return null

  if (ligne.slice(longueurPrefixe).trim() === '') {
    // Élément vide : on sort de la liste.
    return {
      debut: debutLigne,
      fin: debutLigne + ligne.length,
      texte: '',
      selection: [debutLigne, debutLigne],
    }
  }
  const retrait = m[1]
  // Groupe optionnel : absent (undefined) hors liste numérotée.
  const numero = m[3] as string | undefined
  let suite: string
  if (numero !== undefined) {
    suite = `${retrait}${String(Number(numero) + 1)}${m[4]} `
  } else if (/\[[ xX]\]/.test(m[2])) {
    suite = `${retrait}${m[2].trim().charAt(0)} [ ] `
  } else {
    suite = retrait + m[2]
  }
  const texte = `\n${suite}`
  return {
    debut,
    fin,
    texte,
    selection: [debut + texte.length, debut + texte.length],
  }
}

/**
 * Tab / Maj + Tab sur des lignes de liste : décale d'un niveau (2 espaces)
 * pour faire une sous-liste. `null` hors liste : Tab garde son rôle
 * (passer au champ suivant), l'éditeur reste accessible au clavier.
 */
export function indenterListe(
  valeur: string,
  debut: number,
  fin: number,
  sens: 1 | -1,
): Edition | null {
  const bornes = lignesCouvertes(valeur, debut, fin)
  const lignes = valeur.slice(bornes.debut, bornes.fin).split('\n')
  if (!lignes.some((l) => RE_LISTE.test(l) && !/^\s*>/.test(l))) return null
  let decalageDebut = 0
  const nouvelles = lignes.map((l, i) => {
    if (!RE_LISTE.test(l) || /^\s*>/.test(l)) return l
    if (sens === 1) {
      if (i === 0) decalageDebut = 2
      return `  ${l}`
    }
    const retire = /^( {1,2}|\t)/.exec(l)?.[0].length ?? 0
    if (i === 0) decalageDebut = -retire
    return l.slice(retire)
  })
  const texte = nouvelles.join('\n')
  const d = Math.min(debut, fin)
  const f = Math.max(debut, fin)
  const nouveauDebut = Math.max(bornes.debut, d + decalageDebut)
  return {
    debut: bornes.debut,
    fin: bornes.fin,
    texte,
    selection:
      d === f
        ? [nouveauDebut, nouveauDebut]
        : [bornes.debut, bornes.debut + texte.length],
  }
}

/** Le préfixe de la ligne du curseur (état actif des boutons de la barre). */
export function prefixeActif(valeur: string, curseur: number): Prefixe | null {
  const debutLigne = valeur.lastIndexOf('\n', curseur - 1) + 1
  const finLigne = valeur.indexOf('\n', curseur)
  const ligne = valeur.slice(
    debutLigne,
    finLigne === -1 ? valeur.length : finLigne,
  )
  const m = RE_PREFIXE.exec(ligne)
  return m ? familleDe(m[2]) : null
}

/**
 * Insère une ligne (une image `![nom](chemin)`) à la position donnée, sur
 * sa propre ligne : un saut est ajouté avant ou après seulement s'il
 * manque. Le curseur se place juste après la ligne insérée. Une position
 * hors du texte (le texte a raccourci pendant l'envoi) est ramenée au bout.
 */
export function insererLigne(
  valeur: string,
  debut: number | null,
  fin: number | null,
  ligne: string,
): Edition {
  const d = Math.min(debut ?? valeur.length, valeur.length)
  const f = Math.max(d, Math.min(fin ?? d, valeur.length))
  const avant = valeur.slice(0, d)
  const apres = valeur.slice(f)
  const sautAvant = avant === '' || avant.endsWith('\n') ? '' : '\n'
  const sautApres = apres.startsWith('\n') ? '' : '\n'
  const texte = `${sautAvant}${ligne}${sautApres}`
  const curseur = d + sautAvant.length + ligne.length + sautApres.length
  return { debut: d, fin: f, texte, selection: [curseur, curseur] }
}

/**
 * Insère ou remplace un bloc quelconque (un tableau écrit par la grille)
 * sur ses propres lignes, isolé par des lignes vides comme `insererBloc`.
 * Le curseur se place juste après le bloc.
 */
export function insererTexteEnBloc(
  valeur: string,
  debut: number,
  fin: number,
  bloc: string,
): Edition {
  const d = Math.min(debut, fin, valeur.length)
  const f = Math.min(Math.max(debut, fin), valeur.length)
  const avant = valeur.slice(0, d)
  const apres = valeur.slice(f)
  const prefixe =
    avant === ''
      ? ''
      : avant.endsWith('\n\n')
        ? ''
        : avant.endsWith('\n')
          ? '\n'
          : '\n\n'
  const suffixe =
    apres === ''
      ? '\n'
      : apres.startsWith('\n\n')
        ? ''
        : apres.startsWith('\n')
          ? '\n'
          : '\n\n'
  const curseur = d + prefixe.length + bloc.length
  return {
    debut: d,
    fin: f,
    texte: prefixe + bloc + suffixe,
    selection: [curseur, curseur],
  }
}

/**
 * Entoure les lignes sélectionnées (ou la ligne du curseur) d'un bloc
 * `:::nom` … `:::` (2026-10-01, plan `classeur-images-blocs`), isolé par des
 * lignes vides. Le curseur se place au début de la ligne `:::` de fermeture :
 * une image insérée là s'ajoute À L'INTÉRIEUR du bloc, sur sa propre ligne.
 * Un titre de la sélection reste AU-DESSUS du bloc : il doit emporter le bloc
 * avec lui en haut de page, pas y être enfermé.
 */
export function entourerDeBloc(
  valeur: string,
  debut: number,
  fin: number,
  nom: 'etape' | 'photos',
): Edition {
  const d = Math.min(debut, fin, valeur.length)
  const f = Math.min(Math.max(debut, fin), valeur.length)
  const debutLigne = valeur.lastIndexOf('\n', d - 1) + 1
  // Une sélection qui s'arrête au début d'une ligne n'inclut pas celle-ci.
  const borne = f > d && valeur[f - 1] === '\n' ? f - 1 : f
  const i = valeur.indexOf('\n', borne)
  const finLigne = i === -1 ? valeur.length : i
  const lignes = valeur.slice(debutLigne, finLigne).split('\n')
  const titres: string[] = []
  while (lignes.length > 0 && /^#{1,6}\s/.test(lignes[0])) {
    titres.push(lignes.shift()!)
  }
  while (lignes.length > 0 && lignes[0].trim() === '') lignes.shift()
  while (lignes.length > 0 && lignes[lignes.length - 1].trim() === '')
    lignes.pop()
  const contenu = lignes.join('\n')
  const avantBloc = titres.length > 0 ? `${titres.join('\n')}\n\n` : ''
  const ouverture = `${avantBloc}:::${nom}\n`
  const corps = contenu === '' ? '\n' : `${contenu}\n\n`
  const bloc = `${ouverture}${corps}:::`
  const edition = insererTexteEnBloc(valeur, debutLigne, finLigne, bloc)
  const origine = edition.selection[0] - bloc.length
  const curseur = origine + ouverture.length + corps.length
  return { ...edition, selection: [curseur, curseur] }
}
