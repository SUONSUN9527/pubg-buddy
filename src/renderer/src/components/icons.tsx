/** 浮窗统一线条图标(stroke 风格,继承 currentColor) */
import type { SVGProps } from 'react'

const base = (size: number, props: SVGProps<SVGSVGElement>) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props
})

/** 图钉(透明描边);filled 时实心用于"已固定"态 */
export function PinIcon({ size = 13, filled = false, ...props }: { size?: number; filled?: boolean } & SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(size, props)} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z" />
    </svg>
  )
}

export function MinusIcon({ size = 13, ...props }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(size, props)}>
      <path d="M5 12h14" />
    </svg>
  )
}

export function CloseIcon({ size = 13, ...props }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(size, props)}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

/** 收起态小图标:地图 */
export function MapIcon({ size = 20, ...props }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(size, props)}>
      <path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" />
      <path d="M15 5.764v15" />
      <path d="M9 3.236v15" />
    </svg>
  )
}

/** 收起态小图标:队伍 */
export function TeamsIcon({ size = 20, ...props }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(size, props)}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
