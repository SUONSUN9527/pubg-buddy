import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

/**
 * 浮窗通用控制:收起成小图标 / 固定(鼠标穿透防误触)。
 *
 * 固定的实现:整窗开启 setIgnoreMouseEvents(forward 模式),点击全部穿透到游戏;
 * 页面持续监听 mousemove,当悬停在固定按钮上时临时解除穿透,让"取消固定"可以被点到。
 */
export function useOverlayControls() {
  const [collapsed, setCollapsed] = useState(false)
  const [locked, setLocked] = useState(false)
  const pinRef = useRef<HTMLButtonElement>(null)
  const overPinRef = useRef(false)

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    void api.overlayWin.setCollapsed(next).catch(() => {})
  }

  const toggleLocked = () => setLocked((v) => !v)

  useEffect(() => {
    if (!locked) {
      void api.overlayWin.setIgnoreMouse(false).catch(() => {})
      return
    }
    void api.overlayWin.setIgnoreMouse(true).catch(() => {})
    const onMove = (e: MouseEvent) => {
      const over = pinRef.current?.contains(e.target as Node) ?? false
      if (over !== overPinRef.current) {
        overPinRef.current = over
        void api.overlayWin.setIgnoreMouse(!over).catch(() => {})
      }
    }
    document.addEventListener('mousemove', onMove)
    return () => {
      document.removeEventListener('mousemove', onMove)
      overPinRef.current = false
      void api.overlayWin.setIgnoreMouse(false).catch(() => {})
    }
  }, [locked])

  return { collapsed, locked, toggleCollapsed, toggleLocked, pinRef }
}
