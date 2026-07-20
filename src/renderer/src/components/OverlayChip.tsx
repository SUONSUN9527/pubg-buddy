import { useRef, type PointerEvent, type ReactNode } from 'react'
import { api } from '../api'

interface DragState {
  startScreenX: number
  startScreenY: number
  winX: number
  winY: number
  canMove: boolean
  moved: boolean
}

/**
 * 浮窗收起态的小圆徽章:同一个手势自动区分两种意图——
 * 按住移动 ≥4px 即拖动窗口(手动 IPC 移窗,绕开系统拖拽区吞掉点击的问题),
 * 原地按下松开则展开浮窗。
 */
export default function OverlayChip({
  title,
  onExpand,
  badge,
  children
}: {
  title: string
  onExpand: () => void
  badge?: ReactNode
  children: ReactNode
}) {
  const dragRef = useRef<DragState | null>(null)

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const state: DragState = {
      startScreenX: e.screenX,
      startScreenY: e.screenY,
      winX: 0,
      winY: 0,
      canMove: false,
      moved: false
    }
    dragRef.current = state
    void api.overlayWin
      .getPosition()
      .then((pos) => {
        state.winX = pos.x
        state.winY = pos.y
        state.canMove = true
      })
      .catch(() => {})
  }

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.screenX - d.startScreenX
    const dy = e.screenY - d.startScreenY
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
    if (d.moved && d.canMove) void api.overlayWin.setPosition(d.winX + dx, d.winY + dy).catch(() => {})
  }

  const onPointerUp = () => {
    const d = dragRef.current
    dragRef.current = null
    if (d && !d.moved) onExpand()
  }

  return (
    // 固定 36px,与收起后的窗口尺寸严格一致,不依赖父容器高度
    <button
      title={title}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="relative flex h-9 w-9 cursor-grab select-none items-center justify-center rounded-full
        border border-drop/50 bg-panel/80 text-drop backdrop-blur-sm transition-colors
        hover:border-drop hover:bg-panel active:cursor-grabbing"
    >
      {children}
      {badge}
    </button>
  )
}
