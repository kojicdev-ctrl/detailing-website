import { useEffect, useRef } from 'react'
import { PROCESS, STEPS } from '../config.js'

const pad = (n) => String(n).padStart(2, '0')

// Telefon: kompaktne kartice, naizmenično levo/desno, kratak opis. Računar (md i više): isti raspored kao pre,
// sa punim opisom. Sve "md:" klase vraćaju prethodni izgled.
export default function Process() {
  const listRef = useRef(null)

  // Kartica ulazi sa strane jednom, kad se pojavi na ekranu (bez praćenja skrola, pa je lagano).
  // Sakrivanje počinje tek ovde, tako da bez IntersectionObserver-a kartice ostaju vidljive.
  useEffect(() => {
    const list = listRef.current
    if (!list || !('IntersectionObserver' in window)) return
    list.dataset.reveal = ''
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          // Kartica koja je već iznad ekrana (npr. posle osvežavanja stranice u sredini) se odmah prikazuje.
          if (e.isIntersecting || e.boundingClientRect.top < 0) {
            e.target.classList.add('is-in')
            io.unobserve(e.target)
          }
        }
      },
      { threshold: 0.2, rootMargin: '0px 0px -8% 0px' },
    )
    list.querySelectorAll('.step-card').forEach((li) => io.observe(li))
    return () => {
      io.disconnect()
      delete list.dataset.reveal
    }
  }, [])

  return (
    <section id="proces" className="border-b border-white/10 bg-ink px-6 py-24 md:px-16 md:py-36">
      <div className="mx-auto grid max-w-6xl gap-14 md:grid-cols-12 md:gap-16">
        <div className="md:col-span-5">
          <div className="md:sticky md:top-32">
            <p className="eyebrow">{PROCESS.eyebrow}</p>
            <h2 className="mt-5 font-display text-5xl font-medium leading-[1.02] md:text-6xl">{PROCESS.title}</h2>
            <p className="mt-6 max-w-sm leading-relaxed text-white/70">{PROCESS.text}</p>
          </div>
        </div>

        <ol ref={listRef} className="step-list flex flex-col gap-3 md:col-span-7 md:block">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className="step-card relative grid w-[88%] grid-cols-[2.4rem_1fr] items-baseline gap-x-2.5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4 even:ml-auto md:static md:w-auto md:grid-cols-[5rem_1fr] md:items-stretch md:gap-x-4 md:overflow-visible md:rounded-none md:border-x-0 md:border-b-0 md:bg-transparent md:p-0 md:py-10 md:even:ml-0 md:last:border-b"
            >
              <span className="font-display text-2xl font-medium leading-none text-gold md:text-4xl">{pad(i + 1)}</span>
              <div className="contents md:block">
                <h3 className="font-display text-[1.4rem] font-medium leading-tight text-white md:text-4xl">{s.title}</h3>
                <p className="col-span-2 mt-2 text-sm leading-snug text-white/65 md:hidden">{s.short}</p>
                <p className="mt-3 hidden max-w-xl leading-relaxed text-white/65 md:block">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
