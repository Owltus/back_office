import { describe, expect, it } from 'vitest'

import { isValidEmail } from '#/lib/shared/email.ts'

describe('isValidEmail', () => {
  it('accepte les adresses normales', () => {
    expect(isValidEmail('prenom.nom@okko-hotels.com')).toBe(true)
    expect(isValidEmail('a+tag@sous-domaine.example.fr')).toBe(true)
  })

  it('tolère les espaces autour (trim avant contrôle)', () => {
    expect(isValidEmail('  contact@okko.fr  ')).toBe(true)
  })

  it('refuse ce qui n’est pas une adresse', () => {
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('pas-une-adresse')).toBe(false)
    expect(isValidEmail('sans@domaine')).toBe(false)
    expect(isValidEmail('@okko.fr')).toBe(false)
  })

  /*
   * Le cas qui motive cette fonction — pentest 2026-07-20, finding 5.
   * `openMailWithRecipients` interpolait la liste des destinataires BRUTE avant
   * le « ? » de l'URL mailto. Une adresse stockée contenant « ? » ou « & »
   * réécrivait donc les paramètres du message : ajout d'un destinataire caché en
   * bcc, remplacement du sujet ou du corps. Ces valeurs doivent être rejetées
   * avant d'atteindre l'URL, et la base porte la même contrainte en CHECK.
   */
  it('refuse les adresses qui détourneraient le mailto', () => {
    expect(isValidEmail('a@b.com?bcc=exfil@evil.tld')).toBe(false)
    expect(isValidEmail('a@b.com&subject=Virement')).toBe(false)
    expect(isValidEmail('a@b.com#fragment')).toBe(false)
    expect(isValidEmail('a@b.com,autre@evil.tld')).toBe(false)
    expect(isValidEmail('a@b.com;autre@evil.tld')).toBe(false)
    expect(isValidEmail('a@b.com autre@evil.tld')).toBe(false)
    expect(isValidEmail('"<script>"@b.com')).toBe(false)
  })
})
