import { debounce } from "../debounce"

describe("debounce", () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("runs once with the latest arguments after the wait", () => {
    const fn = jest.fn()
    const debounced = debounce(fn, 100)

    debounced(1)
    jest.advanceTimersByTime(50)
    debounced(2)
    jest.advanceTimersByTime(99)
    expect(fn).not.toHaveBeenCalled()

    jest.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(2)
  })

  it("does not run after cancel", () => {
    const fn = jest.fn()
    const debounced = debounce(fn, 100)

    debounced()
    debounced.cancel()
    jest.advanceTimersByTime(200)

    expect(fn).not.toHaveBeenCalled()
  })

  it("runs immediately on flush, only when pending", () => {
    const fn = jest.fn()
    const debounced = debounce(fn, 100)

    debounced.flush()
    expect(fn).not.toHaveBeenCalled()

    debounced("x")
    debounced.flush()
    expect(fn).toHaveBeenCalledWith("x")

    jest.advanceTimersByTime(200)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
