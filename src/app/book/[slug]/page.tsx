'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { format, addDays, startOfDay, isSameDay, parseISO } from 'date-fns'
import BookingForm, { type BookingDetails } from '@/components/booking/BookingForm'
import Logo from '@/components/ui/Logo'
import DynamicBackground from '@/components/ui/DynamicBackground'

interface Slot { start: string; end: string; available: boolean }
interface Day { date: string; slots: Slot[] }

// a run of seven days from today, paged by seven; every open half hour of
// the picked day as a button; the form for the one you pick
const DAYS = 7
const key = (d: Date) => format(d, 'yyyy-MM-dd')

function zoneLabel(tz: string): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(new Date()).find(p => p.type === 'timeZoneName')
    return part ? part.value : tz
  } catch {
    return tz
  }
}

export default function BookBySlugPage() {
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string

  const [owner, setOwner] = useState<{ name: string } | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [from, setFrom] = useState(() => startOfDay(new Date()))
  const [days, setDays] = useState<Day[] | null>(null)
  const [failed, setFailed] = useState(0)
  const [picked, setPicked] = useState('')
  const [slot, setSlot] = useState<Slot | null>(null)
  const [duration, setDuration] = useState(30)
  const [error, setError] = useState('')

  const today = useMemo(() => startOfDay(new Date()), [])
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const strip = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(from, i)), [from])

  useEffect(() => {
    let live = true
    fetch(`/api/booking-slug/lookup?slug=${encodeURIComponent(slug)}`)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then(d => { if (live) setOwner({ name: d.name || 'Meeting' }) })
      .catch(() => { if (live) setNotFound(true) })
    return () => { live = false }
  }, [slug])

  useEffect(() => {
    if (!owner) return
    let live = true
    setDays(null)
    fetch(`/api/availability?slug=${encodeURIComponent(slug)}&date=${key(from)}&days=${DAYS}`)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then(d => {
        if (!live) return
        setDays(d.days || [])
        if (d.slotDuration) setDuration(d.slotDuration)
      })
      .catch(() => { if (live) { setDays([]); setFailed(f => f + 1) } })
    return () => { live = false }
  }, [owner, slug, from, failed])

  const open = useCallback((k: string): Slot[] => {
    const day = days?.find(d => d.date === k)
    return day ? day.slots.filter(s => s.available) : []
  }, [days])

  // the picked day keeps while it has times; otherwise the first day that does
  useEffect(() => {
    if (!days) return
    if (picked && strip.some(d => key(d) === picked) && open(picked).length) return
    const first = strip.find(d => open(key(d)).length)
    setPicked(first ? key(first) : '')
  }, [days, strip, picked, open])

  const submit = async (data: BookingDetails) => {
    if (!slot) return
    setError('')
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: data.guestName,
          guestEmail: data.guestEmail,
          message: data.message || undefined,
          startTime: slot.start,
          endTime: slot.end,
          timezone: tz,
          slug
        })
      })
      if (!response.ok) {
        setError(response.status === 409 ? 'time taken' : 'failed')
        return
      }
      const result = await response.json()
      router.push(`/confirmation?id=${result.bookingId}`)
    } catch {
      setError('failed')
    }
  }

  const page = (children: React.ReactNode) => (
    <div className="min-h-screen text-zinc-100">
      <DynamicBackground />
      <main className="relative z-10 mx-auto w-full max-w-2xl px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(12px,env(safe-area-inset-top))]">
        <header className="flex items-center gap-3 py-2">
          <Logo showText={false} href="/" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold leading-tight text-white">
              {notFound ? 'not found' : owner ? `book with ${owner.name}` : ' '}
            </h1>
            {!notFound && (
              <p className="text-sm text-zinc-400 tabular-nums">{duration} min · {zoneLabel(tz)}</p>
            )}
          </div>
        </header>
        {children}
      </main>
    </div>
  )

  if (notFound) return page(null)

  if (slot) {
    return page(
      <BookingForm
        start={slot.start}
        end={slot.end}
        zone={zoneLabel(tz)}
        error={error}
        onSubmit={submit}
        onBack={() => { setSlot(null); setError('') }}
      />
    )
  }

  const loading = days === null
  const times = picked ? open(picked) : []

  return page(
    <>
      <nav aria-label="days" className="mt-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label="earlier"
            disabled={from <= today}
            onClick={() => setFrom(d => { const back = addDays(d, -DAYS); return back < today ? today : back })}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h2 className="text-sm font-medium text-zinc-300 tabular-nums">
            {format(strip[0], 'MMM d')} – {format(strip[DAYS - 1], 'MMM d')}
          </h2>
          <button
            type="button"
            aria-label="later"
            onClick={() => setFrom(d => addDays(d, DAYS))}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1.5 sm:gap-2">
          {strip.map(d => {
            const k = key(d)
            const n = open(k).length
            const selected = k === picked
            const dead = !loading && n === 0
            return (
              <button
                key={k}
                type="button"
                aria-pressed={selected}
                aria-label={format(d, 'EEEE, MMMM d')}
                disabled={dead}
                onClick={() => setPicked(k)}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                  selected
                    ? 'border-transparent bg-gradient-to-b from-violet-600 to-fuchsia-700 text-white shadow-lg shadow-violet-500/25'
                    : dead
                      ? 'border-zinc-800/60 text-zinc-500'
                      : 'border-zinc-800 bg-zinc-900/60 text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800/80'
                }`}
              >
                <span className={`text-[11px] font-semibold uppercase tracking-wider ${selected ? 'text-violet-100' : dead ? 'text-zinc-500' : 'text-zinc-400'}`}>{format(d, 'EEE')}</span>
                <span className={`text-lg font-semibold leading-none tabular-nums ${!selected && !dead && isSameDay(d, today) ? 'text-violet-300' : ''}`}>{format(d, 'd')}</span>
                <span className={`h-1.5 w-1.5 rounded-full ${selected ? 'bg-white' : n ? 'bg-violet-400' : 'bg-transparent'}`} />
              </button>
            )
          })}
        </div>
      </nav>

      <section aria-label="times" className="mt-5">
        <h2 className="text-sm font-medium text-zinc-300">
          {picked ? format(parseISO(picked), 'EEEE, MMMM d') : ' '}
        </h2>
        {loading ? (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5" aria-busy="true">
            {Array.from({ length: 10 }, (_, i) => <div key={i} className="h-12 rounded-xl bg-zinc-800/50 motion-safe:animate-pulse" />)}
          </div>
        ) : failed && !days?.length ? (
          <button
            type="button"
            onClick={() => setFailed(f => f + 1)}
            className="mt-3 h-12 rounded-xl border border-zinc-700 px-5 text-sm font-medium text-zinc-200 hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            retry
          </button>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {times.map(s => (
              <button
                key={s.start}
                type="button"
                onClick={() => setSlot(s)}
                className="h-12 rounded-xl border border-zinc-800 bg-zinc-900/70 text-sm font-medium text-white tabular-nums transition-all hover:border-violet-500 hover:bg-violet-600/15 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              >
                {format(parseISO(s.start), 'h:mm a')}
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
