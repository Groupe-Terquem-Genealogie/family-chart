// Barre d'outils : choix du dossier, recherche, retour au défunt, ajustement, état.
import { Arbre } from '../modele'
import { rechercher } from '../recherche'
import { formaterDate } from '../carte'
import { Vue } from '../rendu'

export interface Barre { etat(message: string, erreur?: boolean): void }

export function creerBarre(conteneur: HTMLElement, deps: { arbre: () => Arbre; vue: Vue; dossiers: string[];
  dossierCourant: string; choisirDossier: (nom: string) => void }): Barre {
  const barre = conteneur.appendChild(document.createElement('div'))
  barre.className = 'gv-barre'

  const dossier = barre.appendChild(document.createElement('select'))
  dossier.name = 'dossier'
  dossier.title = 'Dossier'
  for (const d of deps.dossiers) dossier.appendChild(Object.assign(document.createElement('option'), { value: d, textContent: d }))
  dossier.value = deps.dossierCourant
  dossier.addEventListener('change', () => deps.choisirDossier(dossier.value))

  const zone = barre.appendChild(document.createElement('div'))
  zone.className = 'gv-recherche'
  const champ = zone.appendChild(Object.assign(document.createElement('input'),
    { name: 'recherche', type: 'search', placeholder: 'Rechercher une personne…' }))
  const resultats = zone.appendChild(document.createElement('ul'))
  resultats.className = 'gv-resultats'
  resultats.hidden = true
  champ.addEventListener('input', () => {
    resultats.replaceChildren()
    const trouves = rechercher(deps.arbre(), champ.value)
    resultats.hidden = !trouves.length
    for (const p of trouves) {
      const li = resultats.appendChild(document.createElement('li'))
      const naissance = formaterDate(p.naissance?.date)
      li.textContent = `${p.nom} ${p.prenoms}`.trim() + (naissance ? ` (° ${naissance})` : '')
      li.onclick = () => { resultats.replaceChildren(); resultats.hidden = true; deps.vue.afficher(p.id) }
    }
  })

  const bouton = (texte: string, action: () => void) =>
    Object.assign(barre.appendChild(document.createElement('button')), { type: 'button', textContent: texte }).onclick = action
  bouton('Défunt', () => { const id = deps.arbre().defuntId; if (id) deps.vue.afficher(id) })
  bouton('Ajuster', () => deps.vue.ajuster())

  const etat = barre.appendChild(document.createElement('span'))
  etat.className = 'gv-etat'
  return {
    etat(message, erreur = false) { etat.textContent = message; etat.classList.toggle('gv-erreur', erreur) },
  }
}
