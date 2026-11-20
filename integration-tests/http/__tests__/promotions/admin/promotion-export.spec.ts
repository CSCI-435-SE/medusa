import { IEventBusModuleService } from "@medusajs/types"
import {
  TestEventUtils,
  medusaIntegrationTestRunner,
} from "@medusajs/test-utils"
import { CommonEvents, Modules } from "@medusajs/utils"
import fs from "fs/promises"
import { csv2json } from "json-2-csv"
import os from "os"
import path from "path"
import {
  adminHeaders,
  createAdminUser,
} from "../../../../helpers/create-admin-user"

jest.setTimeout(50000)

// The import template's header, written out from AC3 of #97 rather than read
// from the code, so a column that moves or is renamed fails this test.
const HEADER = [
  "Code",
  "Type",
  "Status",
  "Automatic",
  "Tax Inclusive",
  "Usage Limit",
  "Campaign ID",
  "Discount Type",
  "Discount Value",
  "Currency Code",
  "Target",
  "Allocation",
  "Max Quantity",
  "Buy Min Quantity",
  "Apply To Quantity",
  "Rules",
  "Target Rules",
  "Buy Rules",
]

// csv2json coerces "false" to a boolean and "10" to a number, so the parsed
// rows can't show how a value was written. The raw text is kept alongside them
// for the assertions about the file's own formatting.
const readCSV = async (filePath: string) => {
  const asLocalPath = filePath.replace("http://localhost:9000", os.tmpdir())
  const text = await fs.readFile(asLocalPath, { encoding: "utf-8" })
  await fs.rm(path.dirname(asLocalPath), { recursive: true, force: true })
  return { text, rows: csv2json(text) as Record<string, unknown>[] }
}

const lineFor = (text: string, code: string) =>
  text.split("\n").find((line) => line.startsWith(`${code},`))

medusaIntegrationTestRunner({
  testSuite: ({ dbConnection, api, getContainer }) => {
    let eventBus: IEventBusModuleService

    beforeEach(async () => {
      const container = getContainer()
      eventBus = container.resolve(Modules.EVENT_BUS)
      await createAdminUser(dbConnection, adminHeaders, container)

      await api.post(
        "/admin/promotions",
        {
          code: "SAVE10",
          type: "standard",
          status: "active",
          is_automatic: false,
          application_method: {
            type: "percentage",
            target_type: "items",
            allocation: "across",
            value: 10,
          },
          rules: [
            { attribute: "currency_code", operator: "eq", values: ["usd"] },
          ],
        },
        adminHeaders
      )

      await api.post(
        "/admin/promotions",
        {
          code: "BUY2GET1",
          type: "buyget",
          status: "draft",
          application_method: {
            type: "percentage",
            target_type: "items",
            allocation: "each",
            value: 100,
            max_quantity: 1,
            buy_rules_min_quantity: 2,
            apply_to_quantity: 1,
            target_rules: [
              { attribute: "product_id", operator: "in", values: ["prod_1"] },
            ],
            buy_rules: [
              { attribute: "product_id", operator: "eq", values: ["prod_2"] },
            ],
          },
        },
        adminHeaders
      )
    })

    const exportPromotions = async (query = "") => {
      const notificationCreated = TestEventUtils.waitSubscribersExecution(
        `${Modules.NOTIFICATION}.notification.${CommonEvents.CREATED}`,
        eventBus
      )

      const response = await api.post(
        `/admin/promotions/export${query}`,
        {},
        adminHeaders
      )

      expect(response.status).toEqual(202)
      expect(response.data.transaction_id).toBeTruthy()

      await notificationCreated
      const notifications = (
        await api.get("/admin/notifications", adminHeaders)
      ).data.notifications

      expect(notifications).toHaveLength(1)
      expect(notifications[0].data).toEqual(
        expect.objectContaining({
          title: "Promotion export",
          description: "Promotion export completed successfully!",
          file: expect.objectContaining({
            url: expect.stringContaining("-promotion-exports.csv"),
            mimeType: "text/csv",
          }),
        })
      )

      return readCSV(notifications[0].data.file.url)
    }

    describe("POST /admin/promotions/export", () => {
      it("exports every promotion using the import template's columns", async () => {
        const { text, rows } = await exportPromotions()

        expect(rows).toHaveLength(2)
        expect(text.split("\n")[0]).toEqual(HEADER.join(","))
        expect(Object.keys(rows[0])).toEqual(HEADER)
      })

      it("writes each promotion as one row in the import's format", async () => {
        const { text } = await exportPromotions()

        // Both rows are written out from AC3's column order and AC4 and AC5's
        // formatting rules, not from what the exporter produced.
        expect(lineFor(text, "SAVE10")).toEqual(
          "SAVE10,standard,active,false,false,,,percentage,10,,items,across,,,,currency_code:eq:usd,,"
        )
        expect(lineFor(text, "BUY2GET1")).toEqual(
          "BUY2GET1,buyget,draft,false,false,,,percentage,100,,items,each,1,2,1,,product_id:in:prod_1,product_id:eq:prod_2"
        )
      })

      it("exports only the promotions matching the search", async () => {
        const { rows } = await exportPromotions("?q=SAVE10")

        expect(rows).toHaveLength(1)
        expect(rows[0]).toEqual(expect.objectContaining({ Code: "SAVE10" }))
      })

      it("ignores pagination and exports every matching promotion", async () => {
        const { rows } = await exportPromotions("?limit=1&offset=1")

        expect(rows).toHaveLength(2)
      })

      it("writes a file with only the header when nothing matches", async () => {
        const { text, rows } = await exportPromotions("?q=NOTHING_MATCHES_THIS")

        expect(rows).toHaveLength(0)
        expect(text).toEqual(HEADER.join(","))
      })
    })
  },
})
