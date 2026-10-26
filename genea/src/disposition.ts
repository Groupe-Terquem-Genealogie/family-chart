// Mise en page « à la Généatique » : le conjoint est placé SOUS la personne, chaque union
// (y compris les autres unions d'un conjoint) ouvre une branche, les enfants d'une union
// descendent de la boîte du conjoint. La vue est construite autour d'une personne centrale :
// au-dessus, le chemin qui la relie à la racine (le défunt) ; en dessous, toute sa descendance.
import { Arbre, Union } from './modele'
import { ContenuCarte, contenuCarte, Mesure, mesurer, Role } from './carte'

export interface Boite {
  cle: string
  personneId: string
  role: Role
  unionEntreeId?: string
  /** Coin haut-gauche de la zone totale (mentions du dessus comprises). */
  x: number
  y: number
  mesure: Mesure
  contenu: ContenuCarte
  ascendant: boolean
}
export interface Lien { cle: string; parentCle: string; points: [number, number][] }
export interface Disposition { boites: Boite[]; liens: Lien[]; largeur: number; hauteur: number; centreCle: string }

export const ECARTS = { horizontal: 24, vertical: 36 }

interface Noeud {
  cle: string
  personneId: string
  role: Role
  unionEntree?: Union
  doublon: boolean
  enfants: Noeud[]
  parent?: Noeud
}

/** Date GEDCOM complète → aaaammjj ; sinon null. */
function cleDate(d?: string): number | null {
  const MOIS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  const m = d ? /^(\d{1,2}) ([A-Z]{3}) (\d{3,4})$/.exec(d.trim()) : null
  if (!m || !MOIS.includes(m[2])) return null
  return +m[3] * 10000 + (MOIS.indexOf(m[2]) + 1) * 100 + +m[1]
}

/** Tri stable : dates complètes d'abord (croissantes), puis l'ordre d'origine. */
function trierParDate<T>(elts: T[], date: (e: T) => string | undefined): T[] {
  return elts.map((e, i) => ({ e, i, k: cleDate(date(e)) }))
    .sort((a, b) => (a.k === null ? 1 : 0) - (b.k === null ? 1 : 0) || (a.k ?? 0) - (b.k ?? 0) || a.i - b.i)
    .map(x => x.e)
}

/** Arbre complet des nœuds depuis une racine ; chaque union n'est développée qu'une fois. */
function construire(arbre: Arbre, racineId: string): Noeud {
  const places = new Set<string>()
  const developpees = new Set<string>()
  const occurrences = new Map<string, number>()

  const noeud = (pid: string, role: Role, unionEntree?: Union, parent?: Noeud): Noeud => {
    const n = (occurrences.get(pid) ?? 0) + 1
    occurrences.set(pid, n)
    const doublon = places.has(pid)
    places.add(pid)
    const nd: Noeud = { cle: `${pid}#${n}`, personneId: pid, role, unionEntree, doublon, enfants: [], parent }
    const enfantsDe = (u: Union) => trierParDate(u.enfants.filter(c => arbre.personnes.has(c)),
      c => arbre.personnes.get(c)!.naissance?.date).map(c => noeud(c, 'lignee', undefined, nd))

    if (unionEntree) nd.enfants.push(...enfantsDe(unionEntree))
    if (doublon) return nd
    const p = arbre.personnes.get(pid)
    const unions = trierParDate((p?.fams ?? []).map(f => arbre.unions.get(f)).filter((u): u is Union => !!u),
      u => u.mariage?.date)
    for (const u of unions) {
      if (u === unionEntree || developpees.has(u.id)) continue
      developpees.add(u.id)
      const autre = u.conjoints.find(c => c !== pid && arbre.personnes.has(c))
      if (autre) nd.enfants.push(noeud(autre, 'conjoint', u, nd))
      else nd.enfants.push(...enfantsDe(u))
    }
    return nd
  }
  return noeud(racineId, 'lignee')
}

function trouver(n: Noeud, pid: string): Noeud | undefined {
  if (n.personneId === pid && !n.doublon) return n
  for (const e of n.enfants) { const r = trouver(e, pid); if (r) return r }
  return undefined
}

