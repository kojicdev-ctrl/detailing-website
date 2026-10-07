import { BUSINESS } from '../config.js'
import Icon from './icons.jsx'

const fieldClass =
  'w-full border-0 border-b border-white/20 bg-transparent py-3 text-base text-white placeholder-white/25 outline-none transition-colors focus:border-gold'

function Field({ label, name, textarea, ...rest }) {
  const Tag = textarea ? 'textarea' : 'input'
  return (
    <label className="block">
      <span className="eyebrow !text-white/50">{label}</span>
      <Tag name={name} className={fieldClass} {...rest} />
    </label>
  )
}

function submit(e) {
  e.preventDefault()
  const d = new FormData(e.currentTarget)
  const lines = ['Zdravo, javljam se preko sajta.', `Ime: ${d.get('name')}`, `Telefon: ${d.get('phone')}`]
  if (d.get('car')) lines.push(`Auto: ${d.get('car')}`)
  if (d.get('message')) lines.push(`Poruka: ${d.get('message')}`)
  const url = `https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent(lines.join('\n'))}`
  window.open(url, '_blank', 'noopener')
}

export default function Contact() {
  const link = 'inline-flex items-center gap-3 text-white/80 transition-colors hover:text-gold-light'

  return (
    <section id="kontakt" className="bg-ink px-6 py-24 md:px-16 md:py-32">
      <div className="mx-auto grid max-w-6xl gap-16 md:grid-cols-2 md:gap-24">
        <div>
          <p className="eyebrow">Kontakt</p>
          <h2 className="mt-4 font-display text-5xl font-medium leading-[1.02] md:text-7xl">Zakažite termin</h2>
          <p className="mt-6 max-w-md leading-relaxed text-white/70">
            Termin se dogovara pozivom ili porukom.
          </p>

          <ul className="mt-10 space-y-4">
            {BUSINESS.phones.map((p) => (
              <li key={p.tel}>
                <a href={`tel:${p.tel}`} className={`${link} text-lg`}>
                  <Icon name="phone" className="h-5 w-5 text-gold" />
                  {p.label}
                </a>
              </li>
            ))}
            <li className="flex items-start gap-3 text-white/80">
              <span className="mt-0.5 h-5 w-5 shrink-0 text-center text-gold">•</span>
              {BUSINESS.address}
            </li>
          </ul>

          <div className="mt-10 flex flex-wrap gap-3">
            <a href={BUSINESS.instagram} target="_blank" rel="noopener noreferrer" className="btn">
              <Icon name="instagram" className="h-5 w-5" />
              Instagram
            </a>
            <a href={BUSINESS.facebook} target="_blank" rel="noopener noreferrer" className="btn">
              <Icon name="facebook" className="h-5 w-5" />
              Facebook
            </a>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-7">
          <Field label="Ime i prezime" name="name" required autoComplete="name" />
          <Field label="Telefon" name="phone" type="tel" required autoComplete="tel" />
          <Field label="Auto (marka i model)" name="car" />
          <Field label="Poruka" name="message" textarea rows={4} />
          <div>
            <button type="submit" className="btn btn-solid cursor-pointer">
              <Icon name="message" />
              Pošalji preko WhatsApp-a
            </button>
            <p className="mt-4 text-sm text-white/40">Otvara se WhatsApp sa gotovom porukom.</p>
          </div>
        </form>
      </div>
    </section>
  )
}
