// Pont entre la disposition genea et family-chart : family-chart fournit le SVG, le zoom,
// le déplacement et les transitions ; genea fournit les positions, les liens et les cartes.
import * as d3 from 'd3'
import { createChart } from '../../src/index'
import type { Data, Datum } from '../../src/types/data'
import type { TreeDatum } from '../../src/types/treeData'
import type { Tree } from '../../src/layout/calculate-tree'
import type { Link } from '../../src/layout/create-links'
import { Arbre } from './modele'
import { Boite, disposer, Disposition } from './disposition'
import { CARTE, Teinte } from './carte'

export const COULEURS = { heritier: '#a9c8ee', fond: '#ffffff', trait: '#333333',
  noir: '#111111', vert: '#2a8a2a', rouge: '#9b1c1c', selection: '#e07b00' }
const TEINTES: Record<Teinte, string> = { noir: COULEURS.noir, vert: COULEURS.vert, rouge: COULEURS.rouge }

type DatumBoite = TreeDatum & { boite: Boite; aDescendance: boolean }

export function versData(arbre: Arbre): Data {
  return [...arbre.personnes.values()].map(p => ({
    id: p.id, data: { gender: p.sexe === 'F' ? 'F' : 'M' }, rels: { parents: [], spouses: [], children: [] },
  } as Datum))
}

/** TreeDatum centré sur la boîte (x, y = centre du rectangle) ; la boîte centrale en premier. */
export function versTree(disp: Disposition, data: Data): Tree {
  const parDatum = new Map(data.map(d => [d.id, d]))
  const parents = new Set(disp.liens.map(l => l.parentCle))
  const boites = [...disp.boites].sort((a, b) => (a.cle === disp.centreCle ? -1 : b.cle === disp.centreCle ? 1 : 0))
  const tree: DatumBoite[] = boites.map(b => ({
    data: parDatum.get(b.personneId)!, tid: b.cle, depth: 0, boite: b,
    aDescendance: parents.has(b.cle) || !!b.contenu.replie,
    x: b.x + b.mesure.largeur / 2, y: b.y + b.mesure.hauteurDessus + b.mesure.hauteurBoite / 2,
  }))
  const links: Link[] = disp.liens.map(l => ({ id: l.cle, d: l.points, _d: () => l.points, curve: false, linear: true,
    depth: 0, is_ancestry: false, source: [] as TreeDatum[], target: [] as TreeDatum[] }))
  return { data: tree, data_stash: data, links, main_id: boites[0]?.personneId ?? '', is_horizontal: false,
    dim: { width: disp.largeur, height: disp.hauteur, x_off: 0, y_off: 0 } }
}

export interface Vue {
  afficher(centreId: string, initial?: boolean): void
  ajuster(): void
  surSelection(f: (personneId: string) => void): void
  centre(): string | null
}

export function creerVue(conteneur: HTMLElement, obtenirArbre: () => Arbre, options: { transition?: number } = {}): Vue {
  const transition = options.transition ?? 600
  let centre: string | null = null
  let selection: string | null = null
  const replies = new Set<string>()
  const ecouteurs: ((id: string) => void)[] = []

  const chart = createChart(conteneur, versData(obtenirArbre())) as any
  chart.setTransitionTime(transition)
    .setLayoutFunction((data: Data) => versTree(disposer(obtenirArbre(), centre!, replies), data))
    .setCardSvgRenderer(dessiner)
  const ecouteZoom = [conteneur, ...conteneur.querySelectorAll('*')].find(e => (e as any).__zoomObj) as any
  ecouteZoom?.__zoomObj.scaleExtent([0.005, 4])

  function rafraichir(props: object) {
    chart.updateData(versData(obtenirArbre()))
    chart.updateTree(props)
  }

  function dessiner(this: SVGGElement, d: TreeDatum) {
    const { boite: b, aDescendance } = d as DatumBoite
    const { mesure: m, contenu: c } = b
    const g = d3.select(this)
    g.selectAll('*').remove()
    g.classed('gv-selection', b.personneId === selection)
    const l = CARTE.largeur, hb = m.hauteurBoite, il = CARTE.interligne
    const gauche = -l / 2, hautBoite = -hb / 2
    const texte = (y: number, ligne: { texte: string; teinte: Teinte; gras?: boolean }, x = gauche + CARTE.marge) =>
      g.append('text').attr('x', x).attr('y', y).attr('fill', TEINTES[ligne.teinte])
        .attr('font-weight', ligne.gras ? 'bold' : null).attr('class', 'gv-texte').text(ligne.texte)

    if (c.defunt) g.append('text').attr('x', 0).attr('y', hautBoite - c.dessus.length * il - 6)
      .attr('text-anchor', 'middle').attr('class', 'gv-croix gv-halo').text('✝')
    c.dessus.forEach((ln, i) => texte(hautBoite - (c.dessus.length - i) * il + il - 3, ln).attr('class', 'gv-texte gv-halo'))
    g.append('rect').attr('class', 'gv-boite').attr('data-personne', b.personneId)
      .attr('x', gauche).attr('y', hautBoite).attr('width', l).attr('height', hb)
      .attr('rx', c.role === 'conjoint' ? 8 : 0)
      .attr('fill', c.heritier ? COULEURS.heritier : COULEURS.fond)
      .attr('stroke', b.personneId === selection ? COULEURS.selection : COULEURS.trait)
      .attr('stroke-width', b.personneId === selection ? 2.5 : 1)
    c.boite.forEach((ln, i) => texte(hautBoite + CARTE.marge + (i + 1) * il - 3, ln))
    c.dessous.forEach((ln, i) => texte(hb / 2 + (i + 1) * il - 3, ln).attr('class', 'gv-texte gv-halo'))

    if (aDescendance && !b.ascendant) {
      const bouton = g.append('g').attr('class', 'gv-replier')
        .attr('transform', `translate(${l / 2 - 9}, ${hb / 2 - 9})`)
      bouton.append('rect').attr('width', 14).attr('height', 14).attr('x', -7).attr('y', -7)
        .attr('fill', '#fff').attr('stroke', COULEURS.trait)
      bouton.append('text').attr('text-anchor', 'middle').attr('y', 4).text(c.replie ? '+' : '−')
      bouton.on('click', (e: MouseEvent) => {
        e.stopPropagation()
        if (replies.has(b.personneId)) replies.delete(b.personneId)
        else replies.add(b.personneId)
        rafraichir({ tree_position: 'inherit' })
      })
    }
    g.on('click', () => {
      selection = b.personneId
      vue.afficher(b.personneId)
      ecouteurs.forEach(f => f(b.personneId))
    })
  }

  const vue: Vue = {
    afficher(centreId, initial = false) {
      centre = centreId
      selection = centreId
      rafraichir(initial ? { initial: true } : { tree_position: 'main_to_middle', scale: 0.8 })
    },
    ajuster() { rafraichir({ tree_position: 'fit' }) },
    surSelection(f) { ecouteurs.push(f) },
    centre: () => centre,
  }
  return vue
}
