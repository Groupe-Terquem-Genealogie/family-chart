// Actions d'édition → opérations du journal (fonctions pures, appliquées par appliquerJournal).
import { Arbre, CleChamp, Evenement } from './modele'
import { ajouterEntree, appliquerJournal, journalVide, nouvelId, Operation } from './journal'
import { disposer } from './disposition'

export interface SaisieFiche {
  nom: string
  prenoms: string
  sexe: 'M' | 'F' | 'U'
  naissance?: Evenement
  deces?: Evenement
  champs: Partial<Record<CleChamp, string>>
}

/** Seuls les champs réellement modifiés partent au journal (rien si rien ne change). */
export function opsModifierFiche(arbre: Arbre, personneId: string, saisie: SaisieFiche): Operation[] {
  const p = arbre.personnes.get(personneId)
  if (!p) return []
  const valeurs: Extract<Operation, { type: 'modifierPersonne' }>['valeurs'] = {}
  const differe = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b)
  for (const k of ['nom', 'prenoms', 'sexe'] as const) if (saisie[k] !== p[k]) (valeurs as Record<string, unknown>)[k] = saisie[k]
  for (const k of ['naissance', 'deces'] as const) if (k in saisie && differe(saisie[k], p[k])) valeurs[k] = saisie[k]
  const champs = Object.fromEntries(Object.entries(saisie.champs)
    .filter(([k, v]) => v !== (p.champs[k as CleChamp] ?? ''))) as SaisieFiche['champs']
  if (Object.keys(champs).length) valeurs.champs = champs
  return Object.keys(valeurs).length ? [{ type: 'modifierPersonne', personneId, valeurs }] : []
}

function nouvellePersonne(saisie: SaisieFiche): Extract<Operation, { type: 'ajouterPersonne' }> {
  const champs = Object.fromEntries(Object.entries(saisie.champs).filter(([, v]) => v)) as SaisieFiche['champs']
  return { type: 'ajouterPersonne', personne: { ...saisie, champs, id: nouvelId('I') } }
}

/** unionId null ⇒ nouvelle union dont le parent est le seul conjoint. */
export function opsAjouterEnfant(arbre: Arbre, parentId: string, unionId: string | null, saisie: SaisieFiche): Operation[] {
  const ajout = nouvellePersonne(saisie)
  const u = unionId ? arbre.unions.get(unionId) : undefined
  if (u) return [ajout, { type: 'lierPersonne', unionId: u.id, personneId: ajout.personne.id, role: 'enfant' }]
  return [ajout, { type: 'ajouterUnion', union: { id: nouvelId('F'), conjoints: [parentId], enfants: [ajout.personne.id] } }]
}

export function opsAjouterConjoint(arbre: Arbre, personneId: string, saisie: SaisieFiche, mariage?: Evenement): Operation[] {
  const ajout = nouvellePersonne(saisie)
  return [ajout, { type: 'ajouterUnion',
    union: { id: nouvelId('F'), conjoints: [personneId, ajout.personne.id], enfants: [], ...(mariage ? { mariage } : {}) } }]
}

export function opsAjouterParent(arbre: Arbre, personneId: string, saisie: SaisieFiche): Operation[] {
  const ajout = nouvellePersonne(saisie)
  const origine = arbre.personnes.get(personneId)?.famc.map(f => arbre.unions.get(f)).find(u => u && u.conjoints.length < 2)
  if (origine) return [ajout, { type: 'lierPersonne', unionId: origine.id, personneId: ajout.personne.id, role: 'conjoint' }]
  return [ajout, { type: 'ajouterUnion', union: { id: nouvelId('F'), conjoints: [ajout.personne.id], enfants: [personneId] } }]
}

const presentsAutourDuDefunt = (a: Arbre) =>
  a.defuntId && a.personnes.has(a.defuntId) ? new Set(disposer(a, a.defuntId).boites.map(b => b.personneId)) : new Set<string>()

/** descendantsDetaches : personnes visibles depuis le défunt avant, plus après (hors la supprimée). */
export function opsSupprimerPersonne(arbre: Arbre, personneId: string): { operations: Operation[]; descendantsDetaches: number } {
  const operations: Operation[] = [{ type: 'supprimerPersonne', personneId }]
  const avant = presentsAutourDuDefunt(arbre)
  const apres = presentsAutourDuDefunt(appliquerJournal(arbre, ajouterEntree(journalVide(''), operations[0])))
  const descendantsDetaches = [...avant].filter(id => id !== personneId && !apres.has(id)).length
  return { operations, descendantsDetaches }
}

/** Supprime un lien : un conjoint d'une union (les enfants restent), ou un enfant de ses parents. */
export function opsDelier(arbre: Arbre, unionId: string, personneId: string, role: 'conjoint' | 'enfant'): Operation[] {
  return arbre.unions.has(unionId) ? [{ type: 'delierPersonne', unionId, personneId, role }] : []
}

export function opsSupprimerUnion(arbre: Arbre, unionId: string): Operation[] {
  return arbre.unions.has(unionId) ? [{ type: 'supprimerUnion', unionId }] : []
}
