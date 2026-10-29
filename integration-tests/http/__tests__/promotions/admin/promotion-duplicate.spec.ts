import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  adminHeaders,
  createAdminUser,
} from "../../../../helpers/create-admin-user"

jest.setTimeout(30000)

const FIELDS =
  "+metadata,*rules,*rules.values,*campaign,*application_method,*application_method.target_rules,*application_method.target_rules.values,*application_method.buy_rules,*application_method.buy_rules.values"

const ruleShape = (rule) => ({
  description: rule.description,
  attribute: rule.attribute,
  operator: rule.operator,
  values: rule.values.map((value) => value.value).sort(),
})

medusaIntegrationTestRunner({
  testSuite: ({ dbConnection, api, getContainer }) => {
    let campaign
    let standardPromotion
    let buygetPromotion

    beforeEach(async () => {
      await createAdminUser(dbConnection, adminHeaders, getContainer())

      campaign = (
        await api.post(
          `/admin/campaigns`,
          { name: "Summer", campaign_identifier: "summer" },
          adminHeaders
        )
      ).data.campaign

      standardPromotion = (
        await api.post(
          `/admin/promotions`,
          {
            code: "SUMMER20",
            type: "standard",
            status: "active",
            is_tax_inclusive: true,
            limit: 100,
            campaign_id: campaign.id,
            rules: [
              {
                description: "Newsletter subscribers",
                attribute: "customer.groups.id",
                operator: "in",
                values: ["cusgroup_newsletter"],
              },
            ],
            application_method: {
              type: "fixed",
              value: 20,
              currency_code: "usd",
              target_type: "items",
              allocation: "each",
              max_quantity: 2,
              target_rules: [
                {
                  description: "Shirts",
                  attribute: "product_id",
                  operator: "in",
                  values: ["prod_shirt_1", "prod_shirt_2"],
                },
              ],
            },
          },
          adminHeaders
        )
      ).data.promotion

      buygetPromotion = (
        await api.post(
          `/admin/promotions`,
          {
            code: "BUY2GET1",
            type: "buyget",
            is_automatic: true,
            application_method: {
              type: "percentage",
              value: 100,
              target_type: "items",
              allocation: "each",
              max_quantity: 1,
              apply_to_quantity: 1,
              buy_rules_min_quantity: 2,
              target_rules: [
                {
                  attribute: "product_id",
                  operator: "eq",
                  values: ["prod_sock"],
                },
              ],
              buy_rules: [
                {
                  attribute: "product_id",
                  operator: "eq",
                  values: ["prod_shirt_1"],
                },
              ],
            },
          },
          adminHeaders
        )
      ).data.promotion

      // Usage only goes up when an order is placed, and the admin API can't set
      // metadata, so both are set directly.
      await dbConnection.raw(
        `UPDATE promotion SET used = 7, metadata = ? WHERE id = ?`,
        [JSON.stringify({ season: "summer" }), standardPromotion.id]
      )
    })

    const retrieve = async (id: string) =>
      (await api.get(`/admin/promotions/${id}?fields=${FIELDS}`, adminHeaders))
        .data.promotion

    const listByCode = async (code: string) =>
      (
        await api.get(
          `/admin/promotions?code=${encodeURIComponent(code)}`,
          adminHeaders
        )
      ).data.promotions

    describe("POST /admin/promotions/:id/duplicate", () => {
      it("copies the promotion's settings and rules as a draft with no usage and no campaign", async () => {
        const response = await api.post(
          `/admin/promotions/${standardPromotion.id}/duplicate`,
          { code: "FALL20" },
          adminHeaders
        )

        expect(response.status).toEqual(200)
        expect(response.data.promotion.id).not.toEqual(standardPromotion.id)

        const original = await retrieve(standardPromotion.id)
        const copy = await retrieve(response.data.promotion.id)

        expect(copy).toEqual(
          expect.objectContaining({
            code: "FALL20",
            type: "standard",
            status: "draft",
            is_automatic: false,
            is_tax_inclusive: true,
            limit: 100,
            used: 0,
            campaign_id: null,
            metadata: { season: "summer" },
            application_method: expect.objectContaining({
              type: "fixed",
              target_type: "items",
              allocation: "each",
              value: 20,
              currency_code: "usd",
              max_quantity: 2,
            }),
          })
        )
        expect(copy.rules.map(ruleShape)).toEqual(original.rules.map(ruleShape))
        expect(copy.application_method.target_rules.map(ruleShape)).toEqual(
          original.application_method.target_rules.map(ruleShape)
        )

        expect(original).toEqual(
          expect.objectContaining({
            code: "SUMMER20",
            status: "active",
            used: 7,
            campaign_id: campaign.id,
          })
        )
      })

      it("copies a buyget promotion's buy rules and quantities", async () => {
        const response = await api.post(
          `/admin/promotions/${buygetPromotion.id}/duplicate`,
          { code: "BUY2GET1-COPY" },
          adminHeaders
        )

        const original = await retrieve(buygetPromotion.id)
        const copy = await retrieve(response.data.promotion.id)

        expect(copy).toEqual(
          expect.objectContaining({
            type: "buyget",
            status: "draft",
            is_automatic: true,
            application_method: expect.objectContaining({
              type: "percentage",
              value: 100,
              max_quantity: 1,
              apply_to_quantity: 1,
              buy_rules_min_quantity: 2,
            }),
          })
        )
        expect(copy.application_method.buy_rules.map(ruleShape)).toEqual(
          original.application_method.buy_rules.map(ruleShape)
        )
        expect(copy.application_method.target_rules.map(ruleShape)).toEqual(
          original.application_method.target_rules.map(ruleShape)
        )
      })

      it("gives the copy its own rules, so changing one doesn't change the other", async () => {
        const response = await api.post(
          `/admin/promotions/${standardPromotion.id}/duplicate`,
          { code: "FALL20" },
          adminHeaders
        )
        const copy = await retrieve(response.data.promotion.id)
        const original = await retrieve(standardPromotion.id)

        const ruleIds = (promotion) => [
          ...promotion.rules.map((rule) => rule.id),
          ...promotion.application_method.target_rules.map((rule) => rule.id),
        ]
        for (const id of ruleIds(copy)) {
          expect(ruleIds(original)).not.toContain(id)
        }

        await api.post(
          `/admin/promotions/${copy.id}/rules/batch`,
          {
            update: [
              {
                id: copy.rules[0].id,
                attribute: "customer.groups.id",
                operator: "in",
                values: ["cusgroup_vip"],
              },
            ],
          },
          adminHeaders
        )
        await api.post(
          `/admin/promotions/${standardPromotion.id}`,
          { code: "SUMMER25" },
          adminHeaders
        )

        const copyAfter = await retrieve(copy.id)
        const originalAfter = await retrieve(standardPromotion.id)

        expect(copyAfter.code).toEqual("FALL20")
        expect(copyAfter.rules.map(ruleShape)).toEqual([
          {
            description: "Newsletter subscribers",
            attribute: "customer.groups.id",
            operator: "in",
            values: ["cusgroup_vip"],
          },
        ])
        expect(originalAfter.rules.map(ruleShape)).toEqual([
          {
            description: "Newsletter subscribers",
            attribute: "customer.groups.id",
            operator: "in",
            values: ["cusgroup_newsletter"],
          },
        ])
      })

      it("rejects a code another promotion already uses and creates nothing", async () => {
        const error = await api
          .post(
            `/admin/promotions/${standardPromotion.id}/duplicate`,
            { code: "BUY2GET1" },
            adminHeaders
          )
          .catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toEqual(
          "Promotion with code: BUY2GET1, already exists."
        )
        expect(await listByCode("BUY2GET1")).toHaveLength(1)

        const all = (await api.get(`/admin/promotions`, adminHeaders)).data
        expect(all.count).toEqual(2)
      })

      it("returns 404 when the promotion doesn't exist", async () => {
        const error = await api
          .post(
            `/admin/promotions/promo_missing/duplicate`,
            { code: "FALL20" },
            adminHeaders
          )
          .catch((e) => e)

        expect(error.response.status).toEqual(404)
        expect(await listByCode("FALL20")).toHaveLength(0)
      })
    })
  },
})
