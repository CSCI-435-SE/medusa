import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/utils"
import FormData from "form-data"
import {
  adminHeaders,
  createAdminUser,
} from "../../../../helpers/create-admin-user"

jest.setTimeout(30000)

const HEADER = "Email,First Name,Last Name,Company,Phone"

const getUploadReq = (...rows: string[]) => {
  const form = new FormData()
  form.append(
    "file",
    Buffer.from([HEADER, ...rows].join("\n")),
    "customers.csv"
  )
  return {
    form,
    meta: {
      headers: {
        ...adminHeaders.headers,
        ...form.getHeaders(),
      },
    },
  }
}

medusaIntegrationTestRunner({
  testSuite: ({ dbConnection, api, getContainer }) => {
    let container

    beforeEach(async () => {
      container = getContainer()
      await createAdminUser(dbConnection, adminHeaders, container)
    })

    const findCustomers = async (email: string) => {
      const response = await api.get(
        `/admin/customers?email=${encodeURIComponent(email)}`,
        adminHeaders
      )
      return response.data.customers
    }

    describe("POST /admin/customers/import", () => {
      it("creates every customer in a valid file", async () => {
        const { form, meta } = getUploadReq(
          "jo@example.com,Jo,Doe,Acme,555-0100",
          "sam@example.com,Sam,,,",
          "ali@example.com,,,,"
        )

        const response = await api.post("/admin/customers/import", form, meta)

        expect(response.status).toEqual(200)
        expect(response.data).toEqual({ created: 3 })

        const [jo] = await findCustomers("jo@example.com")
        expect(jo).toEqual(
          expect.objectContaining({
            email: "jo@example.com",
            first_name: "Jo",
            last_name: "Doe",
            company_name: "Acme",
            phone: "555-0100",
            has_account: false,
          })
        )
        expect(await findCustomers("sam@example.com")).toHaveLength(1)
        expect(await findCustomers("ali@example.com")).toHaveLength(1)
      })

      it("creates no customers when any row is invalid", async () => {
        const { form, meta } = getUploadReq(
          "good@example.com,Good,,,",
          "not-an-email,Bad,,,"
        )

        const error = await api
          .post("/admin/customers/import", form, meta)
          .catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toContain(
          'Row 3: "not-an-email" is not a valid email'
        )
        expect(await findCustomers("good@example.com")).toHaveLength(0)
      })

      it("rejects an email that already belongs to a customer without an account", async () => {
        await api.post(
          "/admin/customers",
          { email: "guest@example.com" },
          adminHeaders
        )

        const { form, meta } = getUploadReq("guest@example.com,,,,")

        const error = await api
          .post("/admin/customers/import", form, meta)
          .catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toContain(
          "Row 2: A customer with the email guest@example.com already exists"
        )
        expect(await findCustomers("guest@example.com")).toHaveLength(1)
      })

      it("allows an email that belongs to a registered customer", async () => {
        const customerModule = container.resolve(Modules.CUSTOMER)
        await customerModule.createCustomers({
          email: "registered@example.com",
          has_account: true,
        })

        const { form, meta } = getUploadReq("registered@example.com,,,,")

        const response = await api.post("/admin/customers/import", form, meta)

        expect(response.status).toEqual(200)
        expect(response.data).toEqual({ created: 1 })

        const customers = await findCustomers("registered@example.com")
        expect(customers.map((c) => c.has_account).sort()).toEqual([
          false,
          true,
        ])
      })
    })
  },
})
