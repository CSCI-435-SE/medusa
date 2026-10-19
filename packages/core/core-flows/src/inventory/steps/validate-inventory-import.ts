import type {
  IInventoryService,
  IStockLocationService,
} from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { StepResponse, createStep } from "@medusajs/framework/workflows-sdk"
import {
  parseInventoryImportCsv,
  validateInventoryImport,
} from "../helpers/import-inventory-items"

/**
 * The data to validate an inventory import.
 */
export type ValidateInventoryImportStepInput = {
  /**
   * The content of the CSV file to import.
   */
  file_content: string
}

export const validateInventoryImportStepId = "validate-inventory-import"
/**
 * This step parses an inventory import CSV and checks every row. It throws a
 * single error listing each failing row if any row is invalid, otherwise it
 * returns the inventory items to create with their stock levels.
 *
 * A SKU counts as already existing when an inventory item that hasn't been
 * deleted has it. A row's Location must match the name of exactly one stock
 * location.
 */
export const validateInventoryImportStep = createStep(
  validateInventoryImportStepId,
  async (input: ValidateInventoryImportStepInput, { container }) => {
    const rows = parseInventoryImportCsv(input.file_content)
    const skus = [...new Set(rows.map((row) => row.sku).filter(Boolean))]
    const names = [...new Set(rows.map((row) => row.location).filter(Boolean))]

    const inventoryModule = container.resolve<IInventoryService>(
      Modules.INVENTORY
    )
    const stockLocationModule = container.resolve<IStockLocationService>(
      Modules.STOCK_LOCATION
    )

    const [existingItems, locations] = await Promise.all([
      skus.length
        ? inventoryModule.listInventoryItems({ sku: skus }, { select: ["sku"] })
        : [],
      names.length
        ? stockLocationModule.listStockLocations(
            { name: names },
            { select: ["id", "name"] }
          )
        : [],
    ])

    const locationIdsByName: Record<string, string[]> = {}
    for (const location of locations) {
      locationIdsByName[location.name] ??= []
      locationIdsByName[location.name].push(location.id)
    }

    const { items, errors } = validateInventoryImport(
      rows,
      existingItems.map((item) => item.sku!),
      locationIdsByName
    )

    if (errors.length) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, errors.join("\n"))
    }

    return new StepResponse(items)
  }
)
