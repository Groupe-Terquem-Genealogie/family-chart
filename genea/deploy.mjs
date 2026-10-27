// Construit le bundle genea_visu et le copie dans la racine web de l'intranet (dossier frère).
import { execSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ici = dirname(fileURLToPath(import.meta.url))
const cible = resolve(ici, '../../intranet.root/genea_visu')
execSync('corepack yarn -s build:genea', { cwd: resolve(ici, '..'), stdio: 'inherit' })
for (const [fichier, dossier] of [['genea-visu.js', 'js'], ['genea-visu.css', 'css']]) {
  mkdirSync(resolve(cible, dossier), { recursive: true })
  copyFileSync(resolve(ici, 'dist', fichier), resolve(cible, dossier, fichier))
  console.log(`copié : genea_visu/${dossier}/${fichier}`)
}

// Cache busting : ?v= = empreinte du contenu, mise à jour dans la page à chaque déploiement.
const page = resolve(cible, 'FrmGeneaVisu.aspx')
let html = readFileSync(page, 'utf-8')
for (const [fichier, dossier] of [['genea-visu.js', 'js'], ['genea-visu.css', 'css']]) {
  const empreinte = createHash('sha1').update(readFileSync(resolve(cible, dossier, fichier))).digest('hex').slice(0, 10)
  html = html.replace(new RegExp(`${dossier}/${fichier.replace('.', '\\.')}\\?v=[^"]*`), `${dossier}/${fichier}?v=${empreinte}`)
  console.log(`version : ${dossier}/${fichier}?v=${empreinte}`)
}
writeFileSync(page, html, 'utf-8')
