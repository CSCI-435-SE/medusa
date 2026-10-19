const defaultStoreCustomersFields = [
  "id",
  "email",
  "company_name",
  "first_name",
  "last_name",
  "phone",
  "metadata",
  "has_account",
  "deleted_at",
  "created_at",
  "updated_at",
  "*addresses",
]

export const retrieveTransformQueryConfig = {
  defaults: defaultStoreCustomersFields,
  allowed: [
    ...defaultStoreCustomersFields.map((f) => f.replace("*", "")),
    "orders",
  ],
  isList: false,
}

export const defaultStoreCustomerAddressFields = [
  "id",
  "address_name",
  "company",
  "customer_id",
  "first_name",
  "last_name",
  "address_1",
  "address_2",
  "city",
  "province",
  "postal_code",
  "country_code",
  "phone",
  "metadata",
  "is_default_shipping",
  "is_default_billing",
  "created_at",
  "updated_at",
]

export const retrieveAddressTransformQueryConfig = {
  defaults: defaultStoreCustomerAddressFields,
  isList: false,
}

export const listAddressesTransformQueryConfig = {
  ...retrieveAddressTransformQueryConfig,
  isList: true,
}

export const defaultStoreSubscriptionFields = [
  "id",
  "customer_id",
  "variant_id",
  "quantity",
  "interval",
  "status",
  "next_billing_at",
  "canceled_at",
  "failed_at",
  "failure_reason",
  "created_at",
  "updated_at",
]

export const retrieveSubscriptionTransformQueryConfig = {
  defaults: defaultStoreSubscriptionFields,
  allowed: defaultStoreSubscriptionFields,
  isList: false,
}

export const listSubscriptionsTransformQueryConfig = {
  ...retrieveSubscriptionTransformQueryConfig,
  isList: true,
}
