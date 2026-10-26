import { it, expect } from 'vitest'
import { createChart } from '../../src/index'

it('utilise la mise en page, les liens et le rendu fournis', () => {
  const cont = document.createElement('div'); document.body.appendChild(cont)
  const data = [{ id: 'a', data: { gender: 'M' as const }, rels: { parents: [], spouses: [], children: [] } }]
  const tree = { data: [
      { data: data[0], x: 0, y: 0, depth: 0, tid: 'a#1' },
      { data: data[0], x: 300, y: 0, depth: 0, tid: 'a#2' } ],
    links: [{ id: 'l1', d: [[0,0],[300,0]], _d: () => [[0,0],[0,0]], curve: false, depth: 0,
              is_ancestry: false, source: null as any, target: null as any }],
    data_stash: data, dim: { width: 600, height: 100, x_off: 0, y_off: 0 }, main_id: 'a', is_horizontal: false }
  const rendu = (function (this: SVGGElement) { this.setAttribute('data-ok', '1') })
  const chart = (createChart(cont, data) as any).setTransitionTime(0)
    .setLayoutFunction(() => tree as any).setCardSvgRenderer(rendu)
  chart.updateTree({ initial: true })
  expect(cont.querySelectorAll('g.card_cont').length).toBe(2)       // deux cartes, même personne
  expect(cont.querySelectorAll('path.link').length).toBe(1)
  expect(cont.querySelectorAll('g.card_cont[data-ok="1"]').length).toBe(2)  // chaque carte rendue (family-chart appelle le rendu à l'entrée et à la mise à jour)
})
