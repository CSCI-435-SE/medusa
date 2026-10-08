const CustomerImportCSV =
  "data:text/csv;charset=utf-8," +
  `Email,First Name,Last Name,Company,Phone
jane.doe@example.com,Jane,Doe,Acme,+1 555 0100
john.smith@example.com,John,Smith,,`

export const getCustomerImportCsvTemplate = () => {
  return encodeURI(CustomerImportCSV)
}
