// Samo za testove (dev server ili build sa VITE_HOOKS=1): usporeno dekodiranje. U običnom build-u ga nema.
const HOOKS = import.meta.env.DEV || import.meta.env.VITE_HOOKS

export function pickSequence(sequences) {
  const portrait = window.matchMedia('(orientation: portrait)').matches
  if (portrait && sequences.mobile.count > 0) return sequences.mobile
  return sequences.desktop
}

const frameUrl = (base, i) => `${base}/f_${String(i + 1).padStart(4, '0')}.webp`
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// Prvi i poslednji kadar, pa sve gušće: 16, 8, 4, 2, 1 (grubo pa fino).
function loadOrder(count) {
  const seen = new Set()
  const order = []
  const add = (i) => {
    if (i >= 0 && i < count && !seen.has(i)) {
      seen.add(i)
      order.push(i)
    }
  }
  add(0)
  add(count - 1)
  for (const stride of [16, 8, 4, 2, 1]) for (let i = 0; i < count; i += stride) add(i)
  return order
}

// Dekodiranje u pozadinskoj niti (ImageBitmap); rezerva za stare pregledače bez createImageBitmap.
async function decodeBlob(blob) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob)
  const img = new Image()
  const url = URL.createObjectURL(blob)
  img.src = url
  try {
    await img.decode()
  } finally {
    URL.revokeObjectURL(url)
  }
  return img
}

/**
 * Jedan sloj frejmova: preuzimanje (blob), dekodiranje (ImageBitmap) i, po želji, držanje u memoriji samo
 * frejmova oko trenutnog. Dekodiran frejm 720x1280 zauzima ~3.7 MB, pa 240 njih na telefonu je skoro 900 MB.
 *   order  'stride' = grubo pa fino po celoj sekvenci; 'near' = prvo najbliži trenutnom frejmu.
 *   around = koliko frejmova sa svake strane trenutnog se dekodira unapred.
 *   keep   = do koje udaljenosti od trenutnog dekodirani frejm ostaje u memoriji (dalje se oslobađa).
 */
