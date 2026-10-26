import { Arbre, Personne, sansAccents } from './modele'

/** Personnes dont « nom prénoms » contient tous les mots saisis (sans casse ni accents). */
export function rechercher(arbre: Arbre, texte: string, max = 20): Personne[] {
  const mots = sansAccents(texte).split(/\s+/).filter(Boolean)
  if (!mots.length) return []
  return [...arbre.personnes.values()]
    .filter(p => { const cible = sansAccents(`${p.nom} ${p.prenoms}`); return mots.every(m => cible.includes(m)) })
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.prenoms.localeCompare(b.prenoms, 'fr'))
    .slice(0, max)
}
