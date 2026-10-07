/**
 * Izvlači frejmove iz videa u WebP i uklanja "burned-in" tekst koji je AI video generator
 * ostavio u gornjem levom uglu (CHOOSE / EXPERIENCE / DEMAND).
 *
 * Kako radi:
 *  1. Iz gornjeg levog ugla svih frejmova uzme sirove YUV piksele.
 *  2. Tekst je statičan i uvek iste svetline (~235), a pozadina se pomera. Zato se "statička maska"
 *     reči sastoji od piksela koji su bar u FRAC frejmova prozora svetli kao tekst. (Ne koristi se
 *     minimum kroz vreme, jer predmet u prvom planu - četka/pištolj - povremeno prelazi preko slova.)
 *  3. U svakom frejmu se čisti samo ono što je u tom frejmu zaista vidljivo (statička maska AND svetlo),
 *     pa se delovi slova skriveni iza predmeta u prvom planu ne diraju.
 *  4. Pikseli slova se popune harmonijskom difuzijom iz okoline (glatko, bez vidljivih "zakrpa").
 *  5. Očišćeni ugao se vrati preko originalnog videa i izveze u WebP.
 *
 * Upotreba:
 *   node tools/build-frames.mjs <video.mp4> <izlazni-folder> [sirina=1280] [kvalitet=75]
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const [, , SRC, OUT, WIDTH = '1280', QUALITY = '75'] = process.argv
if (!SRC || !OUT) {
  console.error('Upotreba: node tools/build-frames.mjs <video.mp4> <izlazni-folder> [sirina] [kvalitet]')
  process.exit(1)
}

// 0-based indeksi frejmova (izmereno: pokrivenost statičke maske skače 0.1 -> 1.0 na tvrdim rezovima).
//  show: frejmovi u kojima se reč vidi; ref: prozor iz kog se računa statička maska;
//  box: [x0, x1, y0, y1] u kom tražimo slova (da ne uhvatimo statične odsjaje van teksta).
const WORDS = [
  { name: 'choose', show: [0, 42], ref: [2, 40], box: [45, 320, 44, 96] },
  { name: 'experience', show: [43, 74], ref: [46, 73], box: [55, 372, 46, 96] },
  { name: 'demand', show: [132, 157], ref: [134, 155], box: [122, 372, 50, 100] },
]
const R = { w: 480, h: 140 } // gornji levi ugao koji obrađujemo
const CORE = 222 // svetlina jezgra slova (tekst je ~230-239 u limited range)
const FRAC = 0.35 // udeo frejmova u kojima piksel mora biti svetao da uđe u statičku masku
const VISIBLE = 205 // piksel statičke maske se u frejmu čisti samo ako je bar ovoliko svetao
const GROW = 3 // koliko piksela širimo masku da pokrijemo anti-aliasing ivice

const cache = path.resolve('tools/.cache')
fs.mkdirSync(cache, { recursive: true })
fs.mkdirSync(OUT, { recursive: true })

const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=pix_fmt,r_frame_rate', '-of', 'csv=p=0', SRC])
console.log('izvor:', String(probe.stdout).trim())

// 1) sirovi YUV420 piksele gornjeg levog ugla
const raw = spawnSync(
  'ffmpeg',
  ['-v', 'error', '-i', SRC, '-vf', `crop=${R.w}:${R.h}:0:0`, '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-'],
  { maxBuffer: 1024 * 1024 * 512 },
)
if (raw.status !== 0) throw new Error(String(raw.stderr))
const ySize = R.w * R.h
const cw = R.w / 2
const ch = R.h / 2
const cSize = cw * ch
const frameSize = ySize + 2 * cSize
const frames = raw.stdout.length / frameSize
console.log(`frejmova: ${frames}`)
const data = Buffer.from(raw.stdout) // kopija koju menjamo

function dilate(bin, w, h, r) {
  const tmp = new Uint8Array(bin.length)
  const out = new Uint8Array(bin.length)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0
      for (let k = -r; k <= r && !v; k++) {
        const xx = x + k
        if (xx >= 0 && xx < w && bin[y * w + xx]) v = 1
      }
      tmp[y * w + x] = v
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0
      for (let k = -r; k <= r && !v; k++) {
        const yy = y + k
        if (yy >= 0 && yy < h && tmp[yy * w + x]) v = 1
      }
      out[y * w + x] = v
    }
  return out
}

/** Popuni piksele (mask=1) harmonijskom difuzijom iz poznatih piksela. */
function inpaint(buf, offset, w, h, mask, iterations = 220) {
  const p = new Float32Array(w * h)
  for (let i = 0; i < p.length; i++) p[i] = buf[offset + i]
  const filled = new Uint8Array(w * h)
  for (let i = 0; i < filled.length; i++) filled[i] = mask[i] ? 0 : 1

  // inicijalno punjenje od ivica ka sredini
  for (let pass = 0; pass < 60; pass++) {
    const upd = []
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x
        if (filled[i]) continue
        let s = 0
        let n = 0
        for (const j of [i - 1, i + 1, i - w, i + w]) if (filled[j]) { s += p[j]; n++ }
        if (n) upd.push([i, s / n])
      }
    if (!upd.length) break
    for (const [i, v] of upd) { p[i] = v; filled[i] = 1 }
  }

  const idx = []
  for (let i = 0; i < mask.length; i++) if (mask[i]) idx.push(i)
  const omega = 1.85
  for (let it = 0; it < iterations; it++)
    for (const i of idx) {
      const avg = (p[i - 1] + p[i + 1] + p[i - w] + p[i + w]) * 0.25
      p[i] += omega * (avg - p[i])
    }
  for (const i of idx) buf[offset + i] = Math.max(0, Math.min(255, Math.round(p[i])))
}

