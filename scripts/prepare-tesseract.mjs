/**
 * Copie les binaires de tesseract.js depuis node_modules vers public/tesseract/.
 *
 * POURQUOI
 *   Par défaut, tesseract.js va chercher son worker et son moteur WASM sur le
 *   CDN jsdelivr AU MOMENT DU PREMIER OCR (voir node_modules/tesseract.js/src/
 *   worker/browser/defaultOptions.js et worker-script/browser/getCore.js).
 *   La CSP posée dans vercel.json n'autorise les scripts que depuis 'self' :
 *   ces téléchargements seraient bloqués et l'OCR ne démarrerait jamais.
 *
 *   En servant ces fichiers depuis notre propre domaine, la CSP reste stricte
 *   ET l'OCR fonctionne — y compris sans accès internet.
 *
 * CE QUI EST COPIÉ
 *   `createWorker('fra')` utilise OEM.LSTM_ONLY par défaut (createWorker.js:19),
 *   donc seules les variantes `-lstm` du moteur sont utiles. Les trois sont
 *   copiées parce que getCore.js choisit à l'exécution selon le support SIMD du
 *   navigateur : relaxedsimd > simd > aucun. Il manquerait l'une des trois qu'un
 *   navigateur tomberait sur un 404.
 *
 *   Les `.wasm.js` embarquent déjà le binaire WASM en base64 (~+33 % de taille) :
 *   les `.wasm` autonomes ne sont donc PAS nécessaires.
 *
 * CE QUI N'EST PAS COPIÉ ICI
 *   Le modèle de langue `lang/fra.traineddata.gz` (707 Ko) est VERSIONNÉ dans le
 *   dépôt : il ne vient pas de node_modules mais du réseau, et le figer évite de
 *   dépendre d'un CDN au moment du build.
 *
 * Idempotent : un fichier déjà présent et de même taille n'est pas recopié.
 */
import { createRequire } from 'node:module'
import { copyFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

const CORE_FILES = [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
]

const outDir = join(process.cwd(), 'public', 'tesseract')
mkdirSync(outDir, { recursive: true })

const coreDir = dirname(require.resolve('tesseract.js-core/package.json'))
const workerSrc = join(
  dirname(require.resolve('tesseract.js/package.json')),
  'dist',
  'worker.min.js',
)

const sources = [workerSrc, ...CORE_FILES.map((f) => join(coreDir, f))]

let copied = 0
for (const src of sources) {
  const dest = join(outDir, src.split(/[\\/]/).pop())
  let skip = false
  try {
    skip = statSync(dest).size === statSync(src).size
  } catch {
    skip = false
  }
  if (skip) continue
  copyFileSync(src, dest)
  copied++
}

console.log(
  copied === 0
    ? 'tesseract : binaires déjà à jour dans public/tesseract/'
    : `tesseract : ${copied} binaire(s) copié(s) dans public/tesseract/`,
)
