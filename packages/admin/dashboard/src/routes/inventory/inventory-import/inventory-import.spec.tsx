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
const { mockToastSuccess, mockHandleSuccess, mockImportInventoryItems } =
  vi.hoisted(() => ({
    mockToastSuccess: vi.fn(),
    mockHandleSuccess: vi.fn(),
    mockImportInventoryItems: vi.fn(),
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

vi.mock("../../../hooks/api/inventory", () => ({
  useImportInventoryItems: () => ({
    mutateAsync: mockImportInventoryItems,
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

import { InventoryImport } from "./inventory-import"

const csvFile = (size?: number) => {
  const file = new File(["Title,SKU\nMug,MUG-1\n"], "inventory.csv", {
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
  URL.createObjectURL = vi.fn(() => "blob:inventory")
})

afterEach(() => {
  cleanup()
})

describe("InventoryImport", () => {
  it("opens as an Import Inventory drawer with an upload area", () => {
    render(<InventoryImport />)

    expect(screen.getByText("Import Inventory")).toBeTruthy()
    expect(document.querySelector('input[type="file"]')).toBeTruthy()
    expect(importButton().hasAttribute("disabled")).toBe(true)
  })

  it("offers a template with every inventory item field", () => {
    render(<InventoryImport />)

    const link = document.querySelector(
      'a[download="inventory-import-template.csv"]'
    )
    expect(link).toBeTruthy()

    const content = decodeURI(link!.getAttribute("href")!)
    expect(content).toContain(
      "Title,SKU,Requires Shipping,Stocked Quantity,Location,Description,Width,Length,Height,Weight,MID Code,HS Code,Country of Origin,Material"
    )
  })

  it("imports the chosen file and closes when it succeeds", async () => {
    mockImportInventoryItems.mockImplementation(async (_body, options) => {
      options.onSuccess({ created: 3 })
    })

    render(<InventoryImport />)
    const file = csvFile()
    chooseFile(file)

    await userEvent.click(importButton())

    expect(mockImportInventoryItems).toHaveBeenCalledWith(
      { file },
      expect.anything()
    )
    expect(mockToastSuccess).toHaveBeenCalledWith("Imported 3 inventory items")
    expect(mockHandleSuccess).toHaveBeenCalled()
  })

  it("lists each failing row when the import is rejected", async () => {
    mockImportInventoryItems.mockImplementation(async (_body, options) => {
      options.onError(
        new Error(
          'Row 2: Title is required\nRow 4: No stock location is named "Attic"'
        )
      )
    })

    render(<InventoryImport />)
    chooseFile(csvFile())

    await userEvent.click(importButton())

    await waitFor(() => {
      const items = screen.getAllByRole("listitem").map((li) => li.textContent)
      expect(items).toEqual([
        "Row 2: Title is required",
        'Row 4: No stock location is named "Attic"',
      ])
    })
    expect(mockHandleSuccess).not.toHaveBeenCalled()
  })

  it("rejects a file over the upload limit", () => {
    render(<InventoryImport />)
    chooseFile(csvFile(2 * 1024 * 1024))

    expect(
      screen.getByText("The file is larger than the 1 MB upload limit")
    ).toBeTruthy()
    expect(importButton().hasAttribute("disabled")).toBe(true)
  })
})