// 2) staticka maska reci + 3) ciscenje svakog frejma
for (const word of WORDS) {
  const [ra, rb] = word.ref
  const need = Math.ceil((rb - ra + 1) * FRAC)
  const cnt = new Uint16Array(ySize)
  for (let f = ra; f <= rb; f++) {
    const off = f * frameSize
    for (let i = 0; i < ySize; i++) if (raw.stdout[off + i] >= CORE) cnt[i]++
  }
  const [bx0, bx1, by0, by1] = word.box
  const S = new Uint8Array(ySize)
  let sCount = 0
  for (let y = by0; y <= by1; y++)
    for (let x = bx0; x <= bx1; x++)
      if (cnt[y * R.w + x] >= need) {
        S[y * R.w + x] = 1
        sCount++
      }

  let minCov = 1
  let maxMask = 0
  for (let f = word.show[0]; f <= word.show[1]; f++) {
    const off = f * frameSize
    // vidljivi pikseli slova u ovom frejmu
    const V = new Uint8Array(ySize)
    let vis = 0
    for (let i = 0; i < ySize; i++)
      if (S[i] && raw.stdout[off + i] >= VISIBLE) {
        V[i] = 1
        vis++
      }
    minCov = Math.min(minCov, vis / sCount)
    const maskY = dilate(V, R.w, R.h, GROW)

    // maska za hromu (pola rezolucije): bilo koji od 2x2 piksela, plus jedan piksel margine
    const mc = new Uint8Array(cSize)
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        const i = 2 * y * R.w + 2 * x
        if (maskY[i] || maskY[i + 1] || maskY[i + R.w] || maskY[i + R.w + 1]) mc[y * cw + x] = 1
      }
    const maskC = dilate(mc, cw, ch, 1)

    let count = 0
    for (let i = 0; i < ySize; i++) count += maskY[i]
    maxMask = Math.max(maxMask, count)

    inpaint(data, off, R.w, R.h, maskY)
    inpaint(data, off + ySize, cw, ch, maskC, 120)
    inpaint(data, off + ySize + cSize, cw, ch, maskC, 120)
  }
  console.log(
    `${word.name}: staticka maska ${sCount} px, frejmovi ${word.show[0]}-${word.show[1]}, ` +
      `najmanja vidljivost ${(minCov * 100).toFixed(0)}%, najveca maska ${maxMask} px`,
  )
}
const regionFile = path.join(cache, 'region.raw')
fs.writeFileSync(regionFile, data)

// 4) vrati ocisceni ugao preko videa i izvezi u WebP
const outPattern = path.resolve(OUT, 'f_%04d.webp')
const enc = spawnSync(
  'ffmpeg',
  [
    '-v', 'error', '-y',
    '-i', path.resolve(SRC),
    '-f', 'rawvideo', '-pixel_format', 'yuv420p', '-video_size', `${R.w}x${R.h}`, '-framerate', '24', '-i', 'region.raw',
    '-filter_complex', `[0:v][1:v]overlay=0:0:format=yuv420[o];[o]scale=${WIDTH}:-2:flags=lanczos[out]`,
    '-map', '[out]',
    '-c:v', 'libwebp', '-quality', QUALITY, '-compression_level', '6', '-preset', 'photo',
    '-start_number', '1', outPattern,
  ],
  { cwd: cache, stdio: ['ignore', 'inherit', 'inherit'] },
)
if (enc.status !== 0) process.exit(enc.status ?? 1)

const files = fs.readdirSync(OUT).filter((f) => f.endsWith('.webp'))
const bytes = files.reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0)
console.log(`gotovo: ${files.length} frejmova, ${(bytes / 1048576).toFixed(1)} MB, prosek ${(bytes / files.length / 1024).toFixed(0)} KB`)