/** Ancêtre le plus haut par les parents (père d'abord), sans boucler. */
function ancetreHaut(arbre: Arbre, pid: string): string {
  const vus = new Set([pid])
  let cur = pid
  for (;;) {
    const u = arbre.unions.get(arbre.personnes.get(cur)?.famc[0] ?? '')
    if (!u) return cur
    const parents = u.conjoints.filter(c => arbre.personnes.has(c))
    const pere = parents.find(c => arbre.personnes.get(c)!.sexe === 'M') ?? parents[0]
    if (!pere || vus.has(pere)) return cur
    vus.add(pere); cur = pere
  }
}

export function disposer(arbre: Arbre, centreId: string, replies?: ReadonlySet<string>): Disposition {
  if (!arbre.personnes.has(centreId)) throw new Error(`Personne ${centreId} introuvable`)
  // 1. Arbre complet depuis le défunt ; si le centre n'y est pas, depuis son ancêtre le plus haut.
  let racine = arbre.defuntId ? construire(arbre, arbre.defuntId) : undefined
  let centre = racine && trouver(racine, centreId)
  if (!centre) {
    racine = construire(arbre, ancetreHaut(arbre, centreId))
    centre = trouver(racine, centreId) ?? racine
  }

  // 2. Vue : chemin ascendant (une seule branche par niveau) puis la descendance du centre.
  const chemin: Noeud[] = []
  for (let n = centre.parent; n; n = n.parent) chemin.unshift(n)
  interface Vue { n: Noeud; ascendant: boolean; replie: boolean; enfants: Vue[] }
  const descendance = (n: Noeud): Vue => {
    const replie = !!replies?.has(n.personneId) && n.enfants.length > 0
    return { n, ascendant: false, replie, enfants: replie ? [] : n.enfants.map(descendance) }
  }
  let vue = descendance(centre)
  for (let i = chemin.length - 1; i >= 0; i--) vue = { n: chemin[i], ascendant: true, replie: false, enfants: [vue] }

  // 3. Contenus et mesures.
  const boites: Boite[] = []
  const liens: Lien[] = []
  const infos = new Map<Vue, { contenu: ContenuCarte; mesure: Mesure; largeurSousArbre: number }>()
  const preparer = (v: Vue) => {
    const p = arbre.personnes.get(v.n.personneId)!
    const contenu = contenuCarte(p, v.n.role, v.n.unionEntree, v.n.doublon)
    if (v.replie) contenu.replie = true
    const mesure = mesurer(contenu)
    v.enfants.forEach(preparer)
    const somme = v.enfants.reduce((s, e) => s + infos.get(e)!.largeurSousArbre, 0) + ECARTS.horizontal * Math.max(0, v.enfants.length - 1)
    infos.set(v, { contenu, mesure, largeurSousArbre: Math.max(mesure.largeur, somme) })
  }
  preparer(vue)

  // 4. Placement : parent centré au-dessus de ses enfants.
  let hauteur = 0
  const placer = (v: Vue, gauche: number, y: number): Boite => {
    const { contenu, mesure, largeurSousArbre } = infos.get(v)!
    const b: Boite = { cle: v.n.cle, personneId: v.n.personneId, role: v.n.role, unionEntreeId: v.n.unionEntree?.id,
      x: gauche + (largeurSousArbre - mesure.largeur) / 2, y, mesure, contenu, ascendant: v.ascendant }
    boites.push(b)
    hauteur = Math.max(hauteur, y + mesure.hauteurTotale)
    const yEnfants = y + mesure.hauteurTotale + ECARTS.vertical
    const somme = v.enfants.reduce((s, e) => s + infos.get(e)!.largeurSousArbre, 0) + ECARTS.horizontal * Math.max(0, v.enfants.length - 1)
    let g = gauche + (largeurSousArbre - somme) / 2
    for (const e of v.enfants) {
      const be = placer(e, g, yEnfants)
      g += infos.get(e)!.largeurSousArbre + ECARTS.horizontal
      const px = b.x + mesure.largeur / 2, py = y + mesure.hauteurDessus + mesure.hauteurBoite
      const cx = be.x + be.mesure.largeur / 2, cy = be.y + be.mesure.hauteurDessus
      const mi = yEnfants - ECARTS.vertical / 2
      liens.push({ cle: be.cle, parentCle: b.cle, points: [[px, py], [px, mi], [cx, mi], [cx, cy]] })
    }
    return b
  }
  placer(vue, 0, 0)

  return { boites, liens, largeur: infos.get(vue)!.largeurSousArbre, hauteur, centreCle: centre.cle }
}
