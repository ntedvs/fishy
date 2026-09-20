"use client"

import dynamic from "next/dynamic"
import Link from "next/link"

const Matrix = dynamic(() => import("~/components/matrix"), { ssr: false })

const focusRing =
  "focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-burgundy/30"

export default function FishyApp() {
  return (
    <main className="relative min-h-[calc(100vh-70px)] overflow-hidden bg-canvas">
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 w-[68%] [mask-image:linear-gradient(to_right,transparent_0%,black_32%,black_100%)] max-md:inset-x-0 max-md:top-[44%] max-md:h-[56%] max-md:w-full max-md:[mask-image:linear-gradient(to_bottom,transparent_0%,black_35%,black_100%)]"
      >
        <Matrix
          bgColor="#F5F1F2"
          cellSize={12}
          colors={["#4F222C14", "#4F222C52", "#4F222CA6", "#4F222C"]}
          frequency={3}
          gamma={7}
          paletteBias={0}
          speed={7}
        />
      </div>

      <section className="relative z-2 mx-auto flex min-h-[calc(100vh-70px)] w-[min(1320px,calc(100%-64px))] items-center py-20 max-sm:min-h-[calc(100vh-62px)] max-sm:w-[calc(100%-32px)] max-sm:items-start max-sm:pt-20">
        <div className="relative z-2 max-w-[680px]">
          <h1 className="m-0 text-[clamp(58px,7.4vw,108px)] leading-[0.88] font-medium tracking-[-0.07em] text-burgundy">
            Find what doesn’t add up.
          </h1>
          <p className="mt-8 max-w-[540px] text-lg leading-[1.55] text-burgundy/70 max-sm:max-w-[360px] max-sm:text-base">
            Review transactions, invoices, and supporting documents. Fishy surfaces the records that
            deserve a human look.
          </p>
          <Link
            className={`mt-8 inline-flex min-h-12 items-center rounded-lg border border-burgundy bg-burgundy px-6 text-[15px] font-semibold text-white ${focusRing}`}
            href="/analyze"
          >
            Start an analysis
          </Link>
        </div>
      </section>
    </main>
  )
}
