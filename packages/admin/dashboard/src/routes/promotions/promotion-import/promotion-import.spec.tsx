// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// FileUpload reads __MAX_UPLOAD_FILE_SIZE__ and the SDK client reads the other
// globals at module load. Vite's `define` supplies them in the app, but nothing
// does in the test environment.
vi.hoisted(() => {
  const g = global as any
  g.__BACKEND_URL__ = "http://localhost:9000"
  g.__AUTH_TYPE__ = "session"
  g.__JWT_TOKEN_STORAGE_KEY__ = ""
  g.__MAX_UPLOAD_FILE_SIZE__ = 1024 * 1024
})

vi.mock("@medusajs/icons", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return Object.fromEntries(
    Object.keys(actual).map((name) => [
      name,
      () => <div data-testid={`icon-${name}`} />,
    ])
  )
})

// vi.mock factories are hoisted above the rest of the file, so the mocks they
// use have to be hoisted too.
const { mockToastSuccess, mockHandleSuccess, mockImportPromotions } =
  vi.hoisted(() => ({
    mockToastSuccess: vi.fn(),
    mockHandleSuccess: vi.fn(),
    mockImportPromotions: vi.fn(),
  }))

vi.mock("@medusajs/ui", async () => {
  const actual = await vi.importActual<typeof import("@medusajs/ui")>(
    "@medusajs/ui"
  )
  return {
    ...actual,
    toast: { success: mockToastSuccess, error: vi.fn() },
  }
})

vi.mock("../../../hooks/api/promotions", () => ({
  useImportPromotions: () => ({
    mutateAsync: mockImportPromotions,
    isPending: false,
  }),
}))

// The real RouteDrawer needs the router and modal providers. A plain stand-in
// keeps the test on what the drawer renders.
vi.mock("../../../components/modals", () => {
  const Part = ({ children }: { children?: ReactNode }) => <div>{children}</div>
  const RouteDrawer = Object.assign(Part, {
    Header: Part,
    Title: Part,
    Description: Part,
    Body: Part,
    Footer: Part,
    Close: Part,
  })
  return {
    RouteDrawer,
    useRouteModal: () => ({ handleSuccess: mockHandleSuccess }),
  }
})

vi.mock("react-i18next", async () => {
  const en = (await import("../../../i18n/translations/en.json")).default
  return {
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) => {
        const value = key
          .split(".")
          .reduce<any>((node, part) => node?.[part], en)

        if (typeof value !== "string") {
          return key
        }

        return value.replace(/{{(\w+)}}/g, (_, name) =>
          String(options?.[name] ?? "")
        )
      },
    }),
  }
})

import { PromotionImport } from "./promotion-import"

const csvFile = (size?: number) => {
  const file = new File(["Code,Type\nSAVE10,standard\n"], "promotions.csv", {
    type: "text/csv",
  })
  if (size) {
    Object.defineProperty(file, "size", { value: size })
  }
  return file
}

const chooseFile = (file: File) => {
  const input = document.querySelector('input[type="file"]')!
  fireEvent.change(input, { target: { files: [file] } })
}

const importButton = () => screen.getByRole("button", { name: "Import" })

beforeEach(() => {
  vi.clearAllMocks()
  URL.createObjectURL = vi.fn(() => "blob:promotions")
})

afterEach(() => {
  cleanup()
})

describe("PromotionImport", () => {
  it("opens as an Import Promotions drawer with an upload area", () => {
    render(<PromotionImport />)

    expect(screen.getByText("Import Promotions")).toBeTruthy()
    expect(document.querySelector('input[type="file"]')).toBeTruthy()
    expect(importButton().hasAttribute("disabled")).toBe(true)
  })

  it("offers a template with every promotion field", () => {
    render(<PromotionImport />)

    const link = document.querySelector(
      'a[download="promotion-import-template.csv"]'
    )
    expect(link).toBeTruthy()

    const content = decodeURI(link!.getAttribute("href")!)
    expect(content).toContain(
      "Code,Type,Status,Automatic,Tax Inclusive,Usage Limit,Campaign ID,Discount Type,Discount Value,Currency Code,Target,Allocation,Max Quantity,Buy Min Quantity,Apply To Quantity,Rules,Target Rules,Buy Rules"
    )
  })

  it("imports the chosen file and closes when it succeeds", async () => {
    mockImportPromotions.mockImplementation(async (_body, options) => {
      options.onSuccess({ created: 3 })
    })

    render(<PromotionImport />)
    const file = csvFile()
    chooseFile(file)

    await userEvent.click(importButton())

    expect(mockImportPromotions).toHaveBeenCalledWith(
      { file },
      expect.anything()
    )
    expect(mockToastSuccess).toHaveBeenCalledWith("Imported 3 promotions")
    expect(mockHandleSuccess).toHaveBeenCalled()
  })

  it("lists each failing row when the import is rejected", async () => {
    mockImportPromotions.mockImplementation(async (_body, options) => {
      options.onError(
        new Error(
          'Row 2: Code is required\nRow 4: No campaign has the ID "camp_missing"'
        )
      )
    })

    render(<PromotionImport />)
    chooseFile(csvFile())

    await userEvent.click(importButton())

    await waitFor(() => {
      const items = screen.getAllByRole("listitem").map((li) => li.textContent)
      expect(items).toEqual([
        "Row 2: Code is required",
        'Row 4: No campaign has the ID "camp_missing"',
      ])
    })
    expect(mockHandleSuccess).not.toHaveBeenCalled()
  })

  it("rejects a file over the upload limit", () => {
    render(<PromotionImport />)
    chooseFile(csvFile(2 * 1024 * 1024))

    expect(
      screen.getByText("The file is larger than the 1 MB upload limit")
    ).toBeTruthy()
    expect(importButton().hasAttribute("disabled")).toBe(true)
  })
})
