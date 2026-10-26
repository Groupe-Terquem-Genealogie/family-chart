// Contenu et mesure d'une carte, selon les conventions d'affichage de Généatique :
// mentions de l'étude en rouge au-dessus, identité et événements dans la boîte,
// mentions en noir et coordonnées en vert en dessous.
import { CleChamp, estHeritier, Personne, Union } from './modele'
import { dateVersAffichage } from './dates'

export type Teinte = 'noir' | 'vert' | 'rouge'
export interface Ligne { texte: string; teinte: Teinte; gras?: boolean }
export type Role = 'lignee' | 'conjoint'
export interface ContenuCarte {
  dessus: Ligne[]
  boite: Ligne[]
  dessous: Ligne[]
  heritier: boolean
  defunt: boolean
  role: Role
  doublon: boolean
  replie?: boolean
}
export interface Mesure { largeur: number; hauteurDessus: number; hauteurBoite: number; hauteurTotale: number }

/** lignesBoite : hauteur fixe des cases (nom, naissance, décès, divorce ou « voir aussi »), comme Généatique. */
export const CARTE = { largeur: 200, interligne: 14, marge: 4, croix: 28, carMaxParLigne: 34, lignesBoite: 4 }

export function formaterDate(d?: string): string {
  return dateVersAffichage(d)
}

/** « , Ville, Dépt, Région, , » → « Ville, Dépt ». */
export function formaterLieu(l?: string): string {
  if (!l) return ''
  const parts = l.split(',').map(s => s.trim())
  if (parts.length < 3) return parts.filter(Boolean).join(', ')
  return parts.slice(1, 3).filter(Boolean).join(', ')
}

export function couper(texte: string, max = CARTE.carMaxParLigne): string[] {
  const lignes: string[] = []
  let courante = ''
  for (let mot of texte.split(/\s+/).filter(Boolean)) {
    while (mot.length > max) {
      if (courante) { lignes.push(courante); courante = '' }
      lignes.push(mot.slice(0, max)); mot = mot.slice(max)
    }
    if (!mot) continue
    if (courante && courante.length + 1 + mot.length > max) { lignes.push(courante); courante = mot }
    else courante = courante ? `${courante} ${mot}` : mot
  }
  if (courante) lignes.push(courante)
  return lignes
}

/** Une seule ligne, raccourcie par « … » si elle dépasse la largeur de la case. */
function raccourcir(texte: string, max = CARTE.carMaxParLigne): string {
  const t = texte.replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…'
}

const evenement = (prefixe: string, date?: string, lieu?: string) =>
  [prefixe, formaterDate(date), formaterLieu(lieu)].filter(Boolean).join(' ')

const ROUGES: CleChamp[] = ['representation', 'representationConj', 'saisi', 'saisie']
const NOIRS: CleChamp[] = ['celibataire', 'sansPosterite', 'mortEnBasAge', 'regimeMatrimonial', 'profession']
const VERTS: CleChamp[] = ['adresse', 'adresseComplement', 'codePostal', 'telephoneHeritier', 'email',
  'adresseConjoint', 'adresse1Conjoint', 'cpConjoint', 'telephoneConjoint']

function lignes(textes: string[], teinte: Teinte, gras?: boolean): Ligne[] {
  return textes.flatMap(t => couper(t)).map(texte => (gras ? { texte, teinte, gras } : { texte, teinte }))
}

export function contenuCarte(p: Personne, role: Role, unionEntree?: Union, doublon = false): ContenuCarte {
  const champs = (cles: CleChamp[]) => cles.map(k => p.champs[k]).filter((v): v is string => !!v)
  const dessus = lignes(champs(ROUGES), 'rouge', true)
  if (role === 'conjoint' && unionEntree?.mariage) dessus.push(...lignes([evenement('M', unionEntree.mariage.date, unionEntree.mariage.lieu)], 'noir'))

  const nom = [p.nom, p.prenoms].filter(Boolean).join(' ') || '(sans nom)'
  const boite: Ligne[] = [{ texte: raccourcir(nom), teinte: 'noir', gras: true }]
  const ligneBoite = (texte: string) => boite.push({ texte: raccourcir(texte), teinte: 'noir' })
  if (p.naissance) ligneBoite(evenement('N', p.naissance.date, p.naissance.lieu))
  if (p.deces) ligneBoite(evenement('✝', p.deces.date, p.deces.lieu))
  if (role === 'conjoint' && unionEntree?.divorce) ligneBoite(evenement('Divorce', unionEntree.divorce.date, unionEntree.divorce.lieu))

  const dessous = [...lignes(champs(NOIRS), 'noir'), ...lignes(champs(VERTS), 'vert')]
  const voirAussi: Ligne = { texte: 'voir aussi', teinte: 'noir' }
  if (doublon) {
    if (boite.length < CARTE.lignesBoite) boite.push(voirAussi)
    else dessous.unshift(voirAussi)
  }
  return { dessus, boite, dessous, heritier: estHeritier(p), defunt: p.defunt, role, doublon }
}

export function mesurer(c: ContenuCarte): Mesure {
  const hauteurDessus = c.dessus.length * CARTE.interligne + (c.defunt ? CARTE.croix : 0)
  const hauteurBoite = CARTE.lignesBoite * CARTE.interligne + 2 * CARTE.marge
  return { largeur: CARTE.largeur, hauteurDessus, hauteurBoite,
    hauteurTotale: hauteurDessus + hauteurBoite + c.dessous.length * CARTE.interligne }
}
