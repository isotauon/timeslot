'use client'

import { useEffect, useRef } from 'react'

// nebula and stars on one canvas. the picture is a function of the clock, so
// it plays the same at any frame rate; under reduced motion it is drawn once
export default function DynamicBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let animationId = 0
    let stars: Array<{ x: number; y: number; size: number; twinkleSpeed: number; twinkleOffset: number }> = []

    const initStars = () => {
      stars = []
      const count = Math.floor((canvas.width * canvas.height) / 8000)
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random(),
          y: Math.random(),
          size: Math.random() * 1.5 + 0.5,
          twinkleSpeed: Math.random() * 2 + 1,
          twinkleOffset: Math.random() * Math.PI * 2
        })
      }
    }

    const drawNebula = (x: number, y: number, radius: number, color: string, intensity: number) => {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
      gradient.addColorStop(0, color.replace(')', `, ${intensity})`).replace('rgb', 'rgba'))
      gradient.addColorStop(0.4, color.replace(')', `, ${intensity * 0.5})`).replace('rgb', 'rgba'))
      gradient.addColorStop(0.7, color.replace(')', `, ${intensity * 0.2})`).replace('rgb', 'rgba'))
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')

      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fillStyle = gradient
      ctx.fill()
    }

    const draw = (time: number) => {
      const w = canvas.width, h = canvas.height
      ctx.fillStyle = '#09090b'
      ctx.fillRect(0, 0, w, h)

      const nebulaIntensity = 0.08
      drawNebula(w * 0.3 + Math.sin(time * 0.3) * 50, h * 0.4 + Math.cos(time * 0.2) * 30, w * 0.4, 'rgb(88, 28, 135)', nebulaIntensity + Math.sin(time * 0.5) * 0.02)
      drawNebula(w * 0.7 + Math.cos(time * 0.25) * 40, h * 0.6 + Math.sin(time * 0.35) * 40, w * 0.35, 'rgb(30, 58, 138)', nebulaIntensity + Math.cos(time * 0.4) * 0.02)
      drawNebula(w * 0.5 + Math.sin(time * 0.4) * 60, h * 0.3 + Math.cos(time * 0.3) * 50, w * 0.3, 'rgb(112, 26, 117)', nebulaIntensity * 0.7 + Math.sin(time * 0.6) * 0.015)
      drawNebula(w * 0.2 + Math.cos(time * 0.2) * 30, h * 0.7 + Math.sin(time * 0.25) * 35, w * 0.25, 'rgb(19, 78, 74)', nebulaIntensity * 0.5)

      for (const star of stars) {
        const twinkle = reduced ? 0.5 : Math.sin(time * star.twinkleSpeed + star.twinkleOffset) * 0.5 + 0.5
        const opacity = 0.3 + twinkle * 0.7
        const x = star.x * w, y = star.y * h

        ctx.beginPath()
        ctx.arc(x, y, star.size * (0.8 + twinkle * 0.4), 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`
        ctx.fill()

        if (star.size > 1) {
          const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, star.size * 4)
          glowGradient.addColorStop(0, `rgba(200, 200, 255, ${opacity * 0.3})`)
          glowGradient.addColorStop(1, 'rgba(200, 200, 255, 0)')
          ctx.beginPath()
          ctx.arc(x, y, star.size * 4, 0, Math.PI * 2)
          ctx.fillStyle = glowGradient
          ctx.fill()
        }
      }
    }

    // the old loop stepped time by 0.005 a frame; this reads the clock at the same pace
    const seconds = () => performance.now() / 1000 * 0.3
    const animate = () => {
      draw(seconds())
      animationId = requestAnimationFrame(animate)
    }
    const start = () => { if (!reduced && !animationId) animationId = requestAnimationFrame(animate) }
    const stop = () => { cancelAnimationFrame(animationId); animationId = 0 }

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      if (!stars.length) initStars()
      draw(seconds())
    }
    const onVisibility = () => { if (document.hidden) stop(); else start() }

    resize()
    start()
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stop()
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-zinc-950" />
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-violet-950/10 to-transparent" />
      <div className="absolute bottom-0 left-0 w-full h-1/3 bg-gradient-to-t from-zinc-950 to-transparent" />
      <div className="absolute inset-0 bg-radial-dark" />
    </div>
  )
}
