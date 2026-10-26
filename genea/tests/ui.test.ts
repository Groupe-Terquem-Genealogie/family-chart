import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { lireGedcom } from '../src/gedcom'
import { Operation } from '../src/journal'
import { creerPanneau } from '../src/ui/panneau'
import { creerBarre } from '../src/ui/barre'
import { Vue } from '../src/rendu'

const remariage = () => lireGedcom(readFileSync(resolve(__dirname, 'fixtures/remariage.ged'), 'utf-8'))
const [D, , , , E2, , H] = ['@I1@', '@I2@', '@I3@', '@I4@', '@I5@', '@I6@', '@I7@']
const vueFactice = (): Vue => ({ afficher: vi.fn(), ajuster: vi.fn(), surSelection: vi.fn(), centre: () => null })
const champ = (racine: HTMLElement, nom: string) => racine.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${nom}"]`)!
const bouton = (racine: HTMLElement, texte: string) =>
  [...racine.querySelectorAll('button')].find(b => b.textContent === texte)!
const saisir = (el: HTMLInputElement | HTMLSelectElement, v: string) => { el.value = v; el.dispatchEvent(new Event('input')) }

beforeEach(() => { document.body.innerHTML = '' })

describe('panneau de fiche', () => {
  const monter = () => {
    const cont = document.body.appendChild(document.createElement('div'))
    const arbre = remariage()
    arbre.personnes.get(H)!.naissance = { date: '13 JAN 1990', lieu: ', Auch, 32, , ,' }
    const journaliser = vi.fn<(ops: Operation[]) => void>()
    const p = creerPanneau(cont, { arbre: () => arbre, journaliser, vue: vueFactice() })
    return { cont, p, journaliser, arbre }
  }

  it('affiche la fiche de la personne', () => {
    const { cont, p } = monter()
    p.ouvrir(H)
    expect(champ(cont, 'nom').value).toBe('EPOUX')
    expect(champ(cont, 'prenoms').value).toBe('Hélène')
    expect(champ(cont, 'situation').value).toBe('Héritier')
    expect(champ(cont, 'naissance.date').value).toBe('13/01/1990')
    expect(champ(cont, 'naissance.lieu').value).toBe('Auch, 32')
  })

  it('enregistrer : opération de modification, dates saisies converties en GEDCOM, lieu inchangé conservé', () => {
    const { cont, p, journaliser } = monter()
    p.ouvrir(H)
    saisir(champ(cont, 'profession'), 'Plaquiste')
    saisir(champ(cont, 'deces.date'), '02/03/2020')
    saisir(champ(cont, 'naissance.date'), '14/01/1990')
    bouton(cont, 'Enregistrer').click()
    const op = journaliser.mock.calls[0][0][0] as Extract<Operation, { type: 'modifierPersonne' }>
    expect(op.type).toBe('modifierPersonne')
    expect(op.valeurs.champs!.profession).toBe('Plaquiste')
    expect(op.valeurs.deces).toEqual({ date: '02 MAR 2020' })
    expect(op.valeurs.naissance).toEqual({ date: '14 JAN 1990', lieu: ', Auch, 32, , ,' })   // lieu non touché : valeur GEDCOM gardée
  })

  it('enregistrer sans toucher aux événements ne les renvoie pas', () => {
    const { cont, p, journaliser, arbre } = monter()
    arbre.personnes.get(H)!.deces = {}
    p.ouvrir(H)
    saisir(champ(cont, 'profession'), 'Plaquiste')
    bouton(cont, 'Enregistrer').click()
    const op = journaliser.mock.calls[0][0][0] as Extract<Operation, { type: 'modifierPersonne' }>
    expect('deces' in op.valeurs).toBe(false)
    expect('naissance' in op.valeurs).toBe(false)
  })

  it('situation inconnue de la liste (« Auteur ») : conservée à l’enregistrement', () => {
    const { cont, p, journaliser, arbre } = monter()
    arbre.personnes.get(H)!.champs.situation = 'Auteur'
    p.ouvrir(H)
    expect(champ(cont, 'situation').value).toBe('Auteur')
    saisir(champ(cont, 'profession'), 'X')
    bouton(cont, 'Enregistrer').click()
    const op = journaliser.mock.calls[0][0][0] as Extract<Operation, { type: 'modifierPersonne' }>
    expect('situation' in op.valeurs.champs!).toBe(false)
  })

  it('rubrique Parents : noms des parents, ouverture de leur fiche, détachement', () => {
    const { cont, p, journaliser } = monter()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    p.ouvrir(H)
    const parents = [...cont.querySelectorAll('.gv-parents li')].map(li => li.querySelector('a')!.textContent)
    expect(parents).toEqual(['EPOUX Simon', 'REMARI Adèle'])
    bouton(cont, 'Détacher de ses parents').click()
    expect(journaliser.mock.calls[0][0]).toEqual([{ type: 'delierPersonne', unionId: '@F3@', personneId: H, role: 'enfant' }])
  })

  it('supprimer le lien de mariage depuis la fiche', () => {
    const { cont, p, journaliser } = monter()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    p.ouvrir(E2)
    bouton(cont, 'Supprimer le lien de mariage').click()
    expect(journaliser.mock.calls[0][0]).toEqual([{ type: 'delierPersonne', unionId: '@F3@', personneId: '@I6@', role: 'conjoint' }])
  })

  it('tous les champs de l’export sont modifiables', () => {
    const { cont, p } = monter()
    p.ouvrir(H)
    for (const nom of ['saisie', 'representationConj', 'adresseConjoint', 'adresse1Conjoint', 'cpConjoint', 'telephoneConjoint',
      'enfantLegitime', 'enfantReconnuPere', 'enfantReconnuMere', 'rc'])
      expect(champ(cont, nom), nom).toBeTruthy()
  })

  it('ajouter un enfant puis valider', () => {
    const { cont, p, journaliser } = monter()
    p.ouvrir(E2)
    bouton(cont, 'Ajouter un enfant').click()
    saisir(champ(cont, 'nouveau.nom'), 'PETIT')
    bouton(cont, 'Valider').click()
    const ops = journaliser.mock.calls[0][0]
    expect(ops.map(o => o.type)).toEqual(['ajouterPersonne', 'lierPersonne'])
  })

  it('supprimer : confirmation avec le nombre de personnes détachées', () => {
    const { cont, p, journaliser } = monter()
    const confirmer = vi.spyOn(window, 'confirm').mockReturnValue(true)
    p.ouvrir(E2)
    bouton(cont, 'Supprimer').click()
    expect(confirmer.mock.calls[0][0]).toContain('2 personne')
    expect(journaliser.mock.calls[0][0]).toEqual([{ type: 'supprimerPersonne', personneId: E2 }])
    confirmer.mockRestore()
  })

  it('supprimer annulé : rien', () => {
    const { cont, p, journaliser } = monter()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    p.ouvrir(E2)
    bouton(cont, 'Supprimer').click()
    expect(journaliser).not.toHaveBeenCalled()
  })
})

