import { BUSINESS } from '../config.js'

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-ink px-6 py-8 md:px-16">
      <div className="mx-auto flex max-w-6xl flex-col justify-between gap-2 text-sm text-white/40 md:flex-row">
        <span>
          © {new Date().getFullYear()} {BUSINESS.name}
        </span>
        <span>{BUSINESS.address}</span>
      </div>
    </footer>
  )
}
