import { useEffect, useState } from 'react'
import { BUSINESS } from '../config.js'
import Icon from './icons.jsx'

export default function Header() {
  const [solid, setSolid] = useState(false)

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const phone = BUSINESS.phones[0]
  const social = 'text-white/70 transition-colors hover:text-gold-light'

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${
        solid ? 'bg-black/80' : 'bg-transparent'
      }`}
    >
      <div className="flex items-center justify-between px-6 py-4 md:px-16 md:py-5">
        <a
          href="#"
          className="font-display text-lg font-medium uppercase tracking-[0.32em] text-white md:text-xl"
        >
          {BUSINESS.name}
        </a>
        <nav className="flex items-center gap-5" aria-label="Kontakt">
          <a href={BUSINESS.instagram} target="_blank" rel="noopener noreferrer" className={social} aria-label="Instagram">
            <Icon name="instagram" className="h-5 w-5" />
          </a>
          <a href={BUSINESS.facebook} target="_blank" rel="noopener noreferrer" className={social} aria-label="Facebook">
            <Icon name="facebook" className="h-5 w-5" />
          </a>
          <a href={`tel:${phone.tel}`} className="btn btn-solid !px-4 !py-2.5" aria-label={`Pozovi ${phone.label}`}>
            <Icon name="phone" />
            <span className="hidden sm:inline">{phone.label}</span>
          </a>
        </nav>
      </div>
    </header>
  )
}
