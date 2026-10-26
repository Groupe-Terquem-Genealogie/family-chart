import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { lireGedcom } from '../src/gedcom'
import { Boite, disposer, ECARTS } from '../src/disposition'

const remariage = () => lireGedcom(readFileSync(resolve(__dirname, 'fixtures/remariage.ged'), 'utf-8'))
const par = (boites: Boite[], id: string) => boites.find(b => b.personneId === id && !b.contenu.doublon)!
const haut = (b: Boite) => b.y + b.mesure.hauteurDessus
const bas = (b: Boite) => b.y + b.mesure.hauteurTotale
const [D, C, E1, R, E2, S, H] = ['@I1@', '@I2@', '@I3@', '@I4@', '@I5@', '@I6@', '@I7@']

describe('disposer', () => {
  it('centré sur le défunt : conjoint dessous, une branche par union, tout le monde présent', () => {
    const d = disposer(remariage(), D)
    expect(d.boites.length).toBe(7)
    expect(par(d.boites, C).role).toBe('conjoint')
    expect(par(d.boites, R).role).toBe('conjoint')
    expect(par(d.boites, S).role).toBe('conjoint')
    expect(par(d.boites, E1).role).toBe('lignee')
    expect(haut(par(d.boites, C))).toBeGreaterThan(bas(par(d.boites, D)))
    expect(haut(par(d.boites, E1))).toBeGreaterThan(bas(par(d.boites, C)))   // enfants D+C sous C
    expect(haut(par(d.boites, R))).toBeGreaterThan(bas(par(d.boites, C)))    // second mari sous C
    expect(haut(par(d.boites, E2))).toBeGreaterThan(bas(par(d.boites, R)))
    expect(haut(par(d.boites, S))).toBeGreaterThan(bas(par(d.boites, E2)))
    expect(haut(par(d.boites, H))).toBeGreaterThan(bas(par(d.boites, S)))
    expect(par(d.boites, E1).x).toBeLessThan(par(d.boites, R).x)             // union avec le défunt d'abord
    expect(d.boites.every(b => !b.ascendant)).toBe(true)
    expect(d.centreCle).toBe(par(d.boites, D).cle)
    expect(d.liens.length).toBe(6)
  })

  it('le conjoint porte la mention du mariage, le défunt sa croix', () => {
    const d = disposer(remariage(), D)
    expect(par(d.boites, C).contenu.dessus.map(l => l.texte)).toContain('M 10/05/1845')
    expect(par(d.boites, R).contenu.dessus.map(l => l.texte)).toContain('M 02/06/1860')
    expect(par(d.boites, D).contenu.defunt).toBe(true)
  })

  it('aucune boîte ne chevauche une autre', () => {
    const d = disposer(remariage(), D)
    for (const a of d.boites) for (const b of d.boites) {
      if (a === b) continue
      const disjoint = a.x + a.mesure.largeur <= b.x || b.x + b.mesure.largeur <= a.x
        || a.y + a.mesure.hauteurTotale <= b.y || b.y + b.mesure.hauteurTotale <= a.y
      expect(disjoint).toBe(true)
    }
  })

  it('écart vertical et liens orthogonaux', () => {
    const d = disposer(remariage(), D)
    const c = par(d.boites, C), dd = par(d.boites, D)
    expect(c.y).toBe(dd.y + dd.mesure.hauteurTotale + ECARTS.vertical)
    for (const l of d.liens) for (let i = 1; i < l.points.length; i++) {
      const [a, b] = [l.points[i - 1], l.points[i]]
      expect(a[0] === b[0] || a[1] === b[1]).toBe(true)
    }
  })

  it('centré sur un héritier : chemin ascendant jusqu’au défunt et sa descendance seulement', () => {
    const d = disposer(remariage(), H)
    const asc = d.boites.filter(b => b.ascendant).map(b => b.personneId)
    expect(asc).toEqual([D, C, R, E2, S])
    expect(d.boites.some(b => b.personneId === E1)).toBe(false)
    expect(d.centreCle).toBe(par(d.boites, H).cle)
    expect(par(d.boites, H).ascendant).toBe(false)
  })

  it('personne hors de l’arbre du défunt : remonte par ses parents', () => {
    const a = remariage()
    a.personnes.set('@X1@', { id: '@X1@', nom: 'PERE', prenoms: '', sexe: 'M', champs: {}, famc: [], fams: ['@FX@'], defunt: false })
    a.personnes.set('@X2@', { id: '@X2@', nom: 'FILS', prenoms: '', sexe: 'M', champs: {}, famc: ['@FX@'], fams: [], defunt: false })
    a.unions.set('@FX@', { id: '@FX@', conjoints: ['@X1@'], enfants: ['@X2@'] })
    const d = disposer(a, '@X2@')
    expect(d.boites.filter(b => b.ascendant).map(b => b.personneId)).toEqual(['@X1@'])
    expect(d.boites.length).toBe(2)
  })

  it('données cycliques : termine et marque les doublons', () => {
    const a = remariage()
    a.personnes.get(C)!.fams.push('@F1@')                                         // union listée deux fois
    a.unions.set('@F9@', { id: '@F9@', conjoints: [E1, C], enfants: [] })      // un enfant épouse une ascendante
    a.personnes.get(E1)!.fams.push('@F9@'); a.personnes.get(C)!.fams.push('@F9@')
    a.unions.get('@F3@')!.enfants.push(D)                                         // le défunt est son propre descendant
    a.personnes.get(D)!.famc.push('@F3@')
    const d = disposer(a, D)
    expect(d.boites.some(b => b.contenu.doublon)).toBe(true)
    expect(d.boites.length).toBeLessThan(20)
  })

  it('personne seule', () => {
    const a = remariage()
    a.personnes.set('@X@', { id: '@X@', nom: 'SEUL', prenoms: '', sexe: 'U', champs: {}, famc: [], fams: [], defunt: false })
    const d = disposer(a, '@X@')
    expect(d.boites.length).toBe(1)
    expect(d.liens.length).toBe(0)
  })

  it('branche repliée', () => {
    const d = disposer(remariage(), D, new Set([C]))
    expect(d.boites.map(b => b.personneId).sort()).toEqual([D, C].sort())
    expect(par(d.boites, C).contenu.replie).toBe(true)
  })

  it('compacte les sous-arbres : une descendance large se glisse sous un voisin étroit', () => {
    // R a deux enfants : A (large seulement à la 3e génération) et B (large dès la 2e).
    const a = lireGedcom('0 HEAD\n')
    const pers = (id: string) => a.personnes.set(id, { id, nom: id, prenoms: '', sexe: 'M', champs: {}, famc: [], fams: [], defunt: false })
    const union = (id: string, parent: string, enfants: string[]) => {
      a.unions.set(id, { id, conjoints: [parent], enfants })
      a.personnes.get(parent)!.fams.push(id)
      enfants.forEach(e => a.personnes.get(e)!.famc.push(id))
    }
    ;['R', 'A', 'B', 'A1', 'A11', 'A12', 'A13', 'B1', 'B2', 'B3'].forEach(pers)
    union('FR', 'R', ['A', 'B']); union('FA', 'A', ['A1']); union('FA1', 'A1', ['A11', 'A12', 'A13']); union('FB', 'B', ['B1', 'B2', 'B3'])
    a.defuntId = 'R'
    const d = disposer(a, 'R')
    const naif = 6 * 200 + 5 * ECARTS.horizontal
    expect(d.largeur).toBeLessThan(naif)
    expect(Math.min(...d.boites.map(b => b.x))).toBe(0)
    expect(d.largeur).toBe(Math.max(...d.boites.map(b => b.x + b.mesure.largeur)))
    for (const x of d.boites) for (const y of d.boites) {
      if (x === y) continue
      const disjoint = x.x + x.mesure.largeur <= y.x || y.x + y.mesure.largeur <= x.x
        || x.y + x.mesure.hauteurTotale <= y.y || y.y + y.mesure.hauteurTotale <= x.y
      expect(disjoint).toBe(true)
    }
    const centre = (id: string) => { const b = d.boites.find(x => x.personneId === id)!; return b.x + b.mesure.largeur / 2 }
    expect(centre('R')).toBeCloseTo((centre('A') + centre('B')) / 2)   // parent centré sur ses enfants
  })

  it('clés uniques', () => {
    const d = disposer(remariage(), D)
    expect(new Set(d.boites.map(b => b.cle)).size).toBe(d.boites.length)
  })
})
