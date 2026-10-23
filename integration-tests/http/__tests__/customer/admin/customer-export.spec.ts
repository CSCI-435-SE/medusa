import { IEventBusModuleService } from "@medusajs/types"
import { CommonEvents, Modules } from "@medusajs/utils"
import {
  TestEventUtils,
  medusaIntegrationTestRunner,
} from "@medusajs/test-utils"
import fs from "fs/promises"
import { csv2json } from "json-2-csv"
import os from "os"
import path from "path"
import {
  adminHeaders,
  createAdminUser,
} from "../../../../helpers/create-admin-user"

jest.setTimeout(50000)

const getCSVRows = async (filePath: string) => {
  const asLocalPath = filePath.replace("http://localhost:9000", os.tmpdir())
  const fileContent = await fs.readFile(asLocalPath, { encoding: "utf-8" })
  await fs.rm(path.dirname(asLocalPath), { recursive: true, force: true })
  return csv2json(fileContent) as Record<string, unknown>[]
}

medusaIntegrationTestRunner({
  testSuite: ({ dbConnection, api, getContainer }) => {
    let eventBus: IEventBusModuleService

    beforeEach(async () => {
      const container = getContainer()
      eventBus = container.resolve(Modules.EVENT_BUS)
      await createAdminUser(dbConnection, adminHeaders, container)

      await api.post(
        "/admin/customers",
        {
          email: "jo@example.com",
          first_name: "Jo",
          last_name: "Doe",
          company_name: "Acme",
          phone: "555-0100",
        },
        adminHeaders
      )
      await api.post(
        "/admin/customers",
        { email: "sam@example.com", first_name: "Sam" },
        adminHeaders
      )
    })

    const exportCustomers = async (query = "") => {
      const notificationCreated = TestEventUtils.waitSubscribersExecution(
        `${Modules.NOTIFICATION}.notification.${CommonEvents.CREATED}`,
        eventBus
      )

      const response = await api.post(
        `/admin/customers/export${query}`,
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
          title: "Customer export",
          description: "Customer export completed successfully!",
          file: expect.objectContaining({
            url: expect.stringContaining("-customer-exports.csv"),
            mimeType: "text/csv",
          }),
        })
      )

      return getCSVRows(notifications[0].data.file.url)
    }

    describe("POST /admin/customers/export", () => {
      it("exports every customer with the import columns first", async () => {
        const rows = await exportCustomers()

        expect(rows).toHaveLength(2)
        expect(Object.keys(rows[0]).slice(0, 5)).toEqual([
          "Email",
          "First Name",
          "Last Name",
          "Company",
          "Phone",
        ])
        expect(rows).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              Email: "jo@example.com",
              "First Name": "Jo",
              "Last Name": "Doe",
              Company: "Acme",
              Phone: "555-0100",
            }),
            expect.objectContaining({
              Email: "sam@example.com",
              "First Name": "Sam",
            }),
          ])
        )
      })

      it("exports only the customers matching the filters", async () => {
        const rows = await exportCustomers("?q=sam")

        expect(rows).toHaveLength(1)
        expect(rows[0]).toEqual(
          expect.objectContaining({ Email: "sam@example.com" })
        )
      })

      it("ignores pagination and exports every matching customer", async () => {
        const rows = await exportCustomers("?limit=1&offset=1")

        expect(rows).toHaveLength(2)
      })
    })
  },
})
