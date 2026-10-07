/**
 * Pravi mobilnu sekvencu (uspravan video) u dva sloja:
 *   <izlaz>/f_0001.webp ...      oštri frejmovi, svi (720x1280)
 *   <izlaz>/s/f_0001.webp ...    mali frejmovi (360x640), svaki ~2. frejm, ravnomerno raspoređeni od prvog do poslednjeg
 *
 * Mali frejmovi služe da se animacija uvek prikazuje bez zastoja i da stignu brzo (pred oštrim frejmovima).
 * Frejm j malog sloja je izvorni frejm round(j * (count - 1) / (soft - 1)); isto računa i sajt (lib/sequence.js).
 *
 * Upotreba:
 *   node tools/build-mobile.mjs <video.mp4> <izlazni-folder> [soft=120] [kvalitet=60] [kvalitet-malih=55]
 *
 * Izlazni folder treba da ima novo ime kad se frejmovi menjaju (npr. /frames/m3), jer se fajlovi
 * keširaju godinu dana (public/_headers).
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const [, , SRC, OUT, SOFT = '120', Q = '60', QS = '55'] = process.argv
if (!SRC || !OUT) {
  console.error('Upotreba: node tools/build-mobile.mjs <video.mp4> <izlazni-folder> [soft] [kvalitet] [kvalitet-malih]')
  process.exit(1)
}

const probe = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_read_frames', '-of', 'csv=p=0', SRC])
const [w, h, n] = String(probe.stdout).trim().split(',').map(Number)
console.log(`izvor: ${w}x${h}, ${n} frejmova`)
const soft = Number(SOFT)

function run(args) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

const clean = (dir) => {
  fs.mkdirSync(dir, { recursive: true })
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.webp')) fs.unlinkSync(path.join(dir, f))
}
clean(OUT)
clean(path.join(OUT, 's'))

// 1) oštri frejmovi: svi, bez promene veličine
run(['-i', SRC, '-c:v', 'libwebp', '-quality', Q, '-compression_level', '6', '-preset', 'photo', '-start_number', '1', path.join(OUT, 'f_%04d.webp')])

// 2) mali frejmovi
const pick = []
for (let j = 0; j < soft; j++) pick.push(Math.round((j * (n - 1)) / (soft - 1)))
if (new Set(pick).size !== pick.length) throw new Error('soft je pregust za ovaj broj frejmova')
// Isti izbor kao formula (dug zbir eq() ffmpeg ne podnosi): n je izabran ako je n = round(round(n*(S-1)/(N-1))*(N-1)/(S-1)).
const expr = `eq(round(round(n*${soft - 1}/${n - 1})*${n - 1}/${soft - 1})\\,n)`
run([
  '-i', SRC,
  '-vf', `select='${expr}',scale=${w / 2}:${h / 2}:flags=lanczos`,
  '-fps_mode', 'passthrough',
  '-c:v', 'libwebp', '-quality', QS, '-compression_level', '6', '-preset', 'photo',
  '-start_number', '1', path.join(OUT, 's', 'f_%04d.webp'),
])

const got = fs.readdirSync(path.join(OUT, 's')).filter((f) => f.endsWith('.webp')).length
if (got !== soft) throw new Error(`mali frejmovi: ${got}, očekivano ${soft}`)

const sum = (dir) => {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.webp'))
  return { files: files.length, bytes: files.reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0) }
}
for (const [name, dir] of [['oštri', OUT], ['mali', path.join(OUT, 's')]]) {
  const s = sum(dir)
  console.log(`${name}: ${s.files} frejmova, ${(s.bytes / 1048576).toFixed(2)} MB, prosek ${(s.bytes / s.files / 1024).toFixed(0)} KB`)
}
