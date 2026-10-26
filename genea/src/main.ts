// Amorçage de la page genea_visu : charge le dossier, rejoue le journal, branche vue, barre et panneau.
import './genea-visu.css'
import { lireGedcom } from './gedcom'
import { Arbre } from './modele'
import { ajouterEntree, appliquerJournal, Journal, journalVide, Operation } from './journal'
import { appelWebMethod, creerSauvegarde } from './api'
import { creerVue } from './rendu'
import { creerBarre } from './ui/barre'
import { creerPanneau } from './ui/panneau'

export async function demarrer(racine: HTMLElement): Promise<void> {
  racine.classList.add('gv-page')
  const dossiers = await appelWebMethod<string[]>('ListerDossiers', {})
  if (!dossiers.length) {
    racine.textContent = 'Aucun fichier .ged dans App_Data/genea_visu.'
    return
  }
  const demande = new URLSearchParams(location.search).get('dossier')
  const nom = demande && dossiers.includes(demande) ? demande : dossiers[0]
  const { gedcom, journal: texteJournal } = await appelWebMethod<{ gedcom: string; journal: string }>('ChargerDossier', { nom })

  const base = lireGedcom(gedcom)
  let journal: Journal = texteJournal ? JSON.parse(texteJournal) : journalVide(nom)
  let arbre: Arbre = appliquerJournal(base, journal)

  const haut = racine.appendChild(document.createElement('div'))
  const bandeau = racine.appendChild(document.createElement('div'))
  bandeau.className = 'gv-bandeau'
  const zone = racine.appendChild(document.createElement('div'))
  zone.className = 'gv-arbre'
  const cadre = zone.appendChild(document.createElement('div'))
  cadre.style.cssText = 'position:absolute;inset:0'

  const avertir = () => { bandeau.textContent = arbre.avertissements.join(' · ') }
  avertir()
  const centreDepart = () => arbre.defuntId ?? arbre.personnes.keys().next().value!
  const vue = creerVue(cadre, () => arbre)
  const barre = creerBarre(haut, { arbre: () => arbre, vue, dossiers, dossierCourant: nom,
    choisirDossier: d => { location.search = `?dossier=${encodeURIComponent(d)}` } })
  const sauvegarde = creerSauvegarde(nom, fetch, m => barre.etat(m, true))

  const journaliser = (ops: Operation[]) => {
    if (!ops.length) return
    for (const op of ops) journal = ajouterEntree(journal, op)
    arbre = appliquerJournal(base, journal)
    avertir()
    const centre = vue.centre()
    vue.afficher(centre && arbre.personnes.has(centre) ? centre : centreDepart())
    barre.etat('Enregistrement…')
    sauvegarde.enregistrer(journal)
      .then(() => barre.etat(`Enregistré à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`))
      .catch(() => {})
  }
  const panneau = creerPanneau(zone, { arbre: () => arbre, journaliser, vue })
  vue.surSelection(id => panneau.ouvrir(id))
  window.addEventListener('beforeunload', e => { if (sauvegarde.enAttente()) e.preventDefault() })

  vue.afficher(centreDepart(), true)
  barre.etat(`${arbre.personnes.size} personnes`)
}
