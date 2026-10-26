// Panneau latéral : fiche d'une personne (champs du masque de saisie Généatique) et actions.
import { Arbre, CleChamp, Evenement, Personne } from '../modele'
import { Operation } from '../journal'
import { formaterDate, formaterLieu } from '../carte'
import { opsAjouterConjoint, opsAjouterEnfant, opsAjouterParent, opsDelier, opsModifierFiche, opsSupprimerPersonne, SaisieFiche } from '../edition'
import { Vue } from '../rendu'

const MOIS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** « 02/03/2020 » → « 02 MAR 2020 » ; toute autre saisie est conservée telle quelle. */
export function versDateGedcom(s: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{3,4})$/.exec(s.trim())
  return m && +m[2] >= 1 && +m[2] <= 12 ? `${m[1].padStart(2, '0')} ${MOIS[+m[2] - 1]} ${m[3]}` : s.trim()
}

const GROUPES: { titre: string; champs: [CleChamp, string][] }[] = [
  { titre: 'Coordonnées', champs: [['adresse', 'Adresse'], ['adresseComplement', 'Adresse complément'],
    ['codePostal', 'Code postal'], ['telephoneHeritier', 'Téléphone héritier'], ['email', 'E-mail'],
    ['adresseConjoint', 'Adresse conjoint'], ['adresse1Conjoint', 'Adresse complément conjoint'],
    ['cpConjoint', 'Code postal conjoint'], ['telephoneConjoint', 'Téléphone conjoint']] },
  { titre: 'Mentions', champs: [['celibataire', 'Célibataire'], ['sansPosterite', 'Sans postérité'],
    ['mortEnBasAge', 'Mort en bas âge'], ['regimeMatrimonial', 'Régime matrimonial'],
    ['enfantLegitime', 'Enfant légitimé'], ['enfantReconnuPere', 'Enfant reconnu par le père'],
    ['enfantReconnuMere', 'Enfant reconnu par la mère'], ['rc', 'Répertoire civil']] },
  { titre: 'Dossier', champs: [['representation', 'Représentation'], ['representationConj', 'Représentation conjoint'],
    ['saisi', 'SAISI(E)'], ['saisie', 'SAISIE (événement)']] },
]

export interface Panneau { ouvrir(personneId: string): void; fermer(): void }

