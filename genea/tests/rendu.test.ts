import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { lireGedcom } from '../src/gedcom'
import { disposer } from '../src/disposition'
import { creerVue, versData, versTree } from '../src/rendu'

const remariage = () => lireGedcom(readFileSync(resolve(__dirname, 'fixtures/remariage.ged'), 'utf-8'))
const [D, C, , , E2, , H] = ['@I1@', '@I2@', '@I3@', '@I4@', '@I5@', '@I6@', '@I7@']

const monter = () => {
  const cont = document.createElement('div')
  document.body.innerHTML = ''
  document.body.appendChild(cont)
  const arbre = remariage()
  const vue = creerVue(cont, () => arbre, { transition: 0 })
  return { cont, vue }
}
// Les cartes sortantes ne sont retirées du DOM qu'en fin de transition : on ne compte que les présentes.
const presentes = (cont: HTMLElement) =>
  [...cont.querySelectorAll<SVGGElement>('g.card_cont')].filter(g => !(g as any).__data__?.exiting)
const carte = (cont: HTMLElement, pid: string) =>
  presentes(cont).find(g => g.querySelector(`[data-personne="${pid}"]`))!

describe('versTree', () => {
  it('une donnée par boîte, tid uniques, liens repris', () => {
    const a = remariage()
    const disp = disposer(a, D)
    const t = versTree(disp, versData(a))
    expect(t.data.length).toBe(disp.boites.length)
    expect(new Set(t.data.map(d => d.tid)).size).toBe(t.data.length)
    expect(t.links!.length).toBe(disp.liens.length)
    expect(t.dim).toEqual({ width: disp.largeur, height: disp.hauteur, x_off: 0, y_off: 0 })
  })
})

describe('creerVue', () => {
  it('dessine conjoint arrondi, héritier bleu, croix du défunt, traits droits', () => {
    const { cont, vue } = monter()
    vue.afficher(D, true)
    expect(presentes(cont).length).toBe(7)
    expect(carte(cont, C).querySelector('rect.gv-boite')!.getAttribute('rx')).toBe('8')
    expect(carte(cont, H).querySelector('rect.gv-boite')!.getAttribute('fill')).toBe('#a9c8ee')
    expect(carte(cont, E2).querySelector('rect.gv-boite')!.getAttribute('fill')).toBe('#ffffff')
    expect([...carte(cont, D).querySelectorAll('text')].some(t => t.textContent === '✝')).toBe(true)
    const chemin = cont.querySelector('path.link')!.getAttribute('d')!
    expect(chemin).toMatch(/^M[\d.,-]+(L[\d.,-]+)+$/)       // segments droits uniquement
  })

  it('les textes hors de la case ont un halo (les liens passent derrière sans les barrer)', () => {
    const { cont, vue } = monter()
    vue.afficher(D, true)
    const mention = [...carte(cont, C).querySelectorAll('text')].find(t => t.textContent!.startsWith('M '))!
    expect(mention.classList.contains('gv-halo')).toBe(true)
    expect(carte(cont, D).querySelector('text.gv-croix')!.classList.contains('gv-halo')).toBe(true)
  })

  it('texte raccourci : infobulle avec le texte complet', () => {
    const cont = document.createElement('div')
    document.body.innerHTML = ''
    document.body.appendChild(cont)
    const arbre = remariage()
    arbre.personnes.get(H)!.prenoms = 'Hélène Marie Josèphe Antoinette Philomène'
    const vue = creerVue(cont, () => arbre, { transition: 0 })
    vue.afficher(D, true)
    const nom = carte(cont, H).querySelector('text')!
    const t = [...carte(cont, H).querySelectorAll('text')].find(x => x.textContent!.includes('…'))!
    expect(t.querySelector('title')!.textContent).toBe('EPOUX Hélène Marie Josèphe Antoinette Philomène')
    expect(nom).toBeTruthy()
  })

  it('afficher met la personne centrale en évidence (recherche, bouton Défunt)', () => {
    const { cont, vue } = monter()
    vue.afficher(D, true)
    carte(cont, E2).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    vue.afficher(H)
    expect(carte(cont, H).classList.contains('gv-selection')).toBe(true)
    expect(carte(cont, E2).classList.contains('gv-selection')).toBe(false)
  })

  it('clic : sélection et recentrage sur la personne', () => {
    const { cont, vue } = monter()
    const vu = vi.fn()
    vue.surSelection(vu)
    vue.afficher(D, true)
    carte(cont, E2).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(vu).toHaveBeenCalledWith(E2)
    expect(carte(cont, E2).classList.contains('gv-selection')).toBe(true)
    expect(presentes(cont).length).toBe(6)   // ascendants D, C, R + E2, S, H
  })

  it('bouton replier : la descendance disparaît sans sélection', () => {
    const { cont, vue } = monter()
    const vu = vi.fn()
    vue.surSelection(vu)
    vue.afficher(D, true)
    carte(cont, C).querySelector('.gv-replier')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(vu).not.toHaveBeenCalled()
    expect(presentes(cont).length).toBe(2)
    expect(carte(cont, C).querySelector('.gv-replier text')!.textContent).toBe('+')
  })
})
