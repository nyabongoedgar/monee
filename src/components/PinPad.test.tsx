// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { PinPad } from "./PinPad"

describe("PinPad", () => {
  afterEach(cleanup)

  it("reports the PIN once four digits are entered", async () => {
    const onComplete = vi.fn()
    render(<PinPad onComplete={onComplete} />)
    for (const d of ["1", "2", "3", "4"])
      fireEvent.click(screen.getByRole("button", { name: d }))
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith("1234"))
  })

  it("does not report twice and supports delete", async () => {
    const onComplete = vi.fn()
    render(<PinPad onComplete={onComplete} />)
    for (const d of ["9", "9", "9", "9", "9"])
      fireEvent.click(screen.getByRole("button", { name: d }))
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    expect(onComplete).toHaveBeenCalledWith("9999")
  })

  it("deletes a digit before completing", async () => {
    const onComplete = vi.fn()
    render(<PinPad onComplete={onComplete} />)
    for (const d of ["1", "2"])
      fireEvent.click(screen.getByRole("button", { name: d }))
    fireEvent.click(screen.getByRole("button", { name: "Delete digit" }))
    for (const d of ["3", "4", "5"])
      fireEvent.click(screen.getByRole("button", { name: d }))
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith("1345"))
  })
})