function createLayer({ base, count, order, around = Infinity, keep = Infinity, priority, delayScale = 1, pump, onBitmap, onSettled }) {
  const blobs = new Array(count).fill(null)
  const bitmaps = new Array(count).fill(null)
  const failed = new Array(count).fill(false)
  const decoding = new Set()
  const queue = order === 'stride' ? loadOrder(count) : null
  const asked = queue ? null : new Uint8Array(count)
  const abort = new AbortController()
  let qi = 0
  let settled = 0
  let workers = 0
  let limit = 0
  let dead = false
  let active = true
  let focus = 0
  let fetchFocus = 0
  let heading = 1
  let decodeMs = 0

  // Prvo bliži frejmovi, a oni ispred smera skrola imaju prednost.
  const score = (i, from) => {
    const d = i - from
    return d * heading >= 0 ? Math.abs(d) : Math.abs(d) * 2
  }

  function nextFetch() {
    if (queue) return qi < queue.length ? queue[qi++] : -1
    let best = -1
    let bestScore = Infinity
    for (let i = 0; i < count; i++) {
      if (asked[i]) continue
      const s = score(i, fetchFocus)
      if (s < bestScore) {
        bestScore = s
        best = i
      }
    }
    if (best >= 0) asked[best] = 1
    return best
  }

  const settle = () => {
    if (++settled === count) onSettled?.()
  }

  async function worker() {
    workers++
    try {
      while (!dead && workers <= limit) {
        const i = nextFetch()
        if (i < 0) break
        try {
          const res = await fetch(frameUrl(base, i), { signal: abort.signal, ...(priority ? { priority } : {}) })
          if (!res.ok) throw new Error(String(res.status))
          const blob = await res.blob()
          if (dead) return
          blobs[i] = blob
          pump()
        } catch {
          // frejm koji nedostaje se preskače
        }
        settle()
      }
    } finally {
      workers--
    }
  }

  function setLimit(n) {
    limit = n
    const need = limit - workers
    for (let k = 0; k < need && !dead; k++) worker()
  }

  // Sledeći frejm za dekodiranje (ili -1): preuzet, nedekodiran i u prozoru oko trenutnog.
  function candidate() {
    if (!active) return -1
    let best = -1
    let bestScore = Infinity
    for (let i = 0; i < count; i++) {
      if (!blobs[i] || bitmaps[i] || failed[i] || decoding.has(i)) continue
      if (Math.abs(i - focus) > around) continue
      const s = score(i, focus)
      if (s < bestScore) {
        bestScore = s
        best = i
      }
    }
    return best
  }

  // Poziva se samo posle candidate(); `decoding` se postavlja odmah (pre prvog await).
  async function decode(i) {
    decoding.add(i)
    const t0 = performance.now()
    try {
      if (HOOKS && window.__decodeDelay) await new Promise((r) => setTimeout(r, window.__decodeDelay * delayScale))
      const bmp = await decodeBlob(blobs[i])
      const ms = performance.now() - t0
      decodeMs = decodeMs ? decodeMs * 0.7 + ms * 0.3 : ms
      if (dead || Math.abs(i - focus) > keep) {
        bmp.close?.()
      } else {
        bitmaps[i] = bmp
        onBitmap(i)
      }
    } catch {
      failed[i] = true // frejm koji se ne može dekodirati se preskače; nearest uzima susedni
    } finally {
      decoding.delete(i)
    }
  }

  function evict() {
    if (keep === Infinity) return
    for (let i = 0; i < count; i++) {
      if (bitmaps[i] && Math.abs(i - focus) > keep) {
        bitmaps[i].close?.()
        bitmaps[i] = null
      }
    }
  }

  function nearestIndex(i) {
    if (bitmaps[i]) return i
    for (let d = 1; d < count; d++) {
      if (i - d >= 0 && bitmaps[i - d]) return i - d
      if (i + d < count && bitmaps[i + d]) return i + d
    }
    return -1
  }

  return {
    count,
    setLimit,
    candidate,
    decode,
    nearestIndex,
    get: (i) => bitmaps[i],
    // Frejm u fokusu: oko njega se dekodira, a daleko se oslobađa memorija.
    setFocus(i) {
      fetchFocus = i
      if (i === focus) return
      heading = i > focus ? 1 : -1
      focus = i
      evict()
      pump()
    },
    // Samo redosled preuzimanja, bez dekodiranja i oslobađanja (za vreme brzog skrola).
    hint(i) {
      fetchFocus = i
    },
    setActive(on) {
      const wake = on && !active
      active = on
      if (wake) pump()
    },
    get decodeMs() {
      return decodeMs
    },
    residentCount: () => bitmaps.reduce((n, b) => n + (b ? 1 : 0), 0),
    destroy() {
      dead = true
      abort.abort()
      for (let i = 0; i < count; i++) {
        bitmaps[i]?.close?.()
        bitmaps[i] = null
        blobs[i] = null
      }
    },
  }
}

/**
 * Sekvenca frejmova. Dve vrste:
 *
 * Desktop (bez `soft`): jedan sloj, svi frejmovi dekodirani, preuzimanje grubo pa fino.
 *
 * Telefon (sa `soft`): dva sloja.
 *   soft  = mali frejmovi (svaki ~2. izvorni), svi dekodirani. Stižu prvi i uvek je tu tačan frejm za
 *           trenutni skrol, pa animacija nikad ne zastaje, ni pri prvom dolasku ni pri brzom zamahu.
 *   oštri = svi frejmovi, dekodirani samo oko trenutnog. Crtaju se kad skrol uspori ili stane.
 * Preklapanje ide po brzini skrola (frejmova u sekundi) sa histerezom, da slika ne trepće. Prag zavisi od
 * izmerene brzine dekodiranja na tom uređaju: sporiji telefon ranije prelazi na male frejmove.
 *
 * Frejm j malog sloja je izvorni frejm round(j * (count - 1) / (soft.count - 1)); isto računa tools/build-mobile.mjs.
 */
