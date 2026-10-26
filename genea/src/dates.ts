// Dates GEDCOM (complètes ou incomplètes, éventuellement qualifiées) ⇄ affichage et saisie en français.

const MOIS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const QUALIFS: [string, string][] = [['ABT', 'vers'], ['EST', 'vers'], ['CAL', 'vers'], ['BEF', 'avant'], ['AFT', 'après']]

/** « 13 JAN 1866 » → 13/01/1866, « JAN 1866 » → 01/1866, « 1866 » → 1866 ; null si non reconnue. */
function noyauVersAffichage(d: string): string | null {
  const m = /^(?:(\d{1,2}) )?(?:([A-Z]{3}) )?(\d{3,4})$/.exec(d)
  if (!m || (m[2] && !MOIS.includes(m[2])) || (m[1] && !m[2])) return null
  const mois = m[2] ? String(MOIS.indexOf(m[2]) + 1).padStart(2, '0') : ''
  return [m[1]?.padStart(2, '0'), mois, m[3]].filter(Boolean).join('/')
}

function noyauVersGedcom(s: string): string | null {
  const m = /^(?:(?:(\d{1,2})\/)?(\d{1,2})\/)?(\d{3,4})$/.exec(s)
  if (!m || (m[2] && (+m[2] < 1 || +m[2] > 12))) return null
  return [m[1]?.padStart(2, '0'), m[2] ? MOIS[+m[2] - 1] : undefined, m[3]].filter(Boolean).join(' ')
}

export function dateVersAffichage(d?: string): string {
  if (!d) return ''
  const t = d.trim().toUpperCase()
  const entre = /^BET (.+) AND (.+)$/.exec(t)
  if (entre) {
    const a = noyauVersAffichage(entre[1]), b = noyauVersAffichage(entre[2])
    if (a && b) return `entre ${a} et ${b}`
  }
  for (const [code, mot] of QUALIFS) {
    if (t.startsWith(code + ' ')) { const n = noyauVersAffichage(t.slice(code.length + 1)); if (n) return `${mot} ${n}` }
  }
  return noyauVersAffichage(t) ?? d.trim()
}

/** Saisie jj/mm/aaaa, mm/aaaa, aaaa, « vers / env. / avant / après … », « entre … et … » ; sinon conservée. */
export function dateVersGedcom(s: string): string {
  const t = s.trim()
  const entre = /^entre (.+) et (.+)$/i.exec(t)
  if (entre) {
    const a = noyauVersGedcom(entre[1].trim()), b = noyauVersGedcom(entre[2].trim())
    if (a && b) return `BET ${a} AND ${b}`
  }
  const q = /^(vers|env\.?|environ|ca\.?|avant|après|apres)\s+(.+)$/i.exec(t)
  if (q) {
    const n = noyauVersGedcom(q[2].trim())
    const mot = q[1].toLowerCase()
    const code = mot.startsWith('av') ? 'BEF' : mot.startsWith('ap') ? 'AFT' : 'ABT'
    if (n) return `${code} ${n}`
  }
  return noyauVersGedcom(t) ?? t
}

/** Clé de tri aaaammjj (parties manquantes à 0) ; null si aucune année. */
export function cleTriDate(d?: string): number | null {
  if (!d) return null
  const m = /(?:(\d{1,2}) )?(?:([A-Z]{3}) )?(\d{3,4})/.exec(d.trim().toUpperCase())
  if (!m) return null
  const mois = m[2] && MOIS.includes(m[2]) ? MOIS.indexOf(m[2]) + 1 : 0
  return +m[3] * 10000 + mois * 100 + (m[1] && mois ? +m[1] : 0)
}
