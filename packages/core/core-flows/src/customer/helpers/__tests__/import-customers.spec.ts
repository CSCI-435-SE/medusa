import {
  parseCustomerImportCsv,
  validateCustomerImport,
} from "../import-customers"

const HEADER = "Email,First Name,Last Name,Company,Phone"

const csv = (...rows: string[]) => [HEADER, ...rows].join("\n")

describe("parseCustomerImportCsv", () => {
  it("maps the template columns and numbers rows like a spreadsheet", () => {
    const rows = parseCustomerImportCsv(
      csv("jo@example.com,Jo,Doe,Acme,555-0100", "sam@example.com,,,,")
    )

    expect(rows).toEqual([
      {
        rowNumber: 2,
        email: "jo@example.com",
        first_name: "Jo",
        last_name: "Doe",
        company_name: "Acme",
        phone: "555-0100",
      },
      {
        rowNumber: 3,
        email: "sam@example.com",
        first_name: "",
        last_name: "",
        company_name: "",
        phone: "",
      },
    ])
  })

  it("reads the Email column when the file starts with a UTF-8 BOM", () => {
    const rows = parseCustomerImportCsv("﻿" + csv("jo@example.com,,,,"))

    expect(rows[0].email).toBe("jo@example.com")
  })
})

describe("validateCustomerImport", () => {
  const validate = (content: string, existingEmails: string[] = []) =>
    validateCustomerImport(parseCustomerImportCsv(content), existingEmails)

  it("returns the customers to create and leaves blank optional fields off", () => {
    const { customers, errors } = validate(
      csv("jo@example.com,Jo,Doe,Acme,555-0100", "sam@example.com,,,,")
    )

    expect(errors).toEqual([])
    expect(customers).toEqual([
      {
        email: "jo@example.com",
        first_name: "Jo",
        last_name: "Doe",
        company_name: "Acme",
        phone: "555-0100",
      },
      { email: "sam@example.com" },
    ])
  })

  it("rejects a row with a blank email", () => {
    const { errors } = validate(csv(",Jo,Doe,,"))

    expect(errors).toEqual(["Row 2: Email is required"])
  })

  it("rejects a row with an invalid email", () => {
    const { errors } = validate(csv("not-an-email,Jo,,,"))

    expect(errors).toEqual(['Row 2: "not-an-email" is not a valid email'])
  })

  it("rejects an email that is repeated in the file", () => {
    const { errors } = validate(
      csv("jo@example.com,,,,", "sam@example.com,,,,", "jo@example.com,,,,")
    )

    expect(errors).toEqual([
      "Row 4: jo@example.com is also used on row 2 of this file",
    ])
  })

  it("rejects an email that already belongs to a customer", () => {
    const { errors } = validate(csv("jo@example.com,,,,"), ["jo@example.com"])

    expect(errors).toEqual([
      "Row 2: A customer with the email jo@example.com already exists",
    ])
  })

  it("matches existing emails exactly, without ignoring case", () => {
    const { errors } = validate(csv("Jo@example.com,,,,"), ["jo@example.com"])

    expect(errors).toEqual([])
  })

  it("reports every failing row, not just the first", () => {
    const { errors } = validate(
      csv(
        ",Jo,,,",
        "ok@example.com,,,,",
        "bad-email,,,,",
        "ok@example.com,,,,",
        "taken@example.com,,,,"
      ),
      ["taken@example.com"]
    )

    expect(errors).toEqual([
      "Row 2: Email is required",
      'Row 4: "bad-email" is not a valid email',
      "Row 5: ok@example.com is also used on row 3 of this file",
      "Row 6: A customer with the email taken@example.com already exists",
    ])
  })
})
