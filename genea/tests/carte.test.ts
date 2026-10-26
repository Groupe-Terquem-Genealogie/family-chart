import { describe, it, expect } from 'vitest'
import { CARTE, contenuCarte, couper, formaterDate, formaterLieu, mesurer } from '../src/carte'
import { Personne, Union } from '../src/modele'

const pers = (p: Partial<Personne>): Personne =>
  ({ id: '@I1@', nom: 'MARTIN', prenoms: 'Jean', sexe: 'M', champs: {}, famc: [], fams: [], defunt: false, ...p })

describe('formatage', () => {
  it('dates', () => {
    expect(formaterDate('13 JAN 1866')).toBe('13/01/1866')
    expect(formaterDate('7 AUG 1924')).toBe('07/08/1924')
    expect(formaterDate('1863')).toBe('1863')
    expect(formaterDate(undefined)).toBe('')
  })
  it('dates incomplètes', () => {
    expect(formaterDate('MAR 1863')).toBe('03/1863')
    expect(formaterDate('ABT 1900')).toBe('vers 1900')
    expect(formaterDate('BEF 12 MAR 1900')).toBe('avant 12/03/1900')
    expect(formaterDate('AFT 1900')).toBe('après 1900')
    expect(formaterDate('EST 1900')).toBe('vers 1900')
    expect(formaterDate('BET 1900 AND 1905')).toBe('entre 1900 et 1905')
  })
  it('lieux', () => {
    expect(formaterLieu(', Saint Leu, 974, Réunion, , ')).toBe('Saint Leu, 974')
    expect(formaterLieu(', Inde, , , ,')).toBe('Inde')
    expect(formaterLieu('Paris')).toBe('Paris')
    expect(formaterLieu(undefined)).toBe('')
  })
  it('couper', () => {
    const t = 'mot '.repeat(20).trim()
    expect(couper(t).every(l => l.length <= CARTE.carMaxParLigne)).toBe(true)
    expect(couper(t).join(' ')).toBe(t)
    expect(couper('x'.repeat(80)).every(l => l.length <= 34)).toBe(true)
    expect(couper('')).toEqual([])
  })
})

describe('contenuCarte', () => {
  it('héritier : mentions rouges dessus, coordonnées vertes et profession dessous', () => {
    const c = contenuCarte(pers({ champs: { situation: 'Héritier', representation: 'Représenté(e)',
      adresse: '12 rue X', codePostal: '97422 LA SALINE', profession: 'Plaquiste', celibataire: 'Célibataire' } }), 'lignee')
    expect(c.heritier).toBe(true)
    expect(c.dessus[0]).toEqual({ texte: 'Représenté(e)', teinte: 'rouge', gras: true })
    expect(c.dessous.filter(l => l.teinte === 'vert').map(l => l.texte)).toEqual(['12 rue X', '97422 LA SALINE'])
    expect(c.dessous.filter(l => l.teinte === 'noir').map(l => l.texte)).toEqual(['Célibataire', 'Plaquiste'])
  })

  it('boîte : nom, naissance, décès', () => {
    const c = contenuCarte(pers({ naissance: { date: '13 JAN 1866', lieu: ', Saint Leu, 974, Réunion, ,' },
      deces: { date: '07 AUG 1924' } }), 'lignee')
    expect(c.boite.map(l => l.texte)).toEqual(['MARTIN Jean', 'N 13/01/1866 Saint Leu, 974', '✝ 07/08/1924'])
    expect(c.boite[0].gras).toBe(true)
  })

  it('conjoint : mariage au-dessus, divorce dans la boîte', () => {
    const u: Union = { id: '@F1@', conjoints: [], enfants: [], mariage: { date: '14 AUG 1948', lieu: ', Auch, 32, , ,' },
      divorce: { date: '08 MAR 1963' } }
    const c = contenuCarte(pers({}), 'conjoint', u)
    expect(c.role).toBe('conjoint')
    expect(c.dessus[c.dessus.length - 1]).toEqual({ texte: 'M 14/08/1948 Auch, 32', teinte: 'noir' })
    expect(c.boite[c.boite.length - 1].texte).toBe('Divorce 08/03/1963')
  })

  it('sans nom, doublon, défunt', () => {
    const c = contenuCarte(pers({ nom: '', prenoms: '', defunt: true }), 'lignee', undefined, true)
    expect(c.boite[0].texte).toBe('(sans nom)')
    expect(c.boite[c.boite.length - 1].texte).toBe('voir aussi')
    expect(c.doublon).toBe(true)
    expect(c.defunt).toBe(true)
  })

  it('lignes longues coupées', () => {
    const c = contenuCarte(pers({ champs: { regimeMatrimonial: 'Sép. de biens le 01/01/1970 Me Prénom NOMFICTIF notaire' } }), 'lignee')
    expect(c.dessous.length).toBe(2)
  })
})

describe('hauteur de case constante', () => {
  it('même hauteur de case quel que soit le contenu', () => {
    const vide = mesurer(contenuCarte(pers({}), 'lignee'))
    const pleine = mesurer(contenuCarte(pers({ naissance: { date: '13 JAN 1866', lieu: ', Saint Leu, 974, , ,' }, deces: { date: '1924' } }), 'conjoint',
      { id: '@F1@', conjoints: [], enfants: [], divorce: { date: '1960' } }))
    expect(vide.hauteurBoite).toBe(pleine.hauteurBoite)
    expect(CARTE.lignesBoite).toBe(4)
  })
  it('dans la case, une ligne trop longue est raccourcie, pas coupée', () => {
    const c = contenuCarte(pers({ nom: 'NOMCOMPOSE FICTIF DE LA GRANDE FAMILLE', prenoms: 'Paul Louis Marie Joseph' }), 'lignee')
    expect(c.boite.length).toBe(1)
    expect(c.boite[0].texte.length).toBeLessThanOrEqual(CARTE.carMaxParLigne)
    expect(c.boite[0].texte.endsWith('…')).toBe(true)
  })
  it('plus de lignes que la case : « voir aussi » passe dessous', () => {
    const c = contenuCarte(pers({ naissance: { date: '1900' }, deces: { date: '1980' } }), 'conjoint',
      { id: '@F1@', conjoints: [], enfants: [], divorce: { date: '1960' } }, true)
    expect(c.boite.length).toBe(4)
    expect(c.boite.map(l => l.texte)).not.toContain('voir aussi')
    expect(c.dessous[0].texte).toBe('voir aussi')
  })
})

describe('mesurer', () => {
  it('hauteurs', () => {
    const c = contenuCarte(pers({ champs: { representation: 'R', profession: 'P', adresse: 'A' } }), 'lignee')
    const m = mesurer(c)
    expect(m.largeur).toBe(200)
    expect(m.hauteurDessus).toBe(14)
    expect(m.hauteurBoite).toBe(CARTE.lignesBoite * 14 + 2 * 4)
    expect(m.hauteurTotale).toBe(m.hauteurDessus + m.hauteurBoite + c.dessous.length * 14)
  })
  it('défunt : place de la croix', () => {
    const m = mesurer(contenuCarte(pers({ defunt: true }), 'lignee'))
    expect(m.hauteurDessus).toBe(CARTE.croix)
  })
})
