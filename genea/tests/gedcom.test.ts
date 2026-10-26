import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { lireGedcom, normaliserBalise } from '../src/gedcom'
import { estHeritier } from '../src/modele'

const mini = readFileSync(resolve(__dirname, 'fixtures/mini.ged'), 'utf-8')
const tete = '0 HEAD\n1 CHAR UTF-8\n'

describe('lireGedcom', () => {
  it('lit personnes et unions', () => {
    const a = lireGedcom(mini)
    expect(a.personnes.size).toBe(5)
    expect(a.unions.size).toBe(2)
    expect(a.unions.get('@F1@')!.enfants).toEqual(['@I3@'])
    expect(a.unions.get('@F1@')!.conjoints).toEqual(['@I1@', '@I2@'])
    expect(a.unions.get('@F1@')!.mariage).toEqual({ date: '14 AUG 1890', lieu: ', Saint Leu, 974, Réunion, ,' })
    expect(a.unions.get('@F2@')!.divorce).toEqual({ date: '1960' })
    expect(a.personnes.get('@I3@')!.famc).toEqual(['@F1@'])
    expect(a.personnes.get('@I3@')!.fams).toEqual(['@F2@'])
    expect(a.personnes.get('@I1@')!.naissance).toEqual({ date: '13 JAN 1866', lieu: ', Saint Leu, 974, Réunion, ,' })
  })

  it('balises accentuées (octets invalides remplacés ou accents réels)', () => {
    const p = lireGedcom(mini).personnes.get('@I3@')!
    expect(p.champs.celibataire).toBe('Célibataire')
    expect(p.champs.adresse).toBe('12 rue X')
    expect(p.champs.sansPosterite).toBe('2 enfants')
    expect(p.champs.enfantLegitime).toBe('Légitimé')
    expect(p.champs.enfantReconnuPere).toBe('Reconnu')
    expect(p.champs.profession).toBe('Retraité')
    expect(p.champs.codePostal).toBe('97422 LA SALINE')
    expect(p.champs.email).toBe('06.00.00.00.00 Jeanne')
    expect(p.champs.representation).toBe('Représenté(e)')
    const avecAccents = lireGedcom(tete + '0 @I1@ INDI\n1 _CÉLIBATAIRE Célibataire\n1 _TELEPHONE_HÉRITIER 0601\n')
    expect(avecAccents.personnes.get('@I1@')!.champs.celibataire).toBe('Célibataire')
    expect(avecAccents.personnes.get('@I1@')!.champs.telephoneHeritier).toBe('0601')
  })

  it('héritier', () => {
    const a = lireGedcom(mini)
    expect(estHeritier(a.personnes.get('@I3@')!)).toBe(true)
    expect(estHeritier(a.personnes.get('@I1@')!)).toBe(false)
  })

  it('défunt', () => {
    const a = lireGedcom(mini)
    expect(a.defuntId).toBe('@I1@')
    expect(a.personnes.get('@I1@')!.defunt).toBe(true)
    expect(a.avertissements).toEqual([])
  })

  it('aucun défunt', () => {
    const a = lireGedcom(tete + '0 @I1@ INDI\n1 NAME A/B/\n')
    expect(a.defuntId).toBeNull()
    expect(a.avertissements).toContain('Défunt non identifié')
  })

  it('deux défunts : le premier, avec avertissement', () => {
    const a = lireGedcom(tete + '0 @I1@ INDI\n1 _DE-CUJUS_PARENT V\n0 @I2@ INDI\n1 _DE-CUJUS_PARENT V\n')
    expect(a.defuntId).toBe('@I1@')
    expect(a.avertissements.length).toBe(1)
  })

  it('sans nom', () => {
    const p = lireGedcom(mini).personnes.get('@I4@')!
    expect(p.nom).toBe('')
    expect(p.prenoms).toBe('')
    expect(p.sexe).toBe('F')
  })

  it('NAME découpé, GIVN/SURN prioritaires', () => {
    const a = lireGedcom(mini)
    expect(a.personnes.get('@I3@')!.prenoms).toBe('Jean Paul')
    expect(a.personnes.get('@I3@')!.nom).toBe('MARTIN')
    const b = lireGedcom(tete + '0 @I1@ INDI\n1 NAME X/Y/\n2 GIVN Jean\n2 SURN DUPONT\n')
    expect(b.personnes.get('@I1@')!.prenoms).toBe('Jean')
    expect(b.personnes.get('@I1@')!.nom).toBe('DUPONT')
  })

  it('sexe inconnu par défaut, fin de ligne CRLF tolérée', () => {
    const a = lireGedcom(tete.replace(/\n/g, '\r\n') + '0 @I1@ INDI\r\n1 NAME A/B/\r\n')
    expect(a.personnes.get('@I1@')!.sexe).toBe('U')
    expect(a.personnes.get('@I1@')!.nom).toBe('B')
  })
})

describe('liens incohérents entre INDI et FAM', () => {
  it('réconciliés dans les deux sens, ordre des INDI conservé', () => {
    const a = lireGedcom(tete + [
      '0 @I1@ INDI', '1 FAMS @F2@',                       // F1 le cite comme mari sans FAMS @F1@
      '0 @I2@ INDI', '1 FAMC @F1@',                       // F1 ne le liste pas comme enfant
      '0 @I3@ INDI',                                      // F1 le liste comme enfant sans FAMC
      '0 @I4@ INDI', '1 FAMS @F9@',                       // union inexistante
      '0 @F1@ FAM', '1 HUSB @I1@', '1 CHIL @I3@',
      '0 @F2@ FAM', '1 HUSB @I1@',
    ].join('\n') + '\n')
    expect(a.personnes.get('@I1@')!.fams).toEqual(['@F2@', '@F1@'])
    expect(a.unions.get('@F1@')!.enfants).toEqual(['@I3@', '@I2@'])
    expect(a.personnes.get('@I3@')!.famc).toEqual(['@F1@'])
    expect(a.personnes.get('@I4@')!.fams).toEqual([])
    expect(a.avertissements.some(m => m.includes('@F9@'))).toBe(true)
  })
})

describe('normaliserBalise', () => {
  it('majuscules, sans accents, caractère de remplacement lu comme E', () => {
    expect(normaliserBalise('_Célibataire')).toBe('_CELIBATAIRE')
    expect(normaliserBalise('_C�LIBATAIRE')).toBe('_CELIBATAIRE')
    expect(normaliserBalise('_DE-CUJUS_PARENT')).toBe('_DE-CUJUS_PARENT')
  })
})
