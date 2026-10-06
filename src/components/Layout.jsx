import Navbar from './Navbar'
import Footer from './Footer'
import ChatWidget from './ChatWidget'

export default function Layout({ children }) {
  return (
    <div className="relative flex min-h-screen flex-col bg-cream text-ink-900">
      {/* Fixed ambient wash behind everything, so scrolling moves content over
          a lit ground rather than over flat paper. */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-grid-ink bg-grid mask-fade opacity-70" />
        <div className="glow-teal absolute -left-40 -top-40 h-[38rem] w-[38rem]" />
        <div className="glow-clay absolute -right-48 top-1/3 h-[34rem] w-[34rem]" />
      </div>

      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <ChatWidget />
    </div>
  )
}
