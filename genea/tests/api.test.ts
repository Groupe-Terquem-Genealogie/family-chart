import { describe, it, expect, vi } from 'vitest'
import { appelWebMethod, creerSauvegarde } from '../src/api'
import { journalVide, Journal } from '../src/journal'

const reponse = (d: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => ({ d }) }) as Response
const j = (n: number): Journal => ({ ...journalVide('a.ged'), entrees: Array.from({ length: n }, (_, i) =>
  ({ id: String(i), horodatage: '', operation: { type: 'supprimerUnion', unionId: '@F1@' } })) })

describe('appelWebMethod', () => {
  it('POST JSON sur la page et renvoie .d', async () => {
    const f = vi.fn(async () => reponse(['a.ged']))
    expect(await appelWebMethod('ListerDossiers', {}, f as unknown as typeof fetch)).toEqual(['a.ged'])
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('FrmGeneaVisu.aspx/ListerDossiers')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json; charset=utf-8')
  })
  it('erreur HTTP : rejet', async () => {
    await expect(appelWebMethod('X', {}, (async () => reponse(null, false)) as unknown as typeof fetch)).rejects.toThrow('HTTP 500')
  })
})

describe('creerSauvegarde', () => {
  it('une requête à la fois, seul le dernier journal en attente est envoyé', async () => {
    const corps: string[] = []
    let liberer!: () => void
    const f = vi.fn((_u: string, init: RequestInit) => {
      corps.push(init.body as string)
      return corps.length === 1 ? new Promise<Response>(r => { liberer = () => r(reponse({ ok: true })) }) : Promise.resolve(reponse({ ok: true }))
    })
    const s = creerSauvegarde('a.ged', f as unknown as typeof fetch)
    const p1 = s.enregistrer(j(1)), p2 = s.enregistrer(j(2)), p3 = s.enregistrer(j(3))
    expect(s.enAttente()).toBe(true)
    liberer()
    await Promise.all([p1, p2, p3])
    expect(f).toHaveBeenCalledTimes(2)
    expect(JSON.parse(JSON.parse(corps[1]).journal).entrees.length).toBe(3)
    expect(JSON.parse(corps[1]).nom).toBe('a.ged')
    expect(s.enAttente()).toBe(false)
  })

  it('échec : signalé, puis le journal repart avec l’enregistrement suivant', async () => {
    let echec = true
    const f = vi.fn(async (_u: string, _i: RequestInit) => { if (echec) { echec = false; throw new Error('réseau') } return reponse({ ok: true }) })
    const erreurs: string[] = []
    const s = creerSauvegarde('a.ged', f as unknown as typeof fetch, m => erreurs.push(m))
    await s.enregistrer(j(1)).catch(() => {})
    expect(erreurs).toEqual(['Échec de l’enregistrement'])
    expect(s.enAttente()).toBe(true)
    await s.enregistrer(j(2))
    expect(f).toHaveBeenCalledTimes(2)
    expect(s.enAttente()).toBe(false)
  })
})
