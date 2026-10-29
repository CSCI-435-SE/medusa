import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import FormData from "form-data"
import {
  adminHeaders,
  createAdminUser,
} from "../../../../helpers/create-admin-user"

jest.setTimeout(30000)

const HEADER =
  "Code,Type,Status,Automatic,Tax Inclusive,Usage Limit,Campaign ID,Discount Type,Discount Value,Currency Code,Target,Allocation,Max Quantity,Buy Min Quantity,Apply To Quantity,Rules,Target Rules,Buy Rules"

const getUploadReq = (...rows: string[]) => {
  const form = new FormData()
  form.append(
    "file",
    Buffer.from([HEADER, ...rows].join("\n")),
    "promotions.csv"
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
    let campaign

    beforeEach(async () => {
      await createAdminUser(dbConnection, adminHeaders, getContainer())

      campaign = (
        await api.post(
          `/admin/campaigns`,
          { name: "Summer", campaign_identifier: "summer" },
          adminHeaders
        )
      ).data.campaign
    })

    const findPromotions = async (code: string) => {
      const response = await api.get(
        `/admin/promotions?code=${encodeURIComponent(
          code
        )}&fields=*rules,*application_method,*application_method.target_rules,*application_method.buy_rules`,
        adminHeaders
      )
      return response.data.promotions
    }

    describe("POST /admin/promotions/import", () => {
      it("creates every promotion in a valid file with its rules", async () => {
        const { form, meta } = getUploadReq(
          `SAVE5,standard,active,false,true,10,${campaign.id},fixed,5,usd,order,,,,,currency_code:eq:usd,,`,
          "SAVE10,standard,,true,,,,percentage,10,,items,across,,,,,,",
          "BUY2GET1,buyget,draft,,,,,percentage,100,,items,each,1,2,1,,product_id:in:prod_1|prod_2,product_id:eq:prod_3"
        )

        const response = await api.post("/admin/promotions/import", form, meta)

        expect(response.status).toEqual(200)
        expect(response.data).toEqual({ created: 3 })

        const [save5] = await findPromotions("SAVE5")
        expect(save5).toEqual(
          expect.objectContaining({
            code: "SAVE5",
            type: "standard",
            status: "active",
            is_automatic: false,
            is_tax_inclusive: true,
            limit: 10,
            campaign_id: campaign.id,
            rules: [
              expect.objectContaining({
                attribute: "currency_code",
                operator: "eq",
                values: [expect.objectContaining({ value: "usd" })],
              }),
            ],
            application_method: expect.objectContaining({
              type: "fixed",
              value: 5,
              currency_code: "usd",
              target_type: "order",
            }),
          })
        )

        const [save10] = await findPromotions("SAVE10")
        expect(save10).toEqual(
          expect.objectContaining({
            status: "draft",
            is_automatic: true,
            application_method: expect.objectContaining({
              type: "percentage",
              value: 10,
              target_type: "items",
              allocation: "across",
            }),
          })
        )

        const [buyget] = await findPromotions("BUY2GET1")
        expect(buyget.type).toEqual("buyget")
        expect(buyget.application_method).toEqual(
          expect.objectContaining({
            max_quantity: 1,
            buy_rules_min_quantity: 2,
            apply_to_quantity: 1,
            target_rules: [
              expect.objectContaining({
                attribute: "product_id",
                operator: "in",
                values: expect.arrayContaining([
                  expect.objectContaining({ value: "prod_1" }),
                  expect.objectContaining({ value: "prod_2" }),
                ]),
              }),
            ],
            buy_rules: [
              expect.objectContaining({
                attribute: "product_id",
                operator: "eq",
                values: [expect.objectContaining({ value: "prod_3" })],
              }),
            ],
          })
        )
      })

      it("creates no promotions when any row is invalid", async () => {
        const { form, meta } = getUploadReq(
          "SAVE10,standard,,,,,,percentage,10,,items,across,,,,,,",
          "SAVE20,standard,,,,,camp_missing,percentage,20,,items,across,,,,,,"
        )

        const error = await api
          .post("/admin/promotions/import", form, meta)
          .catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toContain(
          'Row 3: No campaign has the ID "camp_missing"'
        )
        expect(await findPromotions("SAVE10")).toHaveLength(0)
        expect(await findPromotions("SAVE20")).toHaveLength(0)
      })

      it("rejects a code that already belongs to a promotion", async () => {
        await api.post(
          `/admin/promotions`,
          {
            code: "SAVE10",
            type: "standard",
            application_method: {
              type: "percentage",
              value: 10,
              target_type: "items",
              allocation: "across",
            },
          },
          adminHeaders
        )

        const { form, meta } = getUploadReq(
          "SAVE10,standard,,,,,,percentage,10,,items,across,,,,,,"
        )

        const error = await api
          .post("/admin/promotions/import", form, meta)
          .catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toEqual(
          "Row 2: A promotion with the code SAVE10 already exists"
        )
      })

      it("lists every failing row", async () => {
        const { form, meta } = getUploadReq(
          ",standard,,,,,,percentage,10,,items,across,,,,,,",
          "SAVE10,standard,,true,,5,,percentage,10,,items,across,,,,,,",
          "BUY2GET1,buyget,,,,,,percentage,100,,items,each,1,2,1,,product_id:in:prod_1,"
        )

        const error = await api
          .post("/admin/promotions/import", form, meta)
          .catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toEqual(
          [
            "Row 2: Code is required",
            "Row 3: Automatic promotions cannot have a Usage Limit",
            "Row 4: buyget promotions require Buy Rules",
          ].join("\n")
        )
      })
    })
  },
})
