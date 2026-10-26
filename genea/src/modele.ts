// Modèle d'un arbre lu dans un export GEDCOM Généatique.

/** Événement daté et localisé ; valeurs brutes du GEDCOM (formatées à l'affichage). */
export interface Evenement { date?: string; lieu?: string }

export type CleChamp = 'profession' | 'celibataire' | 'sansPosterite' | 'mortEnBasAge'
  | 'regimeMatrimonial' | 'representation' | 'representationConj' | 'saisi' | 'saisie'
  | 'situation' | 'adresse' | 'adresseComplement' | 'codePostal' | 'telephoneHeritier'
  | 'email' | 'adresseConjoint' | 'adresse1Conjoint' | 'cpConjoint' | 'telephoneConjoint'
  | 'enfantLegitime' | 'enfantReconnuPere' | 'enfantReconnuMere' | 'rc'

export interface Personne {
  id: string
  nom: string
  prenoms: string
  sexe: 'M' | 'F' | 'U'
  naissance?: Evenement
  deces?: Evenement
  champs: Partial<Record<CleChamp, string>>
  famc: string[]
  fams: string[]
  defunt: boolean
}

export interface Union {
  id: string
  conjoints: string[]
  mariage?: Evenement
  divorce?: Evenement
  enfants: string[]
}

export interface Arbre {
  personnes: Map<string, Personne>
  unions: Map<string, Union>
  defuntId: string | null
  avertissements: string[]
}

/** Comparaison sans casse ni accents. */
export function sansAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function estHeritier(p: Personne): boolean {
  return sansAccents((p.champs.situation ?? '').trim()) === 'heritier'
}
