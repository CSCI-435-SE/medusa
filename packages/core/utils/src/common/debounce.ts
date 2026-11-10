/**
 * A debounced version of a function. Calling it (re)starts a timer; the
 * wrapped function only runs once the timer elapses with no newer call.
 */
export type DebouncedFunction<TArgs extends unknown[]> = {
  (...args: TArgs): void
  /** Drop any pending invocation without running it. */
  cancel: () => void
  /** Run any pending invocation immediately instead of waiting. */
  flush: () => void
}

/**
 * Delay invoking `fn` until `waitMs` milliseconds have passed since the last
 * time the debounced function was called.
 *
 * @param fn - The function to debounce.
 * @param waitMs - Quiet period, in milliseconds, required before `fn` runs.
 * @returns A debounced function exposing `cancel` and `flush`.
 *
 * @example
 * const save = debounce((value: string) => persist(value), 300)
 * save("a")
 * save("ab") // only this call runs, 300ms after it was made
 */
export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  waitMs: number
): DebouncedFunction<TArgs> {
  // Handle of the currently scheduled invocation, if any.
  let timer: ReturnType<typeof setTimeout> | undefined
  // Arguments from the most recent call; these are what `fn` receives.
  let lastArgs: TArgs | undefined

  const invoke = () => {
    timer = undefined
    const args = lastArgs as TArgs
    lastArgs = undefined
    fn(...args)
  }

  const debounced = ((...args: TArgs) => {
    lastArgs = args
    // Restart the countdown on every call: this is what makes it a debounce.
    if (timer !== undefined) {
      clearTimeout(timer)
    }
    timer = setTimeout(invoke, waitMs)
  }) as DebouncedFunction<TArgs>

  debounced.cancel = () => {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
    timer = undefined
    lastArgs = undefined
  }

  debounced.flush = () => {
    // Nothing pending means nothing to flush.
    if (timer === undefined) {
      return
    }
    clearTimeout(timer)
    invoke()
  }

  return debounced
}
