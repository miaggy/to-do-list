import { useEffect, useState } from "react"

interface KeyboardViewport {
  /** Espaço ocupado pelo teclado virtual na parte de baixo da tela (px). */
  inset: number
  /** Altura realmente visível (px), já descontado o teclado. */
  height: number | null
}

/**
 * Acompanha o visualViewport para saber quanto o teclado virtual cobre.
 * Só ativo quando `active` é true (evita listeners à toa).
 */
export function useKeyboardViewport(active: boolean): KeyboardViewport {
  const [state, setState] = useState<KeyboardViewport>({
    inset: 0,
    height: null,
  })

  useEffect(() => {
    const vv = window.visualViewport
    if (!active || !vv) return

    function update() {
      if (!vv) return
      const inset = Math.max(
        0,
        Math.round(window.innerHeight - vv.height - vv.offsetTop)
      )
      setState((prev) =>
        prev.inset === inset && prev.height === vv.height
          ? prev
          : { inset, height: vv.height }
      )
      // Mantém o campo focado visível acima do teclado
      const el = document.activeElement
      if (inset > 0 && el instanceof HTMLElement && el.matches("input, textarea")) {
        requestAnimationFrame(() => el.scrollIntoView({ block: "nearest" }))
      }
    }

    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)
    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
      setState({ inset: 0, height: null })
    }
  }, [active])

  return state
}
