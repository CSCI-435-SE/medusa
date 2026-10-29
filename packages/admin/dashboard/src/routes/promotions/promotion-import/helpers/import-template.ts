const PromotionImportCSV =
  "data:text/csv;charset=utf-8," +
  `Code,Type,Status,Automatic,Tax Inclusive,Usage Limit,Campaign ID,Discount Type,Discount Value,Currency Code,Target,Allocation,Max Quantity,Buy Min Quantity,Apply To Quantity,Rules,Target Rules,Buy Rules
SUMMER10,standard,active,false,false,100,,percentage,10,,items,across,,,,currency_code:eq:eur,,
FREESHIP,standard,draft,true,false,,,percentage,100,,shipping_methods,across,,,,,,
BUY2GET1,buyget,draft,false,false,,,percentage,100,,items,each,1,2,1,,product_id:in:prod_123,product_id:in:prod_123`

export const getPromotionImportCsvTemplate = () => {
  return encodeURI(PromotionImportCSV)
}
