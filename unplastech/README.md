# unplas.tech - Stripe Payment Links Configuration

This document explains how to configure the Stripe Payment Links for the merch products on unplas.tech.

## Overview

The website includes simple Stripe Payment Links for the following merch products:
- **Eco T-Shirts** - Sustainable t-shirts made from ecological cotton
- **Hats** - Stylish caps and hats crafted from ecological wool

## Configuration Steps

To activate the Stripe Payment Links with your actual Stripe account:

### 1. Create Stripe Payment Links

1. Log in to your [Stripe Dashboard](https://dashboard.stripe.com/)
2. Navigate to **Products** → **Payment Links**
3. Create a payment link for each product:
   - Eco T-Shirts
   - Hats
4. For each link, configure:
   - Product name and description
   - Price
   - Images
   - Payment settings
   - Shipping options (if applicable)

### 2. Get Your Payment Link URLs

After creating each payment link, Stripe will provide you with a unique URL that looks like:
- `https://buy.stripe.com/xxxxxxxxxxxxx`

### 3. Update index.html

Open `index.html` and replace the placeholder URLs in the Merch section:

#### For Eco T-Shirts (around line 172):
```html
<dd><a href="https://buy.stripe.com/REPLACE_WITH_YOUR_TSHIRT_PAYMENT_LINK">💳 Buy now</a></dd>
```

Replace `REPLACE_WITH_YOUR_TSHIRT_PAYMENT_LINK` with your actual T-shirt payment link ID (the part after `buy.stripe.com/`)

#### For Hats (around line 176):
```html
<dd><a href="https://buy.stripe.com/REPLACE_WITH_YOUR_HAT_PAYMENT_LINK">💳 Buy now</a></dd>
```

Replace `REPLACE_WITH_YOUR_HAT_PAYMENT_LINK` with your actual hat payment link ID (the part after `buy.stripe.com/`)

### 4. Test Your Integration

1. Use test mode payment links for initial testing
2. Click the links to verify they direct to the correct Stripe checkout page
3. Use Stripe's test card numbers to verify checkout works correctly
4. Once tested, switch to live mode payment links

## Current Placeholder Values

The current `index.html` contains placeholder values that clearly indicate they need to be replaced:
- T-Shirt payment link: `https://buy.stripe.com/REPLACE_WITH_YOUR_TSHIRT_PAYMENT_LINK`
- Hat payment link: `https://buy.stripe.com/REPLACE_WITH_YOUR_HAT_PAYMENT_LINK`

**These MUST be replaced with your actual Stripe payment link URLs for the buy buttons to function.**

## Documentation

For more information about Stripe Payment Links, visit:
- [Stripe Payment Links Documentation](https://stripe.com/docs/payment-links)
- [Stripe Dashboard](https://dashboard.stripe.com/)

## Support

For questions about unplas.tech, contact: info@unplas.tech