describe('barre', () => {
  const monter = () => {
    const cont = document.body.appendChild(document.createElement('div'))
    const vue = vueFactice()
    const choisirDossier = vi.fn()
    const b = creerBarre(cont, { arbre: remariage, vue, dossiers: ['a.ged', 'b.ged'], dossierCourant: 'b.ged', choisirDossier })
    return { cont, vue, choisirDossier, b }
  }

  it('recherche et choix d’un résultat', () => {
    const { cont, vue } = monter()
    saisir(champ(cont, 'recherche'), 'helene')
    const items = cont.querySelectorAll('.gv-resultats li')
    expect(items.length).toBe(1)
    ;(items[0] as HTMLElement).click()
    expect(vue.afficher).toHaveBeenCalledWith(H)
    expect(cont.querySelectorAll('.gv-resultats li').length).toBe(0)
  })

  it('boutons Défunt et Ajuster, choix du dossier, état', () => {
    const { cont, vue, choisirDossier, b } = monter()
    bouton(cont, 'Défunt').click()
    expect(vue.afficher).toHaveBeenCalledWith(D)
    bouton(cont, 'Ajuster').click()
    expect(vue.ajuster).toHaveBeenCalled()
    expect(champ(cont, 'dossier').value).toBe('b.ged')
    saisir(champ(cont, 'dossier'), 'a.ged'); champ(cont, 'dossier').dispatchEvent(new Event('change'))
    expect(choisirDossier).toHaveBeenCalledWith('a.ged')
    b.etat('Échec de l’enregistrement', true)
    expect(cont.querySelector('.gv-etat')!.textContent).toBe('Échec de l’enregistrement')
    expect(cont.querySelector('.gv-etat')!.classList.contains('gv-erreur')).toBe(true)
  })
})
