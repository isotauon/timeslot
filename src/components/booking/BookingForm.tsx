'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

export interface BookingDetails {
  guestName: string
  guestEmail: string
  message: string
}

interface BookingFormProps {
  start: string
  end: string
  zone: string
  error?: string
  onSubmit: (data: BookingDetails) => Promise<void>
  onBack: () => void
}

export default function BookingForm({ start, end, zone, error, onSubmit, onBack }: BookingFormProps) {
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ guestName?: string; guestEmail?: string }>({})
  const s = parseISO(start), e = parseISO(end)

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const next: typeof errors = {}
    if (!guestName.trim()) next.guestName = 'required'
    if (!guestEmail.trim()) next.guestEmail = 'required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) next.guestEmail = 'invalid email'
    setErrors(next)
    if (Object.keys(next).length) return
    setLoading(true)
    try {
      await onSubmit({ guestName: guestName.trim(), guestEmail: guestEmail.trim(), message: message.trim() })
    } finally {
      setLoading(false)
    }
  }

  return (
    <section aria-label="booking" className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 backdrop-blur-sm sm:p-6">
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 inline-flex h-11 items-center gap-1 rounded-lg px-2 text-sm text-zinc-300 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        back
      </button>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-sm">
        <dt className="text-zinc-400">day</dt>
        <dd className="text-white">{format(s, 'EEEE, MMMM d')}</dd>
        <dt className="text-zinc-400">time</dt>
        <dd className="text-white tabular-nums">{format(s, 'h:mm a')} – {format(e, 'h:mm a')}</dd>
        <dt className="text-zinc-400">zone</dt>
        <dd className="text-white">{zone}</dd>
      </dl>

      <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
        <Input label="name" id="guest-name" value={guestName} onChange={ev => setGuestName(ev.target.value)} error={errors.guestName} autoComplete="name" required />
        <Input label="email" id="guest-email" type="email" inputMode="email" value={guestEmail} onChange={ev => setGuestEmail(ev.target.value)} error={errors.guestEmail} autoComplete="email" required />
        <div className="space-y-1">
          <label htmlFor="guest-note" className="block text-sm font-medium text-zinc-300">note</label>
          <textarea
            id="guest-note"
            value={message}
            onChange={ev => setMessage(ev.target.value)}
            maxLength={1000}
            rows={3}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-base text-white transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <Button type="submit" loading={loading} size="lg" className="h-12 w-full">book</Button>
      </form>
    </section>
  )
}
