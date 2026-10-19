const InventoryImportCSV =
  "data:text/csv;charset=utf-8," +
  `Title,SKU,Requires Shipping,Stocked Quantity,Location,Description,Width,Length,Height,Weight,MID Code,HS Code,Country of Origin,Material
Cotton T-Shirt,SHIRT-1,true,100,European Warehouse,Plain cotton t-shirt,20,30,2,200,MID123,6109.10,DK,Cotton
Coffee Mug,MUG-1,true,0,European Warehouse,,,,,,,,,`

export const getInventoryImportCsvTemplate = () => {
  return encodeURI(InventoryImportCSV)
}
