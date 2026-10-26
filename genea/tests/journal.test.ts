import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { lireGedcom } from '../src/gedcom'
import { ajouterEntree, appliquerJournal, journalVide, nouvelId, Operation } from '../src/journal'

const base = () => lireGedcom(readFileSync(resolve(__dirname, 'fixtures/mini.ged'), 'utf-8'))
const avec = (...ops: Operation[]) => {
  let j = journalVide('mini.ged')
  for (const op of ops) j = ajouterEntree(j, op, new Date('2026-10-26T10:00:00Z'))
  return j
}
const personne = (id: string) => ({ id, nom: 'NOUVEAU', prenoms: 'Paul', sexe: 'M' as const, champs: {} })

describe('journal', () => {
  it('nouvelId', () => {
    const a = nouvelId('I'), b = nouvelId('I')
    expect(a).toMatch(/^@GV-I-[0-9a-z]+@$/)
    expect(nouvelId('F')).toMatch(/^@GV-F-[0-9a-z]+@$/)
    expect(a).not.toBe(b)
  })

  it('ajouterEntree horodate et ne modifie pas le journal reçu', () => {
    const j0 = journalVide('mini.ged')
    const j1 = ajouterEntree(j0, { type: 'supprimerUnion', unionId: '@F2@' }, new Date('2026-10-26T10:00:00Z'))
    expect(j0.entrees.length).toBe(0)
    expect(j1.entrees[0].horodatage).toBe('2026-10-26T10:00:00.000Z')
    expect(j1.entrees[0].id).toBeTruthy()
    expect(j1.version).toBe(1)
    expect(j1.gedcom).toBe('mini.ged')
  })

  it("n'altère pas l'arbre d'entrée", () => {
    const a = base()
    const avant = JSON.stringify([...a.personnes.values(), ...a.unions.values()])
    appliquerJournal(a, avec({ type: 'modifierPersonne', personneId: '@I3@', valeurs: { nom: 'X', champs: { profession: 'Y' } } },
      { type: 'supprimerPersonne', personneId: '@I5@' }))
    expect(JSON.stringify([...a.personnes.values(), ...a.unions.values()])).toBe(avant)
  })

  it('modifier une fiche ; une valeur vide supprime le champ', () => {
    const r = appliquerJournal(base(), avec({ type: 'modifierPersonne', personneId: '@I3@',
      valeurs: { prenoms: 'Jean', champs: { profession: '', celibataire: 'Non' } } }))
    const p = r.personnes.get('@I3@')!
    expect(p.prenoms).toBe('Jean')
    expect(p.champs.profession).toBeUndefined()
    expect(p.champs.celibataire).toBe('Non')
    expect(p.champs.adresse).toBe('12 rue X')
  })

  it('ajouter un enfant', () => {
    const r = appliquerJournal(base(), avec(
      { type: 'ajouterPersonne', personne: personne('@GV-I-1@') },
      { type: 'modifierUnion', unionId: '@F1@', valeurs: { enfants: ['@I3@', '@GV-I-1@'] } }))
    expect(r.personnes.get('@GV-I-1@')!.famc).toEqual(['@F1@'])
    expect(r.unions.get('@F1@')!.enfants).toEqual(['@I3@', '@GV-I-1@'])
  })

  it('ajouter un conjoint', () => {
    const r = appliquerJournal(base(), avec(
      { type: 'ajouterPersonne', personne: personne('@GV-I-2@') },
      { type: 'ajouterUnion', union: { id: '@GV-F-1@', conjoints: ['@I5@', '@GV-I-2@'], enfants: [], mariage: { date: '1 JAN 2000' } } }))
    expect(r.personnes.get('@I5@')!.fams).toEqual(['@GV-F-1@'])
    expect(r.personnes.get('@GV-I-2@')!.fams).toEqual(['@GV-F-1@'])
  })

  it('supprimer une personne la retire des unions', () => {
    const r = appliquerJournal(base(), avec({ type: 'supprimerPersonne', personneId: '@I3@' }))
    expect(r.personnes.has('@I3@')).toBe(false)
    expect(r.unions.get('@F1@')!.enfants).toEqual([])
    expect(r.unions.get('@F2@')!.conjoints).toEqual(['@I4@'])
  })

  it("une union sans conjoint ni enfant disparaît", () => {
    const r = appliquerJournal(base(), avec({ type: 'supprimerPersonne', personneId: '@I4@' },
      { type: 'supprimerPersonne', personneId: '@I3@' }, { type: 'supprimerPersonne', personneId: '@I5@' }))
    expect(r.unions.has('@F2@')).toBe(false)
  })

  it('supprimer une union', () => {
    const r = appliquerJournal(base(), avec({ type: 'supprimerUnion', unionId: '@F2@' }))
    expect(r.unions.has('@F2@')).toBe(false)
    expect(r.personnes.get('@I5@')!.famc).toEqual([])
    expect(r.personnes.get('@I3@')!.fams).toEqual([])
  })

  it('opération sur une référence absente : ignorée avec avertissement, les autres appliquées', () => {
    const r = appliquerJournal(base(), avec(
      { type: 'modifierPersonne', personneId: '@I999@', valeurs: { nom: 'X' } },
      { type: 'modifierUnion', unionId: '@F999@', valeurs: { enfants: [] } },
      { type: 'modifierPersonne', personneId: '@I3@', valeurs: { nom: 'DUPONT' } }))
    expect(r.avertissements).toContain('Opération ignorée : personne @I999@ introuvable')
    expect(r.avertissements).toContain('Opération ignorée : union @F999@ introuvable')
    expect(r.personnes.get('@I3@')!.nom).toBe('DUPONT')
  })

  it("une union qui cite une personne absente l'ignore", () => {
    const r = appliquerJournal(base(), avec(
      { type: 'modifierUnion', unionId: '@F1@', valeurs: { enfants: ['@I3@', '@I999@'] } }))
    expect(r.unions.get('@F1@')!.enfants).toEqual(['@I3@'])
    expect(r.avertissements.some(a => a.includes('@I999@'))).toBe(true)
  })
})
