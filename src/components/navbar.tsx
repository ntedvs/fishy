import Link from "next/link"

const focusRing =
  "focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-burgundy/30"

export default function Navbar() {
  return (
    <header className="relative z-10 flex h-[70px] items-center justify-between border-b border-burgundy/12 bg-canvas/90 px-8 max-sm:h-[62px] max-sm:px-4">
      <Link
        className={`text-[19px] font-semibold tracking-[-0.03em] text-burgundy ${focusRing}`}
        href="/"
      >
        <span>Fishy</span>
      </Link>
      <Link
        className={`rounded-lg border border-burgundy bg-burgundy px-4 py-2 text-sm font-semibold text-white ${focusRing}`}
        href="/analyze"
      >
        Analyze records
      </Link>
    </header>
  )
}
