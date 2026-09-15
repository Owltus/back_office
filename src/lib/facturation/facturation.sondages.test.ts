import { describe, expect, it } from 'vitest'

import { extractSiren } from '#/lib/facturation/siret.ts'
import { normalize, issuerKey } from '#/lib/facturation/text.ts'

/*
 * Trois SONDAGES ciblés (mission point B) : chacun observe un comportement précis et rapporte
 * le FAIT BRUT — ces tests ne qualifient rien de « bug » ou de « non-bug », ils FIGENT ce que
 * le code fait réellement aujourd'hui, pour que toute évolution future du comportement se voie
 * (le test casse), sans jugement de valeur porté ici.
 */

describe('sondage — contrôle de clé Luhn sur un SIREN de neuf zéros', () => {
  it('« 000000000 » satisfait trivialement Luhn (somme nulle ≡ 0 mod 10) et est ACCEPTÉ', () => {
    // Neuf chiffres, bornés par des non-chiffres (lookaround de SIREN_RE) : candidat valide
    // pour la regex. La clé de Luhn (somme pondérée, chiffre sur deux doublé) d'une suite de
    // zéros vaut 0, et 0 mod 10 === 0 : la clé passe MATHÉMATIQUEMENT, sans qu'aucun des neuf
    // chiffres ne soit informatif.
    const observed = extractSiren('Siret : 000000000 — Fin de page')
    expect(observed).toBe('000000000')
  })
})

/*
 * Le sondage sur les séparateurs de milliers du montant a rempli son office :
 * il a montré qu'une espace insécable amputait « 1 488,60 € » de son chiffre
 * des milliers. Le défaut a été corrigé le 2026-09-15, et ce sondage a été
 * remplacé par de vraies attentes métier dans `amount.test.ts` — qui couvrent
 * aussi le second défaut découvert dans la foulée : un montant à point décimal
 * valorisé cent fois trop cher. Un sondage fige ce qui EST ; une fois la
 * décision prise, c'est à un test d'affirmer ce qui DOIT être.
 */

describe('sondage — homoglyphe cyrillique dans un nom d’émetteur (normalize de text.ts)', () => {
  it('un « e » latin remplacé par son homoglyphe cyrillique (U+0435) N’EST PAS translittéré : il est SUPPRIMÉ, donnant une clé émetteur DIFFÉRENTE', () => {
    const CYRILLIC_E = String.fromCharCode(0x0435)
    const ascii = 'Leclerc'
    const withHomoglyph = `Lecl${CYRILLIC_E}rc` // remplace le 3e « e » de « Leclerc »

    // `normalize` fait NFD puis retire tout caractère hors ASCII (/[^\x00-\x7f]/g). Le « е »
    // cyrillique (U+0435) n'a PAS de décomposition NFD vers une base ASCII + diacritique (à la
    // différence d'un « é » latin accentué) : il est retiré TEL QUEL, comme n'importe quel
    // caractère non-ASCII — la lettre disparaît du mot au lieu d'être ramenée à un « e ».
    expect(normalize(ascii)).toBe('leclerc')
    expect(normalize(withHomoglyph)).toBe('leclrc') // lettre manquante, pas substituée

    // Conséquence directe sur l'identité émetteur : les deux graphies ne convergent PAS vers
    // la même clé canonique — un homoglyphe FRAGMENTE l'émetteur en une entrée distincte au
    // lieu de s'unifier avec le nom « propre ».
    const keyAscii = issuerKey(ascii)
    const keyHomoglyph = issuerKey(withHomoglyph)
    expect(keyAscii).toBe('leclerc')
    expect(keyHomoglyph).toBe('leclrc')
    expect(keyHomoglyph).not.toBe(keyAscii)
  })
})
