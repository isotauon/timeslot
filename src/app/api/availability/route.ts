import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { startOfDay, addDays, format } from 'date-fns'
import { getAllGoogleAccounts, getValidAccessTokenForAccount } from '@/lib/google/accounts'
import { getFreeBusy } from '@/lib/google/calendar'
import { generateSlots } from '@/lib/utils/slots'
import { sql } from '@/lib/db'

// Prevent caching
export const dynamic = 'force-dynamic'

// Helper to get email from session cookie
async function getSessionEmail(): Promise<string | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('session')?.value

  if (!sessionCookie) return null

  try {
    const session = JSON.parse(Buffer.from(sessionCookie, 'base64').toString())
    if (session.exp < Date.now()) return null
    return session.email || null
  } catch {
    return null
  }
}

const MAX_DAYS = 14

// GET /api/availability?date=YYYY-MM-DD[&days=N][&slug=…]
// One day by default; `days` asks for a run of days in one answer, so a
// week costs one freebusy call and one bookings query instead of seven.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const dateParam = searchParams.get('date')
  const slug = searchParams.get('slug')
  const days = Math.min(MAX_DAYS, Math.max(1, parseInt(searchParams.get('days') || '1', 10) || 1))

  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json({ error: 'Date parameter required' }, { status: 400 })
  }

  try {
    const first = startOfDay(new Date(dateParam + 'T00:00:00'))
    const last = addDays(first, days)

    // Get Google accounts - either for specific slug owner or logged-in user's accounts
    let accounts: Awaited<ReturnType<typeof getAllGoogleAccounts>> = []
    let ownerEmail: string | null = null

    try {
      if (slug) {
        const rows = await sql`
          SELECT owner_email FROM google_accounts WHERE booking_slug = ${slug} LIMIT 1
        `
        const slugOwner = rows[0]
        if (slugOwner?.owner_email) {
          ownerEmail = slugOwner.owner_email
          accounts = await getAllGoogleAccounts(ownerEmail || undefined)
        }
      } else {
        const sessionEmail = await getSessionEmail()
        if (sessionEmail) {
          ownerEmail = sessionEmail
          accounts = await getAllGoogleAccounts(sessionEmail)
        }
      }
    } catch (error) {
      console.log('Could not fetch google_accounts:', error)
    }

    // Get owner settings for schedule configuration
    let settings
    if (ownerEmail) {
      const rows = await sql`
        SELECT * FROM owner_settings WHERE email = ${ownerEmail} LIMIT 1
      `
      settings = rows[0]
    }

    // Fall back to default settings if none found
    if (!settings) {
      settings = {
        weekly_schedule: {
          monday: [{ start: '09:00', end: '17:00' }],
          tuesday: [{ start: '09:00', end: '17:00' }],
          wednesday: [{ start: '09:00', end: '17:00' }],
          thursday: [{ start: '09:00', end: '17:00' }],
          friday: [{ start: '09:00', end: '17:00' }],
          saturday: [],
          sunday: []
        },
        timezone: 'America/New_York',
        slot_duration_minutes: 30,
        buffer_minutes: 0,
        min_notice_hours: 24,
        booking_window_days: 30
      }
    }

    // Existing bookings across the run, a day wide on each side so a slot
    // near midnight in the owner's zone still meets its booking
    const bookings = await sql`
      SELECT * FROM bookings
      WHERE start_time >= ${addDays(first, -1).toISOString()}
        AND start_time < ${addDays(last, 1).toISOString()}
        AND status = 'confirmed'
    `

    // Busy times from every connected calendar, one freebusy call per account
    let allBusyTimes: { start: string; end: string }[] = []
    for (const account of accounts) {
      const accessToken = await getValidAccessTokenForAccount(account)
      if (!accessToken) continue
      const rawCalendarIds = account.calendar_ids as string[] | null | undefined
      const calendarIds = rawCalendarIds && rawCalendarIds.length > 0 ? rawCalendarIds : ['primary']
      try {
        const busyTimes = await getFreeBusy(accessToken, calendarIds, addDays(first, -1), addDays(last, 1))
        allBusyTimes = allBusyTimes.concat(busyTimes)
      } catch (error) {
        console.error(`Failed to fetch calendar for ${account.email}:`, error)
      }
    }

    const run = Array.from({ length: days }, (_, i) => {
      const date = format(addDays(first, i), 'yyyy-MM-dd')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const slots = generateSlots(date, settings as any, allBusyTimes, (bookings || []) as any)
      return {
        date,
        slots: slots.map(slot => ({
          start: slot.start.toISOString(),
          end: slot.end.toISOString(),
          available: slot.available,
          busy: slot.busy
        }))
      }
    })

    return NextResponse.json({
      timezone: settings.timezone,
      slotDuration: settings.slot_duration_minutes,
      connectedAccounts: accounts.map(a => a.email),
      days: run,
      // the one-day shape, for callers that ask for one day
      date: run[0].date,
      slots: run[0].slots
    })
  } catch (error) {
    console.error('Availability error:', error)
    return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500 })
  }
}
