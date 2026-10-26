// Appels aux WebMethods de genea_visu/FrmGeneaVisu.aspx et file d'enregistrement du journal.
import { Journal } from './journal'

export async function appelWebMethod<T>(methode: string, args: object, f: typeof fetch = fetch): Promise<T> {
  const r = await f(`FrmGeneaVisu.aspx/${methode}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(args),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return (await r.json()).d as T
}

export interface Sauvegarde { enregistrer(j: Journal): Promise<void>; enAttente(): boolean }

/**
 * Une seule requête à la fois ; un journal arrivé pendant une requête remplace le précédent en
 * attente (le journal est complet, seul le dernier compte). Un échec est signalé et le journal
 * repart avec l'enregistrement suivant.
 */
export function creerSauvegarde(nom: string, f: typeof fetch = fetch,
  signalerErreur: (message: string) => void = () => {}): Sauvegarde {
  let attente: Journal | null = null
  let boucle: Promise<void> | null = null

  async function vider() {
    while (attente) {
      const envoi = attente
      attente = null
      try {
        await appelWebMethod('EnregistrerJournal', { nom, journal: JSON.stringify(envoi) }, f)
      } catch (e) {
        if (!attente) attente = envoi
        signalerErreur('Échec de l’enregistrement')
        throw e
      }
    }
  }

  return {
    enregistrer(j) {
      attente = j
      if (!boucle) boucle = vider().finally(() => { boucle = null })
      return boucle
    },
    enAttente: () => !!attente || !!boucle,
  }
}
