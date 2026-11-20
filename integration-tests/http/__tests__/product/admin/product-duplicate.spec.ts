import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  adminHeaders,
  createAdminUser,
} from "../../../../helpers/create-admin-user"

jest.setTimeout(50000)

// Relations needed to compare the original with its copy.
const FIELDS =
  "+metadata,*options,*options.values,*images,*tags,*sales_channels," +
  "*shipping_profile,*variants,*variants.prices,*variants.options"

medusaIntegrationTestRunner({
  testSuite: ({ dbConnection, getContainer, api }) => {
    let original
    let shippingProfile
    let tag

    beforeEach(async () => {
      await createAdminUser(dbConnection, adminHeaders, getContainer())

      shippingProfile = (
        await api.post(
          `/admin/shipping-profiles`,
          { name: "default", type: "default" },
          adminHeaders
        )
      ).data.shipping_profile

      tag = (
        await api.post("/admin/product-tags", { value: "summer" }, adminHeaders)
      ).data.product_tag

      // A published product with unique variant fields, two currencies and
      // an inventory managed variant.
      original = (
        await api.post(
          "/admin/products",
          {
            title: "Classic Tee",
            handle: "classic-tee",
            status: "published",
            subtitle: "Cotton",
            description: "A classic tee",
            discountable: false,
            metadata: { season: "summer" },
            thumbnail: "https://example.com/thumb.png",
            images: [{ url: "https://example.com/1.png" }],
            tags: [{ id: tag.id }],
            shipping_profile_id: shippingProfile.id,
            options: [
              { title: "Color", values: ["Red", "Blue"] },
              { title: "Size", values: ["S", "M"] },
            ],
            variants: [
              {
                title: "Red / S",
                sku: "TEE-RED-S",
                barcode: "111",
                ean: "1234567890123",
                upc: "123456789012",
                manage_inventory: true,
                metadata: { fit: "slim" },
                options: { Color: "Red", Size: "S" },
                prices: [
                  { amount: 10, currency_code: "usd" },
                  { amount: 9, currency_code: "eur" },
                ],
              },
              {
                title: "Blue / M",
                sku: "TEE-BLUE-M",
                manage_inventory: false,
                options: { Color: "Blue", Size: "M" },
                prices: [{ amount: 12, currency_code: "usd" }],
              },
            ],
          },
          adminHeaders
        )
      ).data.product
    })

    describe("POST /admin/products/:id/duplicate", () => {
      it("duplicates a product with its structure and clears unique fields", async () => {
        const response = await api.post(
          `/admin/products/${original.id}/duplicate?fields=${FIELDS}`,
          { title: "Classic Tee - Long Sleeve", handle: "classic-tee-ls" },
          adminHeaders
        )

        expect(response.status).toEqual(200)

        const copy = response.data.product

        expect(copy.id).not.toEqual(original.id)
        expect(copy).toEqual(
          expect.objectContaining({
            title: "Classic Tee - Long Sleeve",
            handle: "classic-tee-ls",
            // Always a draft, even though the original is published.
            status: "draft",
            subtitle: "Cotton",
            description: "A classic tee",
            discountable: false,
            metadata: { season: "summer" },
            thumbnail: "https://example.com/thumb.png",
          })
        )
        expect(copy.images.map((i) => i.url)).toEqual([
          "https://example.com/1.png",
        ])
        expect(copy.tags.map((t) => t.id)).toEqual([tag.id])
        expect(copy.shipping_profile.id).toEqual(shippingProfile.id)

        // Options and values are copied.
        expect(
          copy.options.map((o) => ({
            title: o.title,
            values: o.values.map((v) => v.value).sort(),
          }))
        ).toEqual(
          expect.arrayContaining([
            { title: "Color", values: ["Blue", "Red"] },
            { title: "Size", values: ["M", "S"] },
          ])
        )

        // Variants, option values and prices are copied.
        expect(copy.variants).toHaveLength(2)
        const redSmall = copy.variants.find((v) => v.title === "Red / S")
        expect(redSmall.manage_inventory).toEqual(true)
        expect(redSmall.metadata).toEqual({ fit: "slim" })
        expect(redSmall.options.map((o) => o.value).sort()).toEqual([
          "Red",
          "S",
        ])
        expect(
          redSmall.prices.map((p) => [p.currency_code, p.amount]).sort()
        ).toEqual([
          ["eur", 9],
          ["usd", 10],
        ])

        // Unique fields are left empty.
        for (const variant of copy.variants) {
          expect(variant.sku).toBeNull()
          expect(variant.barcode).toBeNull()
          expect(variant.ean).toBeNull()
          expect(variant.upc).toBeNull()
        }

        // Variants and options belong to the copy, not the original.
        const originalAfter = (
          await api.get(
            `/admin/products/${original.id}?fields=${FIELDS}`,
            adminHeaders
          )
        ).data.product
        const originalVariantIds = originalAfter.variants.map((v) => v.id)
        for (const variant of copy.variants) {
          expect(originalVariantIds).not.toContain(variant.id)
        }
      })

      it("leaves the original product unchanged", async () => {
        await api.post(
          `/admin/products/${original.id}/duplicate`,
          { title: "Classic Tee - Long Sleeve", handle: "classic-tee-ls" },
          adminHeaders
        )

        const after = (
          await api.get(
            `/admin/products/${original.id}?fields=${FIELDS}`,
            adminHeaders
          )
        ).data.product

        expect(after.title).toEqual("Classic Tee")
        expect(after.handle).toEqual("classic-tee")
        expect(after.status).toEqual("published")
        expect(after.variants.map((v) => v.sku).sort()).toEqual([
          "TEE-BLUE-M",
          "TEE-RED-S",
        ])
      })

      it("creates new inventory items without stock for managed variants", async () => {
        const { product: copy } = (
          await api.post(
            `/admin/products/${original.id}/duplicate?fields=*variants`,
            { title: "Classic Tee - Long Sleeve", handle: "classic-tee-ls" },
            adminHeaders
          )
        ).data

        const managed = copy.variants.find((v) => v.title === "Red / S")

        const { data } = await api.get(
          `/admin/products/${copy.id}/variants/${managed.id}?fields=*inventory_items,*inventory_items.inventory,*inventory_items.inventory.location_levels`,
          adminHeaders
        )

        const items = data.variant.inventory_items ?? []
        expect(items).toHaveLength(1)
        // No stock is copied: the new item has no stocked locations.
        expect(items[0].inventory.location_levels ?? []).toHaveLength(0)
      })

      it("fails when the handle is already used and creates nothing", async () => {
        const before = (await api.get("/admin/products", adminHeaders)).data
          .count

        const error = await api
          .post(
            `/admin/products/${original.id}/duplicate`,
            { title: "Another Tee", handle: "classic-tee" },
            adminHeaders
          )
          .catch((e) => e)

        expect(error.response.status).toEqual(400)
        expect(error.response.data.message).toContain("already exists")

        const after = (await api.get("/admin/products", adminHeaders)).data
          .count
        expect(after).toEqual(before)
      })

      it("accepts the pre-filled '(Copy)' title and handle as they are", async () => {
        // No rename is required: the dashboard pre-fills these values and
        // the owner may keep them.
        const response = await api.post(
          `/admin/products/${original.id}/duplicate`,
          { title: "Classic Tee (Copy)", handle: "classic-tee-copy" },
          adminHeaders
        )

        expect(response.status).toEqual(200)
        expect(response.data.product).toEqual(
          expect.objectContaining({
            title: "Classic Tee (Copy)",
            handle: "classic-tee-copy",
            status: "draft",
          })
        )
      })

      it("rejects an empty title", async () => {
        const before = (await api.get("/admin/products", adminHeaders)).data
          .count

        const error = await api
          .post(
            `/admin/products/${original.id}/duplicate`,
            { title: "", handle: "classic-tee-new" },
            adminHeaders
          )
          .catch((e) => e)

        expect(error.response.status).toEqual(400)

        const after = (await api.get("/admin/products", adminHeaders)).data
          .count
        expect(after).toEqual(before)
      })

      it("returns 404 for an unknown product", async () => {
        const error = await api
          .post(
            `/admin/products/prod_missing/duplicate`,
            { title: "Whatever", handle: "whatever" },
            adminHeaders
          )
          .catch((e) => e)

        expect(error.response.status).toEqual(404)
      })

      describe("duplication options", () => {
        const duplicate = (include?: Record<string, unknown>) =>
          api.post(
            `/admin/products/${original.id}/duplicate?fields=${FIELDS}`,
            {
              title: "Classic Tee - Long Sleeve",
              handle: "classic-tee-ls",
              ...(include ? { include } : {}),
            },
            adminHeaders
          )

        // AC3: the groups default to copied, so a request that sends none
        // behaves the way duplication did before the options existed.
        it("copies every group when include is omitted", async () => {
          const copy = (await duplicate()).data.product

          expect(copy.images).toHaveLength(1)
          expect(copy.variants).toHaveLength(2)
          expect(copy.variants[0].prices.length).toBeGreaterThan(0)
        })

        it("copies every group for an empty include", async () => {
          const copy = (await duplicate({})).data.product

          expect(copy.images).toHaveLength(1)
          expect(copy.variants).toHaveLength(2)
        })

        it("copies no images when images are not selected", async () => {
          const copy = (await duplicate({ images: false })).data.product

          expect(copy.images ?? []).toHaveLength(0)
          // The other groups are untouched.
          expect(copy.variants).toHaveLength(2)
        })

        // AC6: options are still required for the product to be valid, so the
        // copy keeps them even with no variants to use them.
        it("copies no variants but keeps options when variants are not selected", async () => {
          const copy = (await duplicate({ variants: false })).data.product

          expect(copy.variants ?? []).toHaveLength(0)
          expect(copy.options.map((o) => o.title).sort()).toEqual([
            "Color",
            "Size",
          ])
          expect(copy.status).toEqual("draft")
        })

        it("copies variants without prices when prices are not selected", async () => {
          const copy = (await duplicate({ prices: false })).data.product

          expect(copy.variants).toHaveLength(2)
          for (const variant of copy.variants) {
            expect(variant.prices ?? []).toHaveLength(0)
          }
        })

        // AC4: with the settings left out the variants fall back to the
        // product module's defaults rather than the original's values. The
        // original's "Blue / M" does not manage inventory; the copy does.
        it("falls back to the default inventory settings when they are not selected", async () => {
          const copy = (await duplicate({ inventory_settings: false })).data
            .product

          const blueM = copy.variants.find((v) => v.title === "Blue / M")
          expect(blueM.manage_inventory).toEqual(true)
          expect(blueM.allow_backorder).toEqual(false)
        })

        it("copies the original inventory settings when they are selected", async () => {
          const copy = (await duplicate({ inventory_settings: true })).data
            .product

          const blueM = copy.variants.find((v) => v.title === "Blue / M")
          expect(blueM.manage_inventory).toEqual(false)
        })

        // AC8: prices are stored on the variants, so asking for prices without
        // variants copies neither instead of failing.
        it("ignores prices when variants are not selected", async () => {
          const response = await duplicate({
            variants: false,
            prices: true,
            inventory_settings: true,
          })

          expect(response.status).toEqual(200)
          expect(response.data.product.variants ?? []).toHaveLength(0)
        })

        it("creates a draft that leaves the original alone for the narrowest selection", async () => {
          const copy = (
            await duplicate({
              images: false,
              variants: false,
              prices: false,
              inventory_settings: false,
            })
          ).data.product

          expect(copy.id).not.toEqual(original.id)
          expect(copy.status).toEqual("draft")

          const after = (
            await api.get(
              `/admin/products/${original.id}?fields=${FIELDS}`,
              adminHeaders
            )
          ).data.product
          expect(after.status).toEqual("published")
          expect(after.images).toHaveLength(1)
          expect(after.variants).toHaveLength(2)
        })

        it("rejects an unknown group and creates nothing", async () => {
          const before = (await api.get("/admin/products", adminHeaders)).data
            .count

          const error = await duplicate({ inventory_quantities: true }).catch(
            (e) => e
          )

          expect(error.response.status).toEqual(400)

          const after = (await api.get("/admin/products", adminHeaders)).data
            .count
          expect(after).toEqual(before)
        })

        it("rejects a group that is not a boolean", async () => {
          const error = await duplicate({ images: "yes" }).catch((e) => e)

          expect(error.response.status).toEqual(400)
        })
      })
    })
  },
})
