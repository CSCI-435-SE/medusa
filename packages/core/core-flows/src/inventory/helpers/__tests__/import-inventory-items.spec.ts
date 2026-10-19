import {
  parseInventoryImportCsv,
  validateInventoryImport,
} from "../import-inventory-items"

const HEADER =
  "Title,SKU,Requires Shipping,Stocked Quantity,Location,Description,Width,Length,Height,Weight,MID Code,HS Code,Country of Origin,Material"

const csv = (...rows: string[]) => [HEADER, ...rows].join("\n")

const LOCATIONS = {
  "Main Warehouse": ["sloc_main"],
  "Second Warehouse": ["sloc_second"],
}

describe("parseInventoryImportCsv", () => {
  it("maps the template columns and numbers rows like a spreadsheet", () => {
    const rows = parseInventoryImportCsv(
      csv(
        "Shirt,SHIRT-1,true,10,Main Warehouse,Cotton shirt,20,30,2,200,MID1,HS1,us,Cotton",
        "Mug,MUG-1,false,0,Main Warehouse,,,,,,,,,"
      )
    )

    expect(rows).toEqual([
      {
        rowNumber: 2,
        title: "Shirt",
        sku: "SHIRT-1",
        requires_shipping: "true",
        stocked_quantity: "10",
        location: "Main Warehouse",
        description: "Cotton shirt",
        width: "20",
        length: "30",
        height: "2",
        weight: "200",
        mid_code: "MID1",
        hs_code: "HS1",
        origin_country: "us",
        material: "Cotton",
      },
      {
        rowNumber: 3,
        title: "Mug",
        sku: "MUG-1",
        requires_shipping: "false",
        stocked_quantity: "0",
        location: "Main Warehouse",
        description: "",
        width: "",
        length: "",
        height: "",
        weight: "",
        mid_code: "",
        hs_code: "",
        origin_country: "",
        material: "",
      },
    ])
  })

  it("reads the Title column when the file starts with a UTF-8 BOM", () => {
    const rows = parseInventoryImportCsv(
      "﻿" + csv("Mug,MUG-1,false,0,Main Warehouse,,,,,,,,,")
    )

    expect(rows[0].title).toBe("Mug")
  })
})

