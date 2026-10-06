import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Home' },
  { to: '/upload', label: 'Check Skin' },
  { to: '/diseases', label: 'Disease Library' },
  { to: '/about', label: 'About' },
]

export default function Navbar() {
  // The bar sits flush with the hero at rest and gains a border + shadow once
  // the page scrolls under it, so it never floats as a disconnected slab.
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-ink-900/10 bg-cream/85 shadow-[0_1px_20px_-8px_rgba(13,35,33,0.35)] backdrop-blur-md'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <NavLink to="/" className="group flex items-center gap-3">
          <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 via-brand-600 to-ink-900 text-white shadow-lift ring-1 ring-inset ring-white/25">
            <span className="absolute inset-0 rounded-xl bg-gradient-to-tr from-transparent via-white/25 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="relative h-5 w-5"
            >
              <path d="M12 2C8 6 4 10.5 4 15a8 8 0 0 0 16 0c0-4.5-4-9-8-13z" />
            </svg>
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-xl font-bold tracking-tight text-ink-900">DermaScan</span>
            <span className="eyebrow mt-1 text-[0.6rem] text-clay-600">Skin intelligence</span>
          </span>
        </NavLink>

        <div className="flex items-center gap-1">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `relative rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                  isActive ? 'text-ink-900' : 'text-ink-700/70 hover:text-ink-900'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative z-10">{link.label}</span>
                  {/* Underline marker rather than a filled pill — quieter, and it
                      lets the serif do the talking. */}
                  <span
                    className={`absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-gradient-to-r from-brand-500 to-clay-500 transition-all duration-300 ${
                      isActive ? 'opacity-100' : 'scale-x-0 opacity-0'
                    }`}
                  />
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </header>
  )
}
