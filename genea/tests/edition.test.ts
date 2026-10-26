import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { lireGedcom } from '../src/gedcom'
import { ajouterEntree, appliquerJournal, journalVide, Operation } from '../src/journal'
import { disposer } from '../src/disposition'
import { rechercher } from '../src/recherche'
import { opsAjouterConjoint, opsAjouterEnfant, opsAjouterParent, opsModifierFiche, opsSupprimerPersonne,
  opsSupprimerUnion, opsDelier, SaisieFiche } from '../src/edition'
import { Arbre } from '../src/modele'

const remariage = () => lireGedcom(readFileSync(resolve(__dirname, 'fixtures/remariage.ged'), 'utf-8'))
const [D, C, E1, , E2, S, H] = ['@I1@', '@I2@', '@I3@', '@I4@', '@I5@', '@I6@', '@I7@']
const saisie = (nom = 'NOUVEAU'): SaisieFiche => ({ nom, prenoms: 'Léo', sexe: 'M', champs: {} })
const jouer = (a: Arbre, ops: Operation[]) => {
  let j = journalVide('x.ged')
  for (const op of ops) j = ajouterEntree(j, op)
  return appliquerJournal(a, j)
}

describe('rechercher', () => {
  it('insensible à la casse et aux accents, tous les mots', () => {
    const a = remariage()
    expect(rechercher(a, 'helene epoux').map(p => p.id)).toEqual([H])
    expect(rechercher(a, 'ADÈLE').map(p => p.id)).toEqual([E2])
    expect(rechercher(a, 'epoux').map(p => p.id).sort()).toEqual([S, H].sort())
    expect(rechercher(a, '')).toEqual([])
    expect(rechercher(a, '   ')).toEqual([])
  })
  it('limite le nombre de résultats', () => {
    expect(rechercher(remariage(), 'e', 2).length).toBe(2)
  })
})

describe('édition', () => {
  it('modifier une fiche : vider un champ produit une chaîne vide', () => {
    const a = remariage()
    a.personnes.get(H)!.champs.profession = 'Plaquiste'
    const ops = opsModifierFiche(a, H, { nom: 'EPOUX', prenoms: 'Hélène', sexe: 'F', champs: { profession: '' } })
    expect(ops.length).toBe(1)
    const op = ops[0] as Extract<Operation, { type: 'modifierPersonne' }>
    expect(op.valeurs.champs!.profession).toBe('')
    expect(jouer(a, ops).personnes.get(H)!.champs.profession).toBeUndefined()
  })

  it('modifier une fiche : seuls les champs changés sont envoyés, rien si rien ne change', () => {
    const a = remariage()
    expect(opsModifierFiche(a, H, { nom: 'EPOUX', prenoms: 'Hélène', sexe: 'F', champs: {} })).toEqual([])
    const ops = opsModifierFiche(a, H, { nom: 'EPOUSE', prenoms: 'Hélène', sexe: 'F', champs: {} })
    expect(ops).toEqual([{ type: 'modifierPersonne', personneId: H, valeurs: { nom: 'EPOUSE' } }])
  })

  it('supprimer le lien de mariage : le conjoint est détaché, les enfants restent', () => {
    const a = remariage()
    const ops = opsDelier(a, '@F3@', S, 'conjoint')
    expect(ops).toEqual([{ type: 'delierPersonne', unionId: '@F3@', personneId: S, role: 'conjoint' }])
    const b = jouer(a, ops)
    expect(b.unions.get('@F3@')!.conjoints).toEqual([E2])
    expect(b.unions.get('@F3@')!.enfants).toEqual([H])
  })

  it('ajouter un enfant à une union : il apparaît sous le bon conjoint', () => {
    const a = remariage()
    const ops = opsAjouterEnfant(a, C, '@F2@', saisie('BEBE'))
    expect(ops.map(o => o.type)).toEqual(['ajouterPersonne', 'lierPersonne'])
    const b = jouer(a, ops)
    const id = (ops[0] as Extract<Operation, { type: 'ajouterPersonne' }>).personne.id
    expect(b.personnes.get(id)!.famc).toEqual(['@F2@'])
    const d = disposer(b, D)
    const bebe = d.boites.find(x => x.personneId === id)!
    const r = d.boites.find(x => x.personneId === '@I4@')!
    expect(bebe.y).toBeGreaterThan(r.y)
  })

  it('ajouter un enfant sans union : nouvelle union à un seul parent', () => {
    const a = remariage()
    const ops = opsAjouterEnfant(a, H, null, saisie())
    expect(ops.map(o => o.type)).toEqual(['ajouterPersonne', 'ajouterUnion'])
    const u = (ops[1] as Extract<Operation, { type: 'ajouterUnion' }>).union
    expect(u.conjoints).toEqual([H])
    expect(u.enfants).toEqual([(ops[0] as Extract<Operation, { type: 'ajouterPersonne' }>).personne.id])
  })

  it('ajouter un conjoint : nouvelle union avec mariage', () => {
    const a = remariage()
    const ops = opsAjouterConjoint(a, H, saisie(), { date: '01 JAN 2000' })
    const u = (ops[1] as Extract<Operation, { type: 'ajouterUnion' }>).union
    expect(u.conjoints[0]).toBe(H)
    expect(u.mariage).toEqual({ date: '01 JAN 2000' })
    expect(jouer(a, ops).personnes.get(H)!.fams.length).toBe(1)
  })

  it('ajouter un parent à une personne sans parent : nouvelle union', () => {
    const a = remariage()
    const ops = opsAjouterParent(a, S, saisie())
    expect(ops.map(o => o.type)).toEqual(['ajouterPersonne', 'ajouterUnion'])
    expect((ops[1] as Extract<Operation, { type: 'ajouterUnion' }>).union.enfants).toEqual([S])
  })

  it("ajouter un parent quand l'union d'origine n'en a qu'un : il la rejoint", () => {
    const a = remariage()
    a.unions.get('@F3@')!.conjoints = [E2]
    const ops = opsAjouterParent(a, H, saisie())
    expect(ops.map(o => o.type)).toEqual(['ajouterPersonne', 'lierPersonne'])
    const nouveau = (ops[0] as Extract<Operation, { type: 'ajouterPersonne' }>).personne.id
    expect(jouer(a, ops).unions.get('@F3@')!.conjoints).toEqual([E2, nouveau])
  })

  it('supprimer une personne compte les personnes détachées du défunt', () => {
    const r = opsSupprimerPersonne(remariage(), E2)
    expect(r.operations).toEqual([{ type: 'supprimerPersonne', personneId: E2 }])
    expect(r.descendantsDetaches).toBe(2)          // S et H ne sont plus atteignables
    expect(opsSupprimerPersonne(remariage(), E1).descendantsDetaches).toBe(0)
  })

  it('supprimer une union', () => {
    expect(opsSupprimerUnion(remariage(), '@F3@')).toEqual([{ type: 'supprimerUnion', unionId: '@F3@' }])
  })
})
