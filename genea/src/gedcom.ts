// Lecture d'un export GEDCOM de Généatique.
// Particularités : noms de balises personnalisées accentués (parfois illisibles, U+FFFD),
// champs détournés (ADRESSE/TÉLÉPHONE = rue…), défunt marqué par _DE-CUJUS_PARENT.
import { Arbre, CleChamp, Evenement, Personne, Union } from './modele'

/** Majuscules, sans accents ; U+FFFD lu comme E (seuls É/È apparaissent dans ces balises). */
export function normaliserBalise(b: string): string {
  return b.replace(/�/g, 'E').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9_-]/g, '')
}

/** Balise de niveau 1 d'un individu → champ. */
const CHAMPS: Record<string, CleChamp> = {
  OCCU: 'profession',
  _CELIBATAIRE: 'celibataire',
  _SANS_POSTERITE: 'sansPosterite',
  _MORT_EN_BAS_AGE: 'mortEnBasAge',
  _REGIME_MATRIMONIAL: 'regimeMatrimonial',
  _REPRESENTATION: 'representation',
  _REPRESENTATION_CONJ: 'representationConj',
  _SAISI: 'saisi',
  SAISIE: 'saisie',
  _SITUATION: 'situation',
  _ADRESSE_COMPLEMENT: 'adresseComplement',
  _CODE_POSTAL: 'codePostal',
  _TELEPHONE_HERITIER: 'telephoneHeritier',
  EMAIL: 'email',
  _ADRESSE_CONJOINT: 'adresseConjoint',
  _ADRESSE_1_CONJOINT: 'adresse1Conjoint',
  _CP_CONJOINT: 'cpConjoint',
  _TELEPHONE_CONJOINT: 'telephoneConjoint',
  _ENFANT_RECONNU_PERE: 'enfantReconnuPere',
  _ENFANT_RECONNU_MERE: 'enfantReconnuMere',
  _RC: 'rc',
}

interface Ligne { niveau: number; xref?: string; balise: string; valeur: string }

function decouper(texte: string): Ligne[] {
  const lignes: Ligne[] = []
  for (const brute of texte.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = /^\s*(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?: (.*))?$/.exec(brute)
    if (!m) continue
    lignes.push({ niveau: +m[1], xref: m[2], balise: normaliserBalise(m[3]), valeur: (m[4] ?? '').trim() })
  }
  return lignes
}

export function lireGedcom(texte: string): Arbre {
  const arbre: Arbre = { personnes: new Map(), unions: new Map(), defuntId: null, avertissements: [] }
  const lignes = decouper(texte)
  let i = 0
  while (i < lignes.length) {
    const tete = lignes[i]
    let fin = i + 1
    while (fin < lignes.length && lignes[fin].niveau > 0) fin++
    const corps = lignes.slice(i + 1, fin)
    if (tete.niveau === 0 && tete.xref && tete.balise === 'INDI') lirePersonne(arbre, tete.xref, corps)
    else if (tete.niveau === 0 && tete.xref && tete.balise === 'FAM') lireUnion(arbre, tete.xref, corps)
    i = fin
  }
  const defunts = [...arbre.personnes.values()].filter(p => p.defunt)
  if (defunts.length === 0) arbre.avertissements.push('Défunt non identifié')
  else {
    arbre.defuntId = defunts[0].id
    if (defunts.length > 1) arbre.avertissements.push(`Plusieurs défunts marqués : ${defunts[0].id} retenu`)
    defunts.slice(1).forEach(p => p.defunt = false)
  }
  return arbre
}

/** Regroupe chaque ligne de niveau 1 avec ses sous-lignes ; CONT/CONC recollés à la valeur. */
function blocs(corps: Ligne[]): { ligne: Ligne; sous: Ligne[] }[] {
  const res: { ligne: Ligne; sous: Ligne[] }[] = []
  for (const l of corps) {
    if (l.niveau === 1) res.push({ ligne: { ...l }, sous: [] })
    else if (res.length) {
      const b = res[res.length - 1]
      if (l.niveau === 2 && l.balise === 'CONT') b.ligne.valeur += '\n' + l.valeur
      else if (l.niveau === 2 && l.balise === 'CONC') b.ligne.valeur += l.valeur
      else b.sous.push(l)
    }
  }
  return res
}

function evenement(sous: Ligne[]): Evenement | undefined {
  const ev: Evenement = {}
  for (const l of sous) {
    if (l.niveau !== 2) continue
    if (l.balise === 'DATE' && l.valeur) ev.date = l.valeur
    if (l.balise === 'PLAC' && l.valeur) ev.lieu = l.valeur
  }
  return ev.date || ev.lieu ? ev : {}
}

function lirePersonne(arbre: Arbre, id: string, corps: Ligne[]) {
  const p: Personne = { id, nom: '', prenoms: '', sexe: 'U', champs: {}, famc: [], fams: [], defunt: false }
  for (const { ligne, sous } of blocs(corps)) {
    switch (ligne.balise) {
      case 'NAME': {
        const m = /^([^/]*)\/([^/]*)\/?/.exec(ligne.valeur)
        p.prenoms = (m ? m[1] : ligne.valeur).trim()
        p.nom = (m ? m[2] : '').trim()
        const givn = sous.find(s => s.balise === 'GIVN')?.valeur
        const surn = sous.find(s => s.balise === 'SURN')?.valeur
        if (givn) p.prenoms = givn
        if (surn) p.nom = surn
        break
      }
      case 'SEX': p.sexe = ligne.valeur === 'M' || ligne.valeur === 'F' ? ligne.valeur : 'U'; break
      case 'BIRT': p.naissance = evenement(sous); break
      case 'DEAT': p.deces = evenement(sous); break
      case 'FAMC': if (ligne.valeur) p.famc.push(ligne.valeur); break
      case 'FAMS': if (ligne.valeur) p.fams.push(ligne.valeur); break
      case '_DE-CUJUS_PARENT': p.defunt = true; break
      case 'ADRESSE': {
        const rue = sous.find(s => s.balise === 'TELEPHONE')?.valeur || ligne.valeur
        if (rue) p.champs.adresse = rue
        break
      }
      case 'ENFANT': {
        // « 1 ENFANT LÉGITIMÉ Légitimé » : le premier mot est une sous-balise collée à la valeur
        const v = ligne.valeur.replace(/^\S+\s*/, '')
        if (v) p.champs.enfantLegitime = v
        break
      }
      default: {
        const cle = CHAMPS[ligne.balise]
        if (cle && ligne.valeur) p.champs[cle] = ligne.valeur
      }
    }
  }
  arbre.personnes.set(id, p)
}

function lireUnion(arbre: Arbre, id: string, corps: Ligne[]) {
  const u: Union = { id, conjoints: [], enfants: [] }
  for (const { ligne, sous } of blocs(corps)) {
    if ((ligne.balise === 'HUSB' || ligne.balise === 'WIFE') && ligne.valeur) u.conjoints.push(ligne.valeur)
    else if (ligne.balise === 'CHIL' && ligne.valeur) u.enfants.push(ligne.valeur)
    else if (ligne.balise === 'MARR') u.mariage = evenement(sous)
    else if (ligne.balise === 'DIV') u.divorce = evenement(sous)
  }
  arbre.unions.set(id, u)
}
