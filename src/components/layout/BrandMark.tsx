import { useId } from 'react'

/**
 * Altech POS mark — a white "A" crossed by an amber scanner beam on the brand
 * gradient. The desktop shortcut icon (public/altech-pos.svg → .ico) uses the
 * very same drawing.
 */
export const BrandMark = ({ size = 40, className = '' }: { size?: number; className?: string }) => {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`bg-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1C3FE0" />
          <stop offset="0.55" stopColor="#2F5BFF" />
          <stop offset="1" stopColor="#00B8D9" />
        </linearGradient>
        <linearGradient id={`hl-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.28" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="240" height="240" rx="58" fill={`url(#bg-${id})`} />
      <rect x="8" y="8" width="240" height="240" rx="58" fill={`url(#hl-${id})`} />
      <polyline
        points="72,198 128,62 184,198"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="30"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="50" y1="152" x2="206" y2="152" stroke="#F5A524" strokeOpacity="0.35" strokeWidth="26" strokeLinecap="round" />
      <line x1="50" y1="152" x2="206" y2="152" stroke="#FFC24D" strokeWidth="13" strokeLinecap="round" />
    </svg>
  )
}
