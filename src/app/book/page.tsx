'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { format, addDays, startOfWeek, addWeeks, subWeeks, isSameDay, parseISO, differenceInMinutes, startOfDay } from 'date-fns'
import BookingForm from '@/components/booking/BookingForm'
import Logo from '@/components/ui/Logo'
import DynamicBackground from '@/components/ui/DynamicBackground'
import { Suspense } from 'react'

interface TimeSlot {
  start: string
  end: string
  available: boolean
}

interface DaySlots {
  date: string
  slots: TimeSlot[]
}

interface MergedBlock {
  start: string
  end: string
  available: boolean
}

// Merge overlapping/adjacent busy blocks only
function mergeBusyBlocks(slots: TimeSlot[]): MergedBlock[] {
  // Only get busy slots
  const busySlots = slots.filter(s => !s.available)
  if (busySlots.length === 0) return []

  // Merge busy slots into continuous blocks
  const sortedBusy = [...busySlots].sort((a, b) =>
    new Date(a.start).getTime() - new Date(b.start).getTime()
  )

  const mergedBusy: MergedBlock[] = []
  let currentBlock = { ...sortedBusy[0], available: false }

  for (let i = 1; i < sortedBusy.length; i++) {
    const slot = sortedBusy[i]
    const currentEnd = new Date(currentBlock.end).getTime()
    const slotStart = new Date(slot.start).getTime()

    // If slots overlap or are adjacent (within 1 minute), merge them
    if (slotStart <= currentEnd + 60000) {
      const slotEnd = new Date(slot.end).getTime()
      if (slotEnd > currentEnd) {
        currentBlock.end = slot.end
      }
    } else {
      mergedBusy.push(currentBlock)
      currentBlock = { ...slot, available: false }
    }
  }
  mergedBusy.push(currentBlock)

  return mergedBusy
}

// Check if a time range overlaps with any busy block
function isTimeRangeAvailable(startTime: Date, endTime: Date, busyBlocks: MergedBlock[]): boolean {
  for (const block of busyBlocks) {
    const blockStart = new Date(block.start).getTime()
    const blockEnd = new Date(block.end).getTime()
    const selStart = startTime.getTime()
    const selEnd = endTime.getTime()

    // Check for any overlap
    if (selStart < blockEnd && selEnd > blockStart) {
      return false
    }
  }
  return true
}

function BookPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialDate = searchParams.get('date')

  const [currentWeek, setCurrentWeek] = useState(() => {
    if (initialDate) {
      return startOfWeek(parseISO(initialDate), { weekStartsOn: 0 })
    }
    return startOfWeek(new Date(), { weekStartsOn: 0 })
  })
  const [weekSlots, setWeekSlots] = useState<DaySlots[]>([])
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; slot: TimeSlot } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  // Drag selection state
  const [isDragging, setIsDragging] = useState(false)
  const [dragStartY, setDragStartY] = useState(0)
  const [dragCurrentY, setDragCurrentY] = useState(0)
  const [dragDayIndex, setDragDayIndex] = useState<number | null>(null)
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [pendingBooking, setPendingBooking] = useState<{ date: string; startTime: Date; endTime: Date } | null>(null)
  const columnRefs = useRef<(HTMLDivElement | null)[]>([])

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeek, i))
  const hours = Array.from({ length: 16 }, (_, i) => i + 8) // 8 AM to midnight
  const HOUR_HEIGHT = 50 // pixels per hour

  // Fetch availability for the week
  useEffect(() => {
    const fetchWeekAvailability = async () => {
      setLoading(true)
      setError(null)

      try {
        const results = await Promise.all(
          weekDays.map(async (day) => {
            const dateStr = format(day, 'yyyy-MM-dd')
            try {
              const response = await fetch(`/api/availability?date=${dateStr}`)
              if (response.ok) {
                const data = await response.json()
                return { date: dateStr, slots: data.slots || [] }
              }
            } catch (e) {
              console.error('Failed to fetch', dateStr)
            }
            return { date: dateStr, slots: [] }
          })
        )
        setWeekSlots(results)
      } catch (err) {
        setError('Unable to load availability')
      } finally {
        setLoading(false)
      }
    }

    fetchWeekAvailability()
  }, [currentWeek])

  const handleSlotClick = (date: string, slot: TimeSlot) => {
    if (!slot.available) return
    setSelectedSlot({ date, slot })
    setShowForm(true)
  }

  const handleBack = () => {
    setShowForm(false)
    setSelectedSlot(null)
    setShowBookingModal(false)
    setPendingBooking(null)
  }

  // Convert Y position to time
  const yToTime = useCallback((y: number, columnEl: HTMLElement) => {
    const rect = columnEl.getBoundingClientRect()
    const scrollTop = columnEl.closest('.calendar-scroll')?.scrollTop || 0
    const relativeY = y - rect.top + scrollTop
    const totalMinutes = (relativeY / HOUR_HEIGHT) * 60
    const hour = Math.floor(totalMinutes / 60) + 8 // Start at 8 AM
    const minute = Math.round((totalMinutes % 60) / 15) * 15 // Round to 15 min
    return {
      hour: Math.min(Math.max(hour, 8), 20),
      minute: minute >= 60 ? 0 : minute
    }
  }, [])

  // Handle drag start
  const handleDragStart = useCallback((dayIndex: number, e: React.MouseEvent) => {
    const day = weekDays[dayIndex]
    if (day < startOfDay(new Date())) return // Can't book in past

    e.preventDefault()
    const column = columnRefs.current[dayIndex]
    if (!column) return

    const rect = column.getBoundingClientRect()
    const y = e.clientY - rect.top

    setIsDragging(true)
    setDragDayIndex(dayIndex)
    setDragStartY(y)
    setDragCurrentY(y)
  }, [weekDays])

  // Handle drag move
  const handleDragMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || dragDayIndex === null) return

    const column = columnRefs.current[dragDayIndex]
    if (!column) return

    const rect = column.getBoundingClientRect()
    const y = Math.max(0, Math.min(e.clientY - rect.top, hours.length * HOUR_HEIGHT))
    setDragCurrentY(y)
  }, [isDragging, dragDayIndex, hours.length])

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    if (!isDragging || dragDayIndex === null) {
      setIsDragging(false)
      return
    }

    const column = columnRefs.current[dragDayIndex]
    if (!column) {
      setIsDragging(false)
      return
    }

    // Calculate time range
    const minY = Math.min(dragStartY, dragCurrentY)
    const maxY = Math.max(dragStartY, dragCurrentY)

    const startMinutes = (minY / HOUR_HEIGHT) * 60
    const endMinutes = (maxY / HOUR_HEIGHT) * 60

    const startHour = Math.floor(startMinutes / 60) + 8
    const startMinute = Math.round((startMinutes % 60) / 15) * 15
    const endHour = Math.floor(endMinutes / 60) + 8
    const endMinute = Math.round((endMinutes % 60) / 15) * 15

    const day = weekDays[dragDayIndex]
    const dateStr = format(day, 'yyyy-MM-dd')

    const startTime = new Date(day)
    startTime.setHours(startHour, startMinute >= 60 ? 0 : startMinute, 0, 0)
    if (startMinute >= 60) startTime.setHours(startHour + 1)

    const endTime = new Date(day)
    const finalEndMinute = endMinute + 30
    endTime.setHours(endHour + Math.floor(finalEndMinute / 60), finalEndMinute % 60, 0, 0)

    // Ensure minimum 30 min slot
    if (endTime.getTime() - startTime.getTime() < 30 * 60 * 1000) {
      endTime.setTime(startTime.getTime() + 30 * 60 * 1000)
    }

    // Clamp times to valid range (8 AM - midnight)
    const dayStart = new Date(day)
    dayStart.setHours(8, 0, 0, 0)
    const dayEnd = new Date(day)
    dayEnd.setHours(24, 0, 0, 0)

    if (startTime < dayStart) startTime.setTime(dayStart.getTime())
    if (endTime > dayEnd) endTime.setTime(dayEnd.getTime())

    // Check if time is available (doesn't overlap with busy blocks)
    const daySlots = weekSlots.find(d => d.date === dateStr)
    const busyBlocks = mergeBusyBlocks(daySlots?.slots || [])
    const isAvailable = isTimeRangeAvailable(startTime, endTime, busyBlocks)

    if (isAvailable && endTime > startTime) {
      setPendingBooking({ date: dateStr, startTime, endTime })
      setShowBookingModal(true)
    }

    setIsDragging(false)
    setDragDayIndex(null)
  }, [isDragging, dragDayIndex, dragStartY, dragCurrentY, weekDays, weekSlots])

  // Confirm booking from modal
  const handleConfirmBooking = () => {
    if (!pendingBooking) return

    setSelectedSlot({
      date: pendingBooking.date,
      slot: {
        start: pendingBooking.startTime.toISOString(),
        end: pendingBooking.endTime.toISOString(),
        available: true
      }
    })
    setShowBookingModal(false)
    setShowForm(true)
  }

  // Get drag selection style
  const getDragSelectionStyle = useCallback((dayIndex: number) => {
    if (!isDragging || dragDayIndex !== dayIndex) return null

    const minY = Math.min(dragStartY, dragCurrentY)
    const maxY = Math.max(dragStartY, dragCurrentY)
    const height = Math.max(maxY - minY, 25)

    return { top: `${minY}px`, height: `${height}px` }
  }, [isDragging, dragDayIndex, dragStartY, dragCurrentY])

  const handleSubmit = async (data: { guestName: string; guestEmail: string; message: string }) => {
    if (!selectedSlot) return

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: data.guestName,
          guestEmail: data.guestEmail,
          message: data.message,
          startTime: selectedSlot.slot.start,
          endTime: selectedSlot.slot.end,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create booking')
      }

      const result = await response.json()
      router.push(`/confirmation?id=${result.bookingId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create booking')
    }
  }

  // Get slot style for positioning in the grid
  const getSlotStyle = (slot: TimeSlot) => {
    const start = parseISO(slot.start)
    const end = parseISO(slot.end)
    const dayStart = new Date(start)
    dayStart.setHours(8, 0, 0, 0) // 8 AM start

    const startMinutes = differenceInMinutes(start, dayStart)
    const durationMinutes = differenceInMinutes(end, start)

    const top = Math.max(0, (startMinutes / 60) * 50) // 50px per hour
    const height = (durationMinutes / 60) * 50

    return { top: `${top}px`, height: `${height}px` }
  }

  // Check if slot is within visible hours (8 AM - midnight)
  const isSlotVisible = (slot: TimeSlot) => {
    const start = parseISO(slot.start)
    const hour = start.getHours()
    return hour >= 8 && hour < 24
  }

  if (showForm && selectedSlot) {
    return (
      <div className="min-h-screen relative py-8 px-4">
        <DynamicBackground />
        <div className="max-w-md mx-auto">
          <BookingForm
            start={selectedSlot.slot.start}
            end={selectedSlot.slot.end}
            zone={Intl.DateTimeFormat().resolvedOptions().timeZone}
            error={error || undefined}
            onSubmit={handleSubmit}
            onBack={handleBack}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-zinc-100 relative">
      <DynamicBackground />
      {/* Header */}
      <header className="bg-zinc-950/80 backdrop-blur-md sticky top-0 z-20 border-b border-zinc-800/50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Logo showText={false} href={undefined} />
              <div>
                <h1 className="text-xl font-bold text-white">book a meeting</h1>
                <p className="text-sm text-zinc-400">select an available time slot</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentWeek(startOfWeek(new Date(), { weekStartsOn: 0 }))}
                className="px-4 py-1.5 text-sm font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                Today
              </button>
              <button
                onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
                className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-sm font-medium text-zinc-300 min-w-[180px] text-center">
                {format(currentWeek, 'MMM d')} - {format(addDays(currentWeek, 6), 'MMM d, yyyy')}
              </span>
              <button
                onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
                className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Legend */}
      <div className="bg-zinc-900/50 backdrop-blur-sm border-b border-zinc-800/50 px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-dashed border-violet-400 rounded" />
            <span className="text-zinc-300">Drag to book</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-zinc-700 rounded" />
            <span className="text-zinc-500">Busy</span>
          </div>
        </div>
      </div>

      {/* Booking Confirmation Modal */}
      {showBookingModal && pendingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowBookingModal(false)} />
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Confirm Booking</h3>
            <p className="text-zinc-400 text-sm mb-4">
              You selected:
            </p>
            <div className="bg-zinc-800/50 rounded-lg p-4 mb-6">
              <div className="text-white font-semibold">
                {format(pendingBooking.startTime, 'EEEE, MMMM d')}
              </div>
              <div className="text-violet-400 text-lg font-bold">
                {format(pendingBooking.startTime, 'h:mm a')} - {format(pendingBooking.endTime, 'h:mm a')}
              </div>
              <div className="text-zinc-500 text-sm mt-1">
                {Math.round((pendingBooking.endTime.getTime() - pendingBooking.startTime.getTime()) / 60000)} minutes
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBookingModal(false)}
                className="flex-1 px-4 py-2 text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBooking}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-medium rounded-lg hover:from-violet-500 hover:to-fuchsia-500 transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="max-w-7xl mx-auto px-4 mt-4">
          <div className="p-4 bg-red-900/30 border border-red-800/50 rounded-xl text-red-400 text-sm flex items-center gap-2">
            <span>⚠</span> {error}
          </div>
        </div>
      )}

      {/* Calendar Grid */}
      <div className="max-w-7xl mx-auto px-2 pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-10 w-10 border-4 border-zinc-700 border-t-violet-500 rounded-full" />
          </div>
        ) : (
          <div className="bg-zinc-900/80 backdrop-blur-sm rounded-xl border border-zinc-800/50 mt-4 flex flex-col" style={{ height: 'calc(100vh - 200px)' }}>
            {/* Day Headers */}
            <div className="grid grid-cols-8 border-b border-zinc-800 flex-shrink-0">
              <div className="w-16 border-r border-zinc-800" />
              {weekDays.map((day, i) => {
                const isToday = isSameDay(day, new Date())
                return (
                  <div
                    key={i}
                    className={`py-3 text-center border-r border-zinc-800 ${isToday ? 'bg-violet-900/20' : ''}`}
                  >
                    <div className="text-xs text-zinc-500 uppercase font-semibold tracking-wider">
                      {format(day, 'EEE')}
                    </div>
                    <div className={`text-2xl font-bold ${isToday ? 'text-violet-400' : 'text-zinc-400'}`}>
                      {format(day, 'd')}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Time Grid */}
            <div
              className="grid grid-cols-8 overflow-y-auto calendar-grid calendar-scroll select-none flex-1"
              onMouseUp={handleDragEnd}
              onMouseLeave={handleDragEnd}
              onMouseMove={handleDragMove}
            >
              {/* Time Labels */}
              <div className="border-r border-zinc-800">
                {hours.map(hour => (
                  <div key={hour} className="h-[50px] border-b border-zinc-800/50 relative">
                    <span className="absolute -top-2.5 right-2 text-xs text-zinc-600 font-medium">
                      {format(new Date().setHours(hour, 0, 0, 0), 'h a')}
                    </span>
                  </div>
                ))}
              </div>

              {/* Day Columns */}
              {weekDays.map((day, dayIndex) => {
                const dateStr = format(day, 'yyyy-MM-dd')
                const dayData = weekSlots.find(d => d.date === dateStr)
                const slots = dayData?.slots || []
                const busyBlocks = mergeBusyBlocks(slots)
                const isToday = isSameDay(day, new Date())
                const isPast = day < startOfDay(new Date())
                const dragStyle = getDragSelectionStyle(dayIndex)

                return (
                  <div
                    key={dayIndex}
                    ref={el => { columnRefs.current[dayIndex] = el }}
                    className={`border-r border-zinc-800 relative ${isToday ? 'bg-violet-900/10' : ''} ${isPast ? 'bg-zinc-900/50 cursor-not-allowed' : 'cursor-crosshair'}`}
                    onMouseDown={(e) => !isPast && handleDragStart(dayIndex, e)}
                  >
                    {/* Hour lines */}
                    {hours.map(hour => (
                      <div key={hour} className="h-[50px] border-b border-zinc-800/50" />
                    ))}

                    {/* Drag selection overlay */}
                    {dragStyle && (
                      <div
                        className="absolute left-0.5 right-0.5 bg-gradient-to-r from-violet-500/50 to-fuchsia-500/50 border-2 border-violet-400 rounded-lg pointer-events-none z-20 backdrop-blur-sm"
                        style={dragStyle}
                      >
                        <div className="absolute inset-0 flex items-center justify-center text-xs text-white font-semibold drop-shadow-lg">
                          {(() => {
                            const minY = Math.min(dragStartY, dragCurrentY)
                            const maxY = Math.max(dragStartY, dragCurrentY)
                            const startMins = (minY / HOUR_HEIGHT) * 60
                            const endMins = (maxY / HOUR_HEIGHT) * 60
                            const startH = Math.floor(startMins / 60) + 8
                            const startM = Math.round((startMins % 60) / 15) * 15
                            const endH = Math.floor(endMins / 60) + 8
                            const endM = Math.round((endMins % 60) / 15) * 15 + 30
                            return `${startH}:${String(startM % 60).padStart(2, '0')} - ${endH}:${String(endM % 60).padStart(2, '0')}`
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Busy Time Blocks (only showing blocked/busy times) */}
                    {busyBlocks.filter(isSlotVisible).map((slot, i) => {
                      const style = getSlotStyle(slot)
                      const start = parseISO(slot.start)
                      const end = parseISO(slot.end)

                      return (
                        <div
                          key={i}
                          style={style}
                          className="absolute left-0.5 right-0.5 rounded px-1.5 py-1 text-xs overflow-hidden bg-zinc-800/90 text-zinc-500 pointer-events-none border border-zinc-700/50"
                          title="Busy"
                        >
                          <div className="font-medium truncate">Busy</div>
                          <div className="truncate opacity-70 text-[10px]">
                            {format(start, 'h:mm a')} - {format(end, 'h:mm a')}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}

export default function BookPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="animate-spin h-10 w-10 border-4 border-zinc-700 border-t-violet-500 rounded-full" />
      </div>
    }>
      <BookPageContent />
    </Suspense>
  )
}
