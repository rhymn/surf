# unplas.tech - Stripe Buy Button Configuration

This document explains how to configure the Stripe Buy Buttons for the merch products on unplas.tech.

## Overview

The website includes Stripe Buy Buttons for the following merch products:
- **Eco T-Shirts** - Sustainable t-shirts made from ecological cotton
- **Hats** - Stylish caps and hats crafted from ecological wool

## Configuration Steps

To activate the Stripe Buy Buttons with your actual Stripe account:

### 1. Create Stripe Buy Buttons

1. Log in to your [Stripe Dashboard](https://dashboard.stripe.com/)
2. Navigate to **Products** → **Buy Buttons**
3. Create a buy button for each product:
   - Eco T-Shirts
   - Hats
4. For each button, configure:
   - Product name and description
   - Price
   - Images
   - Payment settings
   - Shipping options (if applicable)

### 2. Get Your Stripe Keys

After creating each buy button, Stripe will provide you with:
- A unique **buy-button-id** (e.g., `buy_btn_1ABC123...`)
- Your **publishable key** (starts with `pk_live_...` for production or `pk_test_...` for testing)

### 3. Update index.html

Open `index.html` and replace the placeholder values in the Merch section:

#### For Eco T-Shirts (around line 176):
```html
<stripe-buy-button
  buy-button-id="YOUR_TSHIRT_BUY_BUTTON_ID"
  publishable-key="YOUR_STRIPE_PUBLISHABLE_KEY"
>
</stripe-buy-button>
```

#### For Hats (around line 186):
```html
<stripe-buy-button
  buy-button-id="YOUR_HAT_BUY_BUTTON_ID"
  publishable-key="YOUR_STRIPE_PUBLISHABLE_KEY"
>
</stripe-buy-button>
```

### 4. Test Your Integration

1. Use test mode keys (`pk_test_...`) for initial testing
2. Use Stripe's test card numbers to verify checkout works correctly
3. Once tested, switch to live mode keys (`pk_live_...`)

## Current Placeholder Values

The current `index.html` contains placeholder values that clearly indicate they need to be replaced:
- T-Shirt buy button ID: `REPLACE_WITH_YOUR_TSHIRT_BUY_BUTTON_ID`
- Hat buy button ID: `REPLACE_WITH_YOUR_HAT_BUY_BUTTON_ID`
- Publishable key: `REPLACE_WITH_YOUR_STRIPE_PUBLISHABLE_KEY`

**These MUST be replaced with your actual Stripe keys for the buy buttons to function.**

## Documentation

For more information about Stripe Buy Buttons, visit:
- [Stripe Buy Button Documentation](https://stripe.com/docs/payment-links/buy-button)
- [Stripe Dashboard](https://dashboard.stripe.com/)

## Support

For questions about unplas.tech, contact: info@unplas.tech
