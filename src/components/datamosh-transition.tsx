"use client"

import { useEffect, useRef } from "react"

import { DatamoshEngine } from "~/components/datamosh-engine"

export default function DatamoshTransition({ revealing }: { revealing: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<DatamoshEngine | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const engine = new DatamoshEngine(host, 47)
    engineRef.current = engine
    const previousOverflow = document.body.style.overflow

    document.body.style.overflow = "hidden"
    if (reducedMotion) engine.renderStill()
    else engine.start()

    const handleVisibility = () => {
      if (reducedMotion) return
      if (document.hidden) engine.stop()
      else engine.start()
    }
    document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("visibilitychange", handleVisibility)
      engine.destroy()
      engineRef.current = null
    }
  }, [])

  useEffect(() => {
    if (revealing) engineRef.current?.reveal()
  }, [revealing])

  return (
    <div
      aria-hidden="true"
      className="datamosh-curtain fixed inset-0 z-50 overflow-hidden bg-burgundy"
      data-state={revealing ? "revealing" : "covered"}
      ref={hostRef}
    />
  )
}
