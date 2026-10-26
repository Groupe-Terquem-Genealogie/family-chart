// Construit le bundle genea_visu et le copie dans la racine web de l'intranet (dossier frère).
import { execSync } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
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
