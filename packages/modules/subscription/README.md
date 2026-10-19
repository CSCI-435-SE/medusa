# Subscription Module

Lets product variants be sold as recurring subscriptions that renew weekly, monthly or yearly.

## Usage

1. Make a variant subscription-eligible by setting its `subscription_intervals` metadata through the Admin API, e.g. `POST /admin/products/:id/variants/:variant_id` with `{ "metadata": { "subscription_intervals": ["monthly", "yearly"] } }`.
2. A logged-in customer adds the variant to their cart with the chosen interval in the line item's metadata, e.g. `{ "variant_id": "...", "quantity": 1, "metadata": { "subscription_interval": "monthly" } }`.
3. The payment session must be created with `{ "data": { "setup_future_usage": "off_session" } }` so the payment method is saved for renewals.
4. Completing the cart creates one subscription per subscribed line item, owned by the customer and linked to the order.

An hourly scheduled job renews due subscriptions by placing a new order at the variant's current price, with the original order's shipping address and shipping option, charged off-session to the saved payment method. If a renewal fails, for example because the payment is declined or the variant is out of stock, no order is created and the subscription ends with the `failed` status and the failure reason.

Customers can list and cancel their subscriptions with the `/store/customers/me/subscriptions` routes. Canceling takes effect immediately.