describe("validateInventoryImport", () => {
  const validate = (
    content: string,
    existingSkus: string[] = [],
    locationIdsByName: Record<string, string[]> = LOCATIONS
  ) =>
    validateInventoryImport(
      parseInventoryImportCsv(content),
      existingSkus,
      locationIdsByName
    )

  it("returns the items to create with their stock level and leaves blank optional fields off", () => {
    const { items, errors } = validate(
      csv(
        "Shirt,SHIRT-1,TRUE,10,Main Warehouse,Cotton shirt,20,30,2,200,MID1,HS1,us,Cotton",
        "Mug,MUG-1,false,0,Second Warehouse,,,,,,,,,"
      )
    )

    expect(errors).toEqual([])
    expect(items).toEqual([
      {
        title: "Shirt",
        sku: "SHIRT-1",
        requires_shipping: true,
        description: "Cotton shirt",
        width: 20,
        length: 30,
        height: 2,
        weight: 200,
        mid_code: "MID1",
        hs_code: "HS1",
        origin_country: "us",
        material: "Cotton",
        location_levels: [{ location_id: "sloc_main", stocked_quantity: 10 }],
      },
      {
        title: "Mug",
        sku: "MUG-1",
        requires_shipping: false,
        location_levels: [{ location_id: "sloc_second", stocked_quantity: 0 }],
      },
    ])
  })

  it("rejects a row with blank required fields and names each one", () => {
    const { errors } = validate(csv(",,,,,Cotton shirt,,,,,,,,"))

    expect(errors).toEqual([
      "Row 2: Title, SKU, Requires Shipping, Stocked Quantity and Location are required",
    ])
  })

  it("rejects a row with one blank required field", () => {
    const { errors } = validate(csv("Mug,MUG-1,false,,Main Warehouse,,,,,,,,,"))

    expect(errors).toEqual(["Row 2: Stocked Quantity is required"])
  })

  it("rejects a Requires Shipping value that is not true or false", () => {
    const { errors } = validate(csv("Mug,MUG-1,yes,1,Main Warehouse,,,,,,,,,"))

    expect(errors).toEqual([
      'Row 2: Requires Shipping must be true or false, got "yes"',
    ])
  })

  it.each(["-1", "1.5", "ten"])(
    "rejects a Stocked Quantity of %s",
    (quantity) => {
      const { errors } = validate(
        csv(`Mug,MUG-1,false,${quantity},Main Warehouse,,,,,,,,,`)
      )

      expect(errors).toEqual([
        `Row 2: Stocked Quantity must be a whole number of 0 or more, got "${quantity}"`,
      ])
    }
  )

  it("accepts decimal dimensions", () => {
    const { items, errors } = validate(
      csv("Mug,MUG-1,false,1,Main Warehouse,,0.5,12.7,3,1.25,,,,")
    )

    expect(errors).toEqual([])
    expect(items[0]).toEqual(
      expect.objectContaining({
        width: 0.5,
        length: 12.7,
        height: 3,
        weight: 1.25,
      })
    )
  })

  it("rejects a dimension that is not a number", () => {
    const { errors } = validate(
      csv("Mug,MUG-1,false,1,Main Warehouse,,,,,ten,,,,")
    )

    expect(errors).toEqual(['Row 2: Weight must be a number, got "ten"'])
  })

  it("rejects a Location that matches no stock location", () => {
    const { errors } = validate(csv("Mug,MUG-1,false,1,Attic,,,,,,,,,"))

    expect(errors).toEqual(['Row 2: No stock location is named "Attic"'])
  })

  it("rejects a Location that matches more than one stock location", () => {
    const { errors } = validate(
      csv("Mug,MUG-1,false,1,Main Warehouse,,,,,,,,,"),
      [],
      { "Main Warehouse": ["sloc_a", "sloc_b"] }
    )

    expect(errors).toEqual([
      'Row 2: More than one stock location is named "Main Warehouse"',
    ])
  })

  it("matches Location names exactly, without ignoring case", () => {
    const { errors } = validate(
      csv("Mug,MUG-1,false,1,main warehouse,,,,,,,,,")
    )

    expect(errors).toEqual([
      'Row 2: No stock location is named "main warehouse"',
    ])
  })

  it("rejects a SKU that is repeated in the file", () => {
    const { errors } = validate(
      csv(
        "Mug,MUG-1,false,1,Main Warehouse,,,,,,,,,",
        "Cup,CUP-1,false,1,Main Warehouse,,,,,,,,,",
        "Mug 2,MUG-1,false,1,Main Warehouse,,,,,,,,,"
      )
    )

    expect(errors).toEqual(["Row 4: MUG-1 is also used on row 2 of this file"])
  })

  it("rejects a SKU that already belongs to an inventory item", () => {
    const { errors } = validate(
      csv("Mug,MUG-1,false,1,Main Warehouse,,,,,,,,,"),
      ["MUG-1"]
    )

    expect(errors).toEqual([
      "Row 2: An inventory item with the SKU MUG-1 already exists",
    ])
  })

  it("matches existing SKUs exactly, without ignoring case", () => {
    const { errors } = validate(
      csv("Mug,mug-1,false,1,Main Warehouse,,,,,,,,,"),
      ["MUG-1"]
    )

    expect(errors).toEqual([])
  })

  it("reports every failing row, not just the first", () => {
    const { errors } = validate(
      csv(
        ",MUG-1,false,1,Main Warehouse,,,,,,,,,",
        "Cup,CUP-1,false,1,Main Warehouse,,,,,,,,,",
        "Bowl,BOWL-1,maybe,1,Main Warehouse,,,,,,,,,",
        "Cup 2,CUP-1,false,1,Main Warehouse,,,,,,,,,",
        "Plate,PLATE-1,false,1,Attic,,,,,,,,,",
        "Fork,FORK-1,false,1,Main Warehouse,,,,,,,,,"
      ),
      ["FORK-1"]
    )

    expect(errors).toEqual([
      "Row 2: Title is required",
      'Row 4: Requires Shipping must be true or false, got "maybe"',
      "Row 5: CUP-1 is also used on row 3 of this file",
      'Row 6: No stock location is named "Attic"',
      "Row 7: An inventory item with the SKU FORK-1 already exists",
    ])
  })
})
