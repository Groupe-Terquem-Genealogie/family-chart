// jsdom n'implémente ni la géométrie SVG ni la mise en page : valeurs neutres pour les tests.
const proto = (globalThis as any).SVGElement?.prototype
if (proto && !proto.getBBox) proto.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 })
