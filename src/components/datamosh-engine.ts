const PALETTE = [
  "#4f222c",
  "#843e4d",
  "#b76c7c",
  "#dcb2bb",
] as const

const COLUMNS = 11
const COLUMN_POWER = 1.65
const TILES = 15
const CYCLE_SECONDS = 0.2
const COLUMN_STAGGER = 0.006
const STRETCH = 8.5
const SPRING_STRENGTH = 1.6
const BLEED = 0.012
const COLUMN_PHASE = -0.4
const REVEAL_DURATION = 1
const REVEAL_DELAYS = [0.02, 0.18, 0.06, 0.28, 0, 0.14, 0.04, 0.24, 0.09, 0.32, 0.12]
const SPRING_NORMALIZER = 1 - Math.exp(-SPRING_STRENGTH)

function springStep(progress: number) {
  const half = (value: number) => (1 - Math.exp(-SPRING_STRENGTH * value)) / SPRING_NORMALIZER

  return progress < 0.5 ? 0.5 * half(2 * progress) : 1 - 0.5 * half(2 * (1 - progress))
}

function mulberry32(seed: number) {
  let value = seed >>> 0

  return () => {
    value |= 0
    value = (value + 0x6d2b79f5) | 0
    let next = Math.imul(value ^ (value >>> 15), 1 | value)
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

function pickDifferent(from: number, avoid: number[]) {
  for (let offset = 1; offset <= PALETTE.length; offset++) {
    const candidate = (from + offset) % PALETTE.length
    if (!avoid.includes(candidate)) return candidate
  }

  return from
}

export class DatamoshEngine {
  readonly ok: boolean = false

  private canvas: HTMLCanvasElement
  private context!: CanvasRenderingContext2D
  private resizeObserver: ResizeObserver | null = null
  private width = 0
  private height = 0
  private frame = 0
  private running = false
  private lastTime = 0
  private elapsed = 0
  private revealElapsed = 0
  private revealing = false
  private edges: number[] = []
  private strip: number[] = []

  constructor(
    private host: HTMLElement,
    seed = 1,
  ) {
    this.canvas = document.createElement("canvas")
    this.canvas.className = "block size-full"
    this.canvas.setAttribute("aria-hidden", "true")
    this.host.appendChild(this.canvas)

    const context = this.canvas.getContext("2d", { alpha: true })
    if (!context) return

    this.context = context
    this.context.imageSmoothingEnabled = false
    this.ok = true
    this.buildColors(seed)
    this.measure()

    this.resizeObserver = new ResizeObserver(() => {
      this.measure()
      if (!this.running) this.draw()
    })
    this.resizeObserver.observe(this.host)
  }

  private buildColors(seed: number) {
    const random = mulberry32(seed)
    const length = 61

    for (let index = 0; index < length; index++) {
      let next = Math.floor(random() * PALETTE.length)

      if (index > 0 && next === this.strip[index - 1]) {
        next = pickDifferent(next, [this.strip[index - 1]])
      }
      this.strip.push(next)
    }

    if (this.strip[length - 1] === this.strip[0]) {
      this.strip[length - 1] = pickDifferent(this.strip[length - 1], [
        this.strip[length - 2],
        this.strip[0],
      ])
    }
  }

  private measure() {
    const bounds = this.host.getBoundingClientRect()
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1)
    this.width = Math.max(1, Math.round(bounds.width * pixelRatio))
    this.height = Math.max(1, Math.round(bounds.height * pixelRatio))
    this.canvas.width = this.width
    this.canvas.height = this.height
    this.context.imageSmoothingEnabled = false
    this.edges = Array.from({ length: COLUMNS + 1 }, (_, index) =>
      Math.round(this.width * Math.pow(index / COLUMNS, COLUMN_POWER)),
    )
  }

  private tileEdge(position: number) {
    const progress = position / TILES
    if (progress < 0) return progress * 0.05
    if (progress > 1) return 1 + (progress - 1) * 0.05

    const start = Math.pow(progress, STRETCH)
    return start / (start + Math.pow(1 - progress, STRETCH))
  }

  private draw() {
    const bleed = Math.round(BLEED * this.height)
    this.context.clearRect(0, 0, this.width, this.height)

    for (let column = 0; column < COLUMNS; column++) {
      const left = this.edges[column]
      const width = this.edges[column + 1] - left
      if (width <= 0) continue

      const delayedTime = this.elapsed - (COLUMNS - 1 - column) * COLUMN_STAGGER
      const raw = delayedTime <= 0 ? 0 : delayedTime / CYCLE_SECONDS
      const linear = raw + column * COLUMN_PHASE
      const step = Math.floor(linear)
      const flow = step + springStep(linear - step)
      const base = -Math.floor(flow)
      const revealProgress = this.revealing
        ? Math.min(1, Math.max(0, (this.revealElapsed - REVEAL_DELAYS[column]) / REVEAL_DURATION))
        : 0
      const revealTop = Math.round((1 - Math.pow(1 - revealProgress, 3)) * this.height)

      for (let tile = TILES + 2; tile >= -2; tile--) {
        const identity = base + tile
        const position = identity + flow
        const top = Math.round(this.tileEdge(position) * this.height)
        const bottom = Math.round(this.tileEdge(position + 1) * this.height) + bleed
        if (bottom <= top || bottom <= 0 || top >= this.height) continue

        const y = Math.max(revealTop, top)
        const tileHeight = Math.min(this.height, bottom) - y
        if (tileHeight <= 0) continue

        const colorIndex = identity - column
        const stripIndex =
          ((colorIndex % this.strip.length) + this.strip.length) % this.strip.length
        this.context.fillStyle = PALETTE[this.strip[stripIndex]]
        this.context.fillRect(left, y, width, tileHeight)
      }
    }
  }

  private tick = (time: number) => {
    if (!this.running) return

    const delta = this.lastTime ? Math.min(0.05, (time - this.lastTime) / 1000) : 0
    this.lastTime = time
    this.elapsed += delta
    if (this.revealing) this.revealElapsed += delta
    this.draw()
    this.frame = requestAnimationFrame(this.tick)
  }

  start() {
    if (this.running || !this.ok) return
    this.running = true
    this.lastTime = 0
    this.frame = requestAnimationFrame(this.tick)
  }

  reveal() {
    this.revealing = true
    this.revealElapsed = 0
  }

  stop() {
    this.running = false
    if (this.frame) cancelAnimationFrame(this.frame)
    this.frame = 0
  }

  renderStill() {
    if (!this.ok) return
    this.elapsed = CYCLE_SECONDS * 0.45 + COLUMNS * COLUMN_STAGGER
    this.draw()
  }

  destroy() {
    this.stop()
    this.resizeObserver?.disconnect()
    this.canvas.remove()
  }
}
