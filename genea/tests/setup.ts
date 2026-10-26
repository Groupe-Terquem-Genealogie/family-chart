// jsdom n'implémente ni la géométrie SVG ni la mise en page : valeurs neutres pour les tests.
const proto = (globalThis as any).SVGElement?.prototype
if (proto && !proto.getBBox) proto.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 })
// d3-zoom lit width/height.baseVal du <svg> pour son étendue par défaut.
const svgProto = (globalThis as any).SVGSVGElement?.prototype
for (const dim of ['width', 'height']) {
  if (svgProto && !Object.getOwnPropertyDescriptor(svgProto, dim)?.get?.call(document.createElementNS('http://www.w3.org/2000/svg', 'svg')))
    Object.defineProperty(svgProto, dim, { configurable: true, get: () => ({ baseVal: { value: 0 } }) })
}
// d3-interpolate analyse les transform SVG via transform.baseVal.consolidate().
const elProto = (globalThis as any).SVGElement?.prototype
if (elProto && !('transform' in elProto))
  Object.defineProperty(elProto, 'transform', { configurable: true, get: () => ({ baseVal: { consolidate: () => null } }) })