export function creerPanneau(conteneur: HTMLElement,
  deps: { arbre: () => Arbre; journaliser: (ops: Operation[]) => void; vue: Vue }): Panneau {
  const racine = conteneur.appendChild(document.createElement('aside'))
  racine.className = 'gv-panneau'
  racine.hidden = true
  let courant: string | null = null

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, parent: HTMLElement, props: Record<string, unknown> = {}): HTMLElementTagNameMap[K] =>
    Object.assign(parent.appendChild(document.createElement(tag)), props)
  const groupe = (titre: string) => { const f = el('fieldset', racine); el('legend', f, { textContent: titre }); return f }
  const saisie = (parent: HTMLElement, name: string, libelle: string, valeur = '') => {
    const l = el('label', parent); el('span', l, { textContent: libelle })
    return el('input', l, { name, value: valeur })
  }
  const liste = (parent: HTMLElement, name: string, libelle: string, options: [string, string][], valeur: string) => {
    const l = el('label', parent); el('span', l, { textContent: libelle })
    const s = el('select', l, { name })
    options.forEach(([v, t]) => el('option', s, { value: v, textContent: t }))
    s.value = valeur
    return s
  }
  const valeur = (name: string) => racine.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value.trim() ?? ''
  const nomDe = (id: string) => { const p = deps.arbre().personnes.get(id); return p ? `${p.nom} ${p.prenoms}`.trim() || '(sans nom)' : '?' }

  const champsEvenement = (parent: HTMLElement, cle: string, libelle: string, ev?: Evenement) => {
    saisie(parent, `${cle}.date`, `${libelle} (date)`, formaterDate(ev?.date))
    saisie(parent, `${cle}.lieu`, `${libelle} (lieu)`, formaterLieu(ev?.lieu))
  }
  /** Relit un événement saisi ; ce qui n'a pas été touché garde sa valeur GEDCOM d'origine. */
  const lireEvenement = (cle: string, origine?: Evenement): Evenement | undefined => {
    const d = valeur(`${cle}.date`), l = valeur(`${cle}.lieu`)
    const ev: Evenement = {}
    if (d) ev.date = d === formaterDate(origine?.date) ? origine!.date : versDateGedcom(d)
    if (l) ev.lieu = l === formaterLieu(origine?.lieu) ? origine!.lieu : l
    return ev.date || ev.lieu ? ev : origine ? {} : undefined
  }

  function lireFiche(p: Personne): SaisieFiche {
    const champs: SaisieFiche['champs'] = {}
    const cles: CleChamp[] = ['profession', 'situation', ...GROUPES.flatMap(g => g.champs.map(c => c[0]))]
    for (const k of cles) if (valeur(k) !== (p.champs[k] ?? '')) champs[k] = valeur(k)
    const s: SaisieFiche = { nom: valeur('nom'), prenoms: valeur('prenoms'), sexe: valeur('sexe') as SaisieFiche['sexe'], champs }
    const naissance = lireEvenement('naissance', p.naissance), deces = lireEvenement('deces', p.deces)
    const change = (ev: Evenement | undefined, origine?: Evenement) => JSON.stringify(ev) !== JSON.stringify(origine)
    if (naissance && change(naissance, p.naissance)) s.naissance = naissance
    if (deces && change(deces, p.deces)) s.deces = deces
    return s
  }

  function opsUnions(p: Personne): Operation[] {
    const ops: Operation[] = []
    for (const f of p.fams) {
      const u = deps.arbre().unions.get(f)
      if (!u) continue
      const mariage = lireEvenement(`union.${f}.mariage`, u.mariage), divorce = lireEvenement(`union.${f}.divorce`, u.divorce)
      if (JSON.stringify(mariage) !== JSON.stringify(u.mariage) || JSON.stringify(divorce) !== JSON.stringify(u.divorce))
        ops.push({ type: 'modifierUnion', unionId: f, valeurs: { mariage, divorce } })
    }
    return ops
  }

  function formulaireAjout(titre: string, avecMariage: boolean, unions: [string, string][] | null,
    creer: (s: SaisieFiche, mariage: Evenement | undefined, unionId: string | null) => Operation[]) {
    racine.querySelector('.gv-ajout')?.remove()
    const f = el('fieldset', racine, { className: 'gv-ajout' }); el('legend', f, { textContent: titre })
    if (unions) liste(f, 'nouveau.union', 'Union', unions, unions[0][0])
    saisie(f, 'nouveau.nom', 'Nom'); saisie(f, 'nouveau.prenoms', 'Prénoms')
    liste(f, 'nouveau.sexe', 'Sexe', [['U', '?'], ['M', 'Masculin'], ['F', 'Féminin']], 'U')
    if (avecMariage) champsEvenement(f, 'nouveau.mariage', 'Mariage')
    const actions = el('div', f, { className: 'gv-actions' })
    el('button', actions, { type: 'button', textContent: 'Valider' }).onclick = () => {
      const s: SaisieFiche = { nom: valeur('nouveau.nom'), prenoms: valeur('nouveau.prenoms'),
        sexe: valeur('nouveau.sexe') as SaisieFiche['sexe'], champs: {} }
      deps.journaliser(creer(s, avecMariage ? lireEvenement('nouveau.mariage') : undefined, unions ? valeur('nouveau.union') || null : null))
      if (courant) ouvrir(courant)
    }
    el('button', actions, { type: 'button', textContent: 'Annuler' }).onclick = () => f.remove()
  }

  function ouvrir(personneId: string) {
    const arbre = deps.arbre()
    const p = arbre.personnes.get(personneId)
    if (!p) return fermer()
    courant = personneId
    racine.replaceChildren()
    racine.hidden = false
    const entete = el('div', racine, { className: 'gv-actions' })
    el('strong', entete, { textContent: nomDe(personneId) })
    el('button', entete, { type: 'button', textContent: 'Fermer' }).onclick = fermer

    const id = groupe('Identité')
    saisie(id, 'nom', 'Nom', p.nom); saisie(id, 'prenoms', 'Prénoms', p.prenoms)
    liste(id, 'sexe', 'Sexe', [['U', '?'], ['M', 'Masculin'], ['F', 'Féminin']], p.sexe)
    saisie(id, 'profession', 'Professions', p.champs.profession)

    if (p.famc.length) {
      const par = groupe('Parents')
      for (const f of p.famc) {
        const u = arbre.unions.get(f)
        if (!u) continue
        const ul = el('ul', par, { className: 'gv-parents' })
        for (const id of u.conjoints) {
          const lien = el('a', el('li', ul), { href: '#', textContent: nomDe(id) })
          lien.onclick = (e: Event) => { e.preventDefault(); deps.vue.afficher(id); ouvrir(id) }
        }
        el('button', par, { type: 'button', textContent: 'Détacher de ses parents' }).onclick = () => {
          if (window.confirm(`Détacher ${nomDe(personneId)} de ses parents ?`)) { deps.journaliser(opsDelier(deps.arbre(), f, personneId, 'enfant')); ouvrir(personneId) }
        }
      }
    }

    const ev = groupe('Événements')
    champsEvenement(ev, 'naissance', 'Naissance', p.naissance)
    champsEvenement(ev, 'deces', 'Décès', p.deces)
    for (const f of p.fams) {
      const u = arbre.unions.get(f)
      if (!u) continue
      const autre = u.conjoints.find(c => c !== personneId)
      const g = groupe(`Union${autre ? ' avec ' + nomDe(autre) : ''}`)
      champsEvenement(g, `union.${f}.mariage`, 'Mariage', u.mariage)
      champsEvenement(g, `union.${f}.divorce`, 'Divorce', u.divorce)
      if (autre) el('button', g, { type: 'button', textContent: 'Supprimer le lien de mariage' }).onclick = () => {
        if (window.confirm(`Supprimer le lien de mariage avec ${nomDe(autre)} ? Les enfants restent rattachés à ${nomDe(personneId)}.`))
          { deps.journaliser(opsDelier(deps.arbre(), f, autre, 'conjoint')); ouvrir(personneId) }
      }
    }
    for (const gr of GROUPES) {
      const g = groupe(gr.titre)
      if (gr.titre === 'Dossier') {
        // Une valeur hors liste (« Auteur », variante de casse…) est proposée telle quelle pour ne pas être perdue.
        const situation = p.champs.situation ?? ''
        const options: [string, string][] = [['', ''], ['Héritier', 'Héritier']]
        if (!options.some(([v]) => v === situation)) options.push([situation, situation])
        liste(g, 'situation', 'Situation', options, situation)
      }
      gr.champs.forEach(([k, lib]) => saisie(g, k, lib, p.champs[k]))
    }

    const actions = el('div', racine, { className: 'gv-actions' })
    el('button', actions, { type: 'button', textContent: 'Enregistrer' }).onclick = () => {
      const ops = [...opsModifierFiche(arbre, personneId, lireFiche(p)), ...opsUnions(p)]
      deps.journaliser(ops)
      ouvrir(personneId)
    }
    el('button', actions, { type: 'button', textContent: 'Ajouter un enfant' }).onclick = () => {
      const unions: [string, string][] = p.fams.map(f => {
        const autre = arbre.unions.get(f)?.conjoints.find(c => c !== personneId)
        return [f, autre ? `avec ${nomDe(autre)}` : 'sans conjoint']
      })
      unions.push(['', 'nouvelle union sans conjoint'])
      formulaireAjout('Nouvel enfant', false, unions, (s, _m, u) => opsAjouterEnfant(deps.arbre(), personneId, u, s))
    }
    el('button', actions, { type: 'button', textContent: 'Ajouter un conjoint' }).onclick = () =>
      formulaireAjout('Nouveau conjoint', true, null, (s, m) => opsAjouterConjoint(deps.arbre(), personneId, s, m))
    el('button', actions, { type: 'button', textContent: 'Ajouter un parent' }).onclick = () =>
      formulaireAjout('Nouveau parent', false, null, s => opsAjouterParent(deps.arbre(), personneId, s))
    el('button', actions, { type: 'button', textContent: 'Supprimer' }).onclick = () => {
      const { operations, descendantsDetaches } = opsSupprimerPersonne(deps.arbre(), personneId)
      const message = `Supprimer ${nomDe(personneId)} ?` + (descendantsDetaches
        ? `\n${descendantsDetaches} personne(s) ne seront plus rattachées à l'arbre du défunt.` : '')
      if (!window.confirm(message)) return
      deps.journaliser(operations)
      fermer()
    }
  }

  function fermer() { courant = null; racine.hidden = true; racine.replaceChildren() }

  return { ouvrir, fermer }
}
