import { useEffect, useRef, useState } from 'react'
import { BUSINESS, FOLLOW, SEQUENCES } from '../config.js'
import { createSequence, pickSequence } from '../lib/sequence.js'
import { frameForProgress, introVisible } from '../lib/timeline.js'
import Icon from './icons.jsx'

// Samo za testove (dev server ili build sa VITE_HOOKS=1): stanje animacije u atributima canvasa.
const HOOKS = import.meta.env.DEV || import.meta.env.VITE_HOOKS
const FADE_MS = 120 // preliv malog frejma u oštri kad skrol stane
const SPEED_FALL_MS = 120 // za toliko brzina skrola opada na ~37% kad se skrol usporava

function Panel({ on, children }) {
  return <div className={`panel ${on ? 'is-on' : ''}`}>{children}</div>
}

function PhoneButtons() {
  return (
    <div className="hit mt-8 flex flex-wrap gap-3">
      {BUSINESS.phones.map((p, i) => (
        <a key={p.tel} href={`tel:${p.tel}`} className={`btn ${i === 0 ? 'btn-solid' : ''}`}>
          <Icon name="phone" />
          {p.label}
        </a>
      ))}
    </div>
  )
}

export default function ScrollStory() {
  const sectionRef = useRef(null)
  const canvasRef = useRef(null)
  const [intro, setIntro] = useState(true)
  // Početna visina po tipu uređaja, da se stranica ne "skoči" posle prvog crtanja; dalje je vodi efekat.
  const [initialVh] = useState(() => pickSequence(SEQUENCES).scrollVh)

  // Odmah na sledeću sekciju (bez glatkog skrola kroz celu animaciju).
  const skip = (e) => {
    e.preventDefault()
    const next = document.getElementById('proces')
    if (next) window.scrollTo({ top: next.getBoundingClientRect().top + window.scrollY, behavior: 'instant' })
  }

  useEffect(() => {
    const section = sectionRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d', { alpha: false })
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Na telefonu i tabletu skrol već ima svoje ubrzanje i kočenje. Kad bi animacija još i "sustizala" skrol,
    // kasnila bi za prstom pa se ubrzavala i usporavala. Zato tu ide direktno: frejm zavisi samo od pozicije skrola.
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const direct = coarse || reduceMotion

    let cfg = pickSequence(SEQUENCES)
    let seq
    let cssW = 0 // veličina canvasa u CSS pikselima
    let cssH = 0
    let cw = 0 // veličina canvasa u pikselima uređaja
    let ch = 0
    let top = 0 // gde sekcija počinje u dokumentu (px)
    let total = 1 // skrol kroz animaciju (px)
    let target = 0
    let current = 0
    let prevCurrent = 0
    let speed = 0 // brzina skrola u frejmovima u sekundi (brzo raste, sporo opada)
    let still = 0 // koliko kadrova zaredom se frejm nije promenio
    let lastImg = null
    let lastLayer = '' // 's' = mali frejm, 'h' = oštri
    let fade = null // preliv malog u oštri frejm: { idx, t0 }
    let dirty = true
    let raf = 0
    let prevT = 0
    let calm = 0
    let introNow = null

    // Visina sekcije je zadata u vh, a skrol kroz animaciju je (scrollVh - 100) vh. vh se ne menja kad se na
    // telefonu pojavi ili sakrije traka sa adresom (za razliku od innerHeight), pa progres ne skače.
    const measure = () => {
      top = section.getBoundingClientRect().top + window.scrollY
      total = (section.offsetHeight * (cfg.scrollVh - 100)) / cfg.scrollVh
    }

    const progress = () => (total > 0 ? Math.min(1, Math.max(0, (window.scrollY - top) / total)) : 0)

    // Uspravni frejmovi (mobilna sekvenca) popunjavaju ekran. Široki frejmovi na uspravnom ekranu
    // (rezerva ako mobilna sekvenca nije dostupna) se prikazuju celi, sa crnim prostorom ispod.
    const fit = (iw, ih, bw, bh) => {
      const letterbox = ih <= iw && bh > bw * 1.1
      return { letterbox, scale: letterbox ? Math.min(bw / iw, bh / ih) : Math.max(bw / iw, bh / ih) }
    }

    // Crta izabrani frejm. Vraća true dok traje preliv (treba još kadrova).
    const paint = (p, idx, now) => {
      // Sve slike sekvence se crtaju u isti pravougaonik (mali frejmovi su samo manje rezolucije), pa se
      // veličina uzima iz podešavanja, a ne iz slike.
      const [sw, sh] = cfg.size
      const { letterbox, scale } = fit(sw, sh, cw, ch)
      // Celi pikseli: bez razmazivanja ivica, a slika uvek prekriva ceo canvas.
      const dw = Math.ceil(sw * scale)
      const dh = Math.ceil(sh * scale)
      const dx = Math.floor((cw - dw) / 2)
      const dy = Math.floor(letterbox ? (ch - dh) * 0.36 : (ch - dh) / 2)
      if (letterbox) {
        ctx.fillStyle = '#060606'
        ctx.fillRect(0, 0, cw, ch)
      }
      // Kad se posle malog frejma pojavi oštri za isti položaj, on se postepeno preliva preko malog (~120 ms).
      let alpha = 1
      if (p.soft) {
        fade = null
        lastLayer = 's'
      } else {
        if (p.under) {
          if (lastLayer === 's' && !fade) fade = { idx, t0: now }
          if (fade) {
            if (fade.idx !== idx) fade = null
            else {
              alpha = Math.min(1, (now - fade.t0) / FADE_MS)
              if (alpha >= 1) fade = null
            }
          }
        } else {
          fade = null
        }
        lastLayer = 'h'
      }
      if (alpha < 1) {
        ctx.drawImage(p.under, dx, dy, dw, dh)
        ctx.globalAlpha = alpha
        ctx.drawImage(p.img, dx, dy, dw, dh)
        ctx.globalAlpha = 1
        return true
      }
      ctx.drawImage(p.img, dx, dy, dw, dh)
      return false
    }

    const readTarget = () => {
      const p = progress()
      target = frameForProgress(p, seq.count)
      const on = introVisible(p, total)
      if (on !== introNow) {
        introNow = on
        setIntro(on)
      }
    }

    const tick = (t) => {
      raf = 0
      const dt = Math.min(64, t - prevT || 16)
      prevT = t
      const before = target
      if (direct) {
        // Skrol se čita u svakom kadru, pa ne zavisi od toga koliko često pregledač šalje scroll događaje.
        readTarget()
        current = target
      } else {
        // Što je zaostatak veći (brz skrol), to animacija brže sustiže; kod malog zaostatka ostaje glatka.
        const gap = Math.abs(target - current)
        const rate = Math.min(FOLLOW.max, FOLLOW.base + gap * FOLLOW.perFrame)
        current += (target - current) * (1 - Math.exp((-dt / 1000) * rate))
        if (Math.abs(target - current) < 0.02) current = target
      }
      // Brzina skrola: brzo raste, a opada sporije (da slika ne preskače između malih i oštrih frejmova).
      // Kad se frejm nekoliko kadrova nije pomerio, zamah je stao, pa brzina odmah pada na nulu.
      const moved = Math.abs(current - prevCurrent)
      prevCurrent = current
      still = moved === 0 ? still + 1 : 0
      const inst = (moved * 1000) / dt
      if (still >= 3) speed = 0
      else if (inst > speed) speed = inst
      else speed += (inst - speed) * (1 - Math.exp(-dt / SPEED_FALL_MS))
      seq.update(current, speed)
      const idx = Math.round(current)
      const p = seq.pick(idx)
      if (HOOKS) {
        canvas.dataset.frame = idx
        canvas.dataset.shown = p ? p.index : -1
        canvas.dataset.layer = p ? (p.soft ? 's' : 'h') : ''
        canvas.dataset.resident = seq.residentCount()
        canvas.dataset.lres = seq.softCount()
      }
      let fading = false
      if (p && cw && (dirty || p.img !== lastImg || fade)) {
        fading = paint(p, idx, t)
        lastImg = p.img
        dirty = false
      }
      calm = target === before ? calm + 1 : 0
      // Direktni režim još ~8 kadrova posle poslednje promene proverava skrol (zamah bez scroll događaja).
      if (current !== target || (direct && calm < 8) || fading) raf = requestAnimationFrame(tick)
    }

    const wake = () => {
      if (!raf) {
        prevT = performance.now()
        raf = requestAnimationFrame(tick)
      }
    }

    const sync = () => {
      readTarget()
      calm = 0
      wake()
    }

    const mount = () => {
      // Visina sekcije zavisi od sekvence (telefon ima kraći skrol), a postavlja se pre računanja progresa.
      section.style.height = `${cfg.scrollVh}vh`
      measure()
      // Kad stigne novi frejm, kadar se ponovo bira i crta samo ako se zaista menja ono što se vidi.
      seq = createSequence(cfg, wake)
      seq.start()
      readTarget()
      current = target
      prevCurrent = current
      speed = 0
      still = 0
      lastImg = null
      lastLayer = ''
      fade = null
      dirty = true
      sync()
    }

    const resize = () => {
      const next = pickSequence(SEQUENCES)
      const switched = next !== cfg
      const nw = canvas.clientWidth
      const nh = canvas.clientHeight
      if (!switched && nw === cssW && nh === cssH) return
      if (switched) {
        seq.destroy()
        cfg = next
        mount()
      }
      cssW = nw
      cssH = nh
      let dpr = Math.min(window.devicePixelRatio || 1, 2)
      if (coarse) {
        // Izvorni frejm nema više detalja od svojih piksela, pa canvas na telefonu ne crtamo većim od toga.
        // Slika je ista, a crta se oko 40% manje piksela. Pregledač je posle razvuče na pun ekran.
        const [sw, sh] = cfg.size
        dpr = Math.max(0.5, Math.min(dpr, 1 / fit(sw, sh, cssW, cssH).scale))
      }
      cw = Math.round(cssW * dpr)
      ch = Math.round(cssH * dpr)
      canvas.width = cw
      canvas.height = ch
      ctx.imageSmoothingQuality = 'high'
      measure()
      dirty = true
      sync()
    }

    mount()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()
    window.addEventListener('scroll', sync, { passive: true })

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('scroll', sync)
      seq.destroy()
    }
  }, [])

  return (
    <section
      ref={sectionRef}
      className="relative"
      style={{ height: `${initialVh}vh` }}
      aria-label="Proces rada"
    >
      <div className="sticky top-0 h-dvh w-full overflow-hidden bg-ink">
        <canvas ref={canvasRef} className="story-canvas absolute left-0 top-0 w-full" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/80 to-transparent" />
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-[70%] bg-gradient-to-t from-black/90 via-black/55 to-transparent max-md:h-[62%] max-md:from-black/95 max-md:via-black/80 transition-opacity duration-700 ${
            intro ? 'opacity-100' : 'opacity-0'
          }`}
        />

        <a
          href="#proces"
          onClick={skip}
          tabIndex={intro ? 0 : -1}
          aria-hidden={!intro}
          className={`btn absolute right-6 top-[6.25rem] !px-4 !py-2 !text-xs bg-black/40 transition-opacity duration-500 md:right-16 md:top-28 ${
            intro ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          Preskoči animaciju
          <Icon name="arrow" />
        </a>

        <Panel on={intro}>
          <p className="eyebrow">
            {BUSINESS.subtitle} · {BUSINESS.place}
          </p>
          <h1 className="mt-4 font-display text-[clamp(3.25rem,9vw,9rem)] font-medium leading-[0.95] text-white">
            {BUSINESS.name}
          </h1>
          <PhoneButtons />
          <div className="absolute bottom-12 right-6 hidden items-center gap-3 md:right-16 md:flex">
            <span className="eyebrow !text-white/50">Skroluj</span>
            <span className="scroll-hint-line block h-12 w-px bg-gold" />
          </div>
        </Panel>

      </div>
    </section>
  )
}
