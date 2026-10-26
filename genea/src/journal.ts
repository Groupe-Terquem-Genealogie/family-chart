// Journal des modifications : le GEDCOM n'est jamais modifié, chaque changement est une
// opération horodatée rejouée à l'ouverture (et, plus tard, dans l'intranet).
import { Arbre, CleChamp, Personne, Union } from './modele'

export type Operation =
  | { type: 'modifierPersonne'; personneId: string;
      valeurs: Partial<Pick<Personne, 'nom' | 'prenoms' | 'sexe' | 'naissance' | 'deces'>> & { champs?: Partial<Record<CleChamp, string>> } }
  | { type: 'ajouterPersonne'; personne: Omit<Personne, 'famc' | 'fams' | 'defunt'> }
  | { type: 'supprimerPersonne'; personneId: string }
  | { type: 'ajouterUnion'; union: Union }
  | { type: 'modifierUnion'; unionId: string; valeurs: Partial<Omit<Union, 'id'>> }
  | { type: 'supprimerUnion'; unionId: string }
  /** Delta : rattache ou détache une seule personne, sans réécrire la liste (rejouable sur un GEDCOM ré-exporté). */
  | { type: 'lierPersonne'; unionId: string; personneId: string; role: 'conjoint' | 'enfant' }
  | { type: 'delierPersonne'; unionId: string; personneId: string; role: 'conjoint' | 'enfant' }

export interface EntreeJournal { id: string; horodatage: string; operation: Operation }
export interface Journal { version: 1; gedcom: string; entrees: EntreeJournal[] }

export function journalVide(gedcom: string): Journal {
  return { version: 1, gedcom, entrees: [] }
}

let compteur = 0
/** Identifiant hors de l'espace des xref Généatique (@I…@, @F…@). */
export function nouvelId(prefixe: 'I' | 'F'): string {
  compteur = (compteur + 1) % 1296
  const alea = Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')
  return `@GV-${prefixe}-${Date.now().toString(36)}${compteur.toString(36).padStart(2, '0')}${alea}@`
}

export function ajouterEntree(journal: Journal, op: Operation, maintenant = new Date()): Journal {
  const entree: EntreeJournal = { id: nouvelId('I').slice(6, -1), horodatage: maintenant.toISOString(), operation: op }
  return { ...journal, entrees: [...journal.entrees, entree] }
}

const copie = <T>(o: T): T => JSON.parse(JSON.stringify(o))

export function appliquerJournal(base: Arbre, journal: Journal): Arbre {
  const a: Arbre = {
    personnes: new Map([...base.personnes].map(([k, p]) => [k, copie(p)])),
    unions: new Map([...base.unions].map(([k, u]) => [k, copie(u)])),
    defuntId: base.defuntId,
    avertissements: [...base.avertissements],
  }
  const ignorer = (quoi: string, id: string) => a.avertissements.push(`Opération ignorée : ${quoi} ${id} introuvable`)

  for (const { operation: op } of journal.entrees) {
    switch (op.type) {
      case 'modifierPersonne': {
        const p = a.personnes.get(op.personneId)
        if (!p) { ignorer('personne', op.personneId); break }
        const { champs, ...reste } = copie(op.valeurs)
        Object.assign(p, reste)
        viderEvenements(p, ['naissance', 'deces'].filter(k => k in op.valeurs))
        for (const [k, v] of Object.entries(champs ?? {}) as [CleChamp, string][]) {
          if (v === '') delete p.champs[k]
          else p.champs[k] = v
        }
        break
      }
      case 'ajouterPersonne':
        a.personnes.set(op.personne.id, { ...copie(op.personne), famc: [], fams: [], defunt: false })
        break
      case 'supprimerPersonne':
        if (!a.personnes.delete(op.personneId)) { ignorer('personne', op.personneId); break }
        if (a.defuntId === op.personneId) a.defuntId = null
        for (const u of a.unions.values()) {
          u.conjoints = u.conjoints.filter(id => id !== op.personneId)
          u.enfants = u.enfants.filter(id => id !== op.personneId)
        }
        break
      case 'ajouterUnion':
        a.unions.set(op.union.id, copie(op.union))
        break
      case 'modifierUnion': {
        const u = a.unions.get(op.unionId)
        if (!u) { ignorer('union', op.unionId); break }
        Object.assign(u, copie(op.valeurs))
        viderEvenements(u, ['mariage', 'divorce'].filter(k => k in op.valeurs))
        break
      }
      case 'supprimerUnion':
        if (!a.unions.delete(op.unionId)) ignorer('union', op.unionId)
        break
      case 'lierPersonne':
      case 'delierPersonne': {
        const u = a.unions.get(op.unionId)
        if (!u) { ignorer('union', op.unionId); break }
        if (!a.personnes.has(op.personneId)) { ignorer('personne', op.personneId); break }
        const cle = op.role === 'conjoint' ? 'conjoints' : 'enfants'
        if (op.type === 'delierPersonne') u[cle] = u[cle].filter(id => id !== op.personneId)
        else if (!u[cle].includes(op.personneId)) u[cle].push(op.personneId)
        break
      }
    }
  }
  recalculerLiens(a)
  return a
}

/** Un événement sans date ni lieu envoyé par une modification signifie « supprimé ». */
function viderEvenements(o: object, cles: string[]) {
  const r = o as Record<string, { date?: string; lieu?: string } | undefined>
  for (const k of cles) if (k in r && (!r[k] || (!r[k]!.date && !r[k]!.lieu))) delete r[k]
}

/** famc/fams déduits des unions (seule source de vérité) ; références absentes retirées. */
function recalculerLiens(a: Arbre) {
  const avant = new Map([...a.personnes].map(([id, p]) => [id, { famc: p.famc, fams: p.fams }]))
  for (const p of a.personnes.values()) { p.famc = []; p.fams = [] }
  for (const [id, u] of [...a.unions]) {
    const garder = (pid: string) => {
      if (a.personnes.has(pid)) return true
      a.avertissements.push(`Union ${id} : personne ${pid} introuvable, lien ignoré`)
      return false
    }
    u.conjoints = u.conjoints.filter(garder)
    u.enfants = u.enfants.filter(garder)
    if (!u.conjoints.length && !u.enfants.length) { a.unions.delete(id); continue }
    u.conjoints.forEach(pid => a.personnes.get(pid)!.fams.push(id))
    u.enfants.forEach(pid => a.personnes.get(pid)!.famc.push(id))
  }
  // Ordre d'origine conservé (il fixe l'ordre des branches), nouvelles unions à la fin.
  const ordonner = (refs: string[], ancien: string[] = []) =>
    [...ancien.filter(f => refs.includes(f)), ...refs.filter(f => !ancien.includes(f))]
  for (const [id, p] of a.personnes) {
    p.famc = ordonner(p.famc, avant.get(id)?.famc)
    p.fams = ordonner(p.fams, avant.get(id)?.fams)
  }
}