export function createSequence(cfg, onLoad = () => {}, concurrency = 6) {
  const { count, soft: softCfg } = cfg
  const layered = Boolean(softCfg)
  const maxDecodes = layered ? 3 : 2
  let dead = false
  let busy = 0
  let fast = false
  let current = 0

  const srcOf = (j) => Math.round((j * (count - 1)) / (softCfg.count - 1))
  const softOf = (i) => Math.round((i * (softCfg.count - 1)) / (count - 1))

  // Prvo mali frejmovi (jeftini, a bez njih nema slike), pa oštri.
  const layers = []
  let soft = null

  function pump() {
    while (!dead && busy < maxDecodes) {
      let layer = null
      let i = -1
      for (const L of layers) {
        i = L.candidate()
        if (i >= 0) {
          layer = L
          break
        }
      }
      if (!layer) return
      busy++
      layer.decode(i).finally(() => {
        busy--
        pump()
      })
    }
  }

  const main = createLayer({
    base: cfg.dir,
    count,
    order: layered ? 'near' : 'stride',
    around: layered ? cfg.around : Infinity,
    keep: layered ? cfg.keep : Infinity,
    priority: layered ? 'low' : undefined,
    delayScale: 1,
    pump,
    // Oštri frejm je važan samo ako je baš onaj koji se prikazuje.
    onBitmap: (i) => {
      if (!layered || (!fast && i === current)) onLoad(i)
    },
  })

  if (layered) {
    soft = createLayer({
      base: softCfg.dir,
      count: softCfg.count,
      order: 'stride',
      delayScale: 0.25,
      pump,
      onBitmap: () => onLoad(-1),
      // Kad mali frejmovi stignu, oštri smeju da uzmu ceo propusni opseg.
      onSettled: () => main.setLimit(Math.min(3, concurrency)),
    })
    layers.push(soft)
  }
  layers.push(main)

  return {
    count,
    start() {
      if (layered) {
        // Mali frejmovi su sitni (~13 KB), pa vreme odlazi na kašnjenje mreže, a ne na prenos: više zahteva odjednom
        // (HTTP/2 ih šalje preko jedne veze, a HTTP/1.1 ih pregledač sam stavlja u red).
        soft.setLimit(concurrency * 2)
        main.setLimit(1) // samo da prvi oštri frejm stigne odmah; ostali čekaju male
      } else {
        main.setLimit(concurrency)
      }
    },
    destroy() {
      dead = true
      for (const L of layers) L.destroy()
    },
    // Poziva se u svakom kadru: frejm (može decimalan) i brzina skrola u frejmovima u sekundi.
    update(frame, speed = 0) {
      const idx = Math.round(frame)
      current = idx
      if (!layered) {
        main.setFocus(idx)
        return
      }
      // Koliko brzo ovaj uređaj dekodira oštre frejmove (ms po frejmu, uz više istovremenih) određuje do koje
      // brzine skrola ima smisla čekati na njih. Pre prvog merenja pretpostavka je 20 ms.
      const exit = clamp(1100 / (main.decodeMs || 20), 30, 90)
      if (fast) {
        if (speed < exit * 0.6) fast = false
      } else if (speed > exit) {
        fast = true
      }
      soft.setFocus(softOf(idx))
      if (fast) {
        main.setActive(false)
        main.hint(idx)
      } else {
        main.setActive(true)
        main.setFocus(idx)
      }
    },
    // Šta crtati za frejm idx: { img, index (izvorni frejm), soft, under (mali frejm ispod, za preliv) } ili null.
    pick(idx) {
      if (!layered) {
        const k = main.nearestIndex(idx)
        return k < 0 ? null : { img: main.get(k), index: k, soft: false, under: null }
      }
      const j = soft.nearestIndex(softOf(idx))
      if (!fast) {
        const sharp = main.get(idx)
        if (sharp) return { img: sharp, index: idx, soft: false, under: j < 0 ? null : soft.get(j) }
      }
      if (j >= 0) return { img: soft.get(j), index: srcOf(j), soft: true, under: null }
      const k = main.nearestIndex(idx)
      return k < 0 ? null : { img: main.get(k), index: k, soft: false, under: null }
    },
    residentCount: () => main.residentCount(),
    softCount: () => (layered ? soft.residentCount() : 0),
    get fast() {
      return fast
    },
  }
}
