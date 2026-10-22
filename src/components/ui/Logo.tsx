'use client'

import Link from 'next/link'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  showText?: boolean
  href?: string
}

export default function Logo({ size = 'md', showText = true, href = '/' }: LogoProps) {
  const sizes = {
    sm: { icon: 'w-5 h-5', text: 'text-base' },
    md: { icon: 'w-6 h-6', text: 'text-lg' },
    lg: { icon: 'w-8 h-8', text: 'text-xl' },
  }

  const { icon, text } = sizes[size]

  const logoContent = (
    <div className="flex items-center gap-2 group">
      {/* 4-pointed star logo */}
      <div className={`${icon} relative`}>
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="white">
          {/* Outer star shape */}
          <path d="M50 0
                   Q60 40, 100 50
                   Q60 60, 50 100
                   Q40 60, 0 50
                   Q40 40, 50 0 Z"/>

          {/* Inner curved cuts - top left */}
          <path d="M35 25
                   Q42 35, 38 45
                   Q32 42, 25 38
                   Q30 30, 35 25 Z"
                fill="black"/>

          {/* Inner curved cuts - top right */}
          <path d="M65 25
                   Q70 30, 75 38
                   Q68 42, 62 45
                   Q58 35, 65 25 Z"
                fill="black"/>

          {/* Inner curved cuts - bottom left */}
          <path d="M25 62
                   Q32 58, 38 55
                   Q42 65, 35 75
                   Q30 70, 25 62 Z"
                fill="black"/>

          {/* Inner curved cuts - bottom right */}
          <path d="M62 55
                   Q68 58, 75 62
                   Q70 70, 65 75
                   Q58 65, 62 55 Z"
                fill="black"/>

          {/* Center horizontal cut */}
          <path d="M30 48 Q40 46, 50 48 Q45 50, 40 52 Q35 50, 30 48 Z" fill="black"/>
          <path d="M50 48 Q60 46, 70 48 Q65 50, 60 52 Q55 50, 50 48 Z" fill="black"/>

          {/* Center vertical cut */}
          <path d="M48 30 Q46 40, 48 50 Q50 45, 52 40 Q50 35, 48 30 Z" fill="black"/>
          <path d="M48 50 Q46 60, 48 70 Q50 65, 52 60 Q50 55, 48 50 Z" fill="black"/>
        </svg>
      </div>

      {/* Logo Text */}
      {showText && (
        <span className={`${text} font-semibold tracking-tight bg-gradient-to-r from-white via-zinc-300 to-zinc-500 bg-clip-text text-transparent group-hover:from-white group-hover:to-zinc-400 transition-all duration-300`}>
          timeslot
        </span>
      )}
    </div>
  )

  if (href) {
    return (
      <Link href={href} aria-label={showText ? undefined : 'timeslot'} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500">
        {logoContent}
      </Link>
    )
  }

  return logoContent
}
