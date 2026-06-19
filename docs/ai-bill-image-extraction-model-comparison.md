# AI Bill Image Extraction Model Comparison

Date: 04/06/2026

## Objective

Client wants to upload any bill image, send it to an AI model with API key, extract structured JSON, and pre-fill the Create Bill screen.

The model must handle:

- Printed bills
- Handwritten/partially handwritten bills
- Low-quality phone photos
- Different invoice layouts
- Supplier/party details
- Invoice number and date
- Item rows
- GST details
- Discounts
- Transport charge
- Total amount
- Confidence and missing-field flags

## Short Recommendation

Use **OpenAI GPT-5.5** when highest extraction accuracy matters most.

Use **OpenAI GPT-5.4** when accuracy is important but cost must be controlled.

Use **Gemini 2.5 Flash** when cost and speed matter more than maximum accuracy.

Use **Gemini 3.1 Pro Preview** only if client accepts preview-model risk.

## Best Production Choice

### Recommended model

```txt
OpenAI GPT-5.5
```

### Why

- Best fit for complex image understanding.
- Stronger reasoning for messy bill layouts.
- Better field mapping into strict schema.
- Better handling of ambiguous totals.
- Better for item-level extraction.
- Strong Structured Outputs support.

### Suggested fallback

```txt
OpenAI GPT-5.4
```

Use GPT-5.4 if monthly usage becomes costly.

## Architecture Recommendation

Never call AI API from frontend.

Use this flow:

```txt
Frontend upload image
-> Backend receives image
-> Backend sends image to AI model
-> AI returns strict JSON
-> Backend validates JSON
-> Backend maps JSON to bill form payload
-> Frontend fills Create Bill screen
-> User reviews
-> User saves bill
```

Do not save bill directly from AI output.

AI output must be review-first.

## Required JSON Strategy

Use strict structured JSON.

Suggested output shape:

```json
{
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "contact": {
    "name": "string",
    "phone": "string|null",
    "gstin": "string|null",
    "address": "string|null"
  },
  "items": [
    {
      "item_name": "string",
      "barcode": "string|null",
      "hsn_code": "string|null",
      "pcs": 0,
      "rate": 0,
      "discount_percent": 0,
      "special_discount_percent": 0,
      "discount_amount": 0,
      "item_discount_percent": 0,
      "item_discount2_percent": 0,
      "gst_percent": 0,
      "gst_amount": 0,
      "amount": 0
    }
  ],
  "transport_charge": 0,
  "subtotal": 0,
  "total_discount": 0,
  "total_gst": 0,
  "net_amount": 0,
  "confidence": {
    "overall": 0,
    "invoice_number": 0,
    "invoice_date": 0,
    "contact": 0,
    "items": 0,
    "totals": 0
  },
  "warnings": []
}
```

## OpenAI Model Comparison

| Model | Best For | Accuracy | Speed | Cost | Production Fit |
|---|---|---:|---:|---:|---|
| GPT-5.5 | Highest-accuracy bill extraction | Highest | Medium | High | Best |
| GPT-5.4 | Accurate extraction with lower cost | Very high | Medium | Medium | Strong |
| GPT-5.4 mini | Simple clean bills | Medium | Fast | Low | Backup only |

## OpenAI Pricing

Official listed pricing:

| Model | Input / 1M tokens | Cached Input / 1M tokens | Output / 1M tokens |
|---|---:|---:|---:|
| GPT-5.5 | $5.00 | $0.50 | $30.00 |
| GPT-5.4 | $2.50 | $0.25 | $15.00 |
| GPT-5.4 mini | $0.75 | $0.075 | $4.50 |

OpenAI notes images are converted into tokens and billed through token pricing for text models.

## OpenAI Estimated Monthly Cost

Assumption per bill:

- 1 bill image
- 3,000 input tokens
- 1,500 output tokens
- Strict JSON output
- No Batch API discount

Estimated cost per bill:

| Model | Approx Cost / Bill |
|---|---:|
| GPT-5.5 | $0.060 |
| GPT-5.4 | $0.030 |
| GPT-5.4 mini | $0.009 |

Monthly estimate:

| Bills / Month | GPT-5.5 | GPT-5.4 | GPT-5.4 mini |
|---:|---:|---:|---:|
| 1,000 | $60 | $30 | $9 |
| 5,000 | $300 | $150 | $45 |
| 10,000 | $600 | $300 | $90 |
| 25,000 | $1,500 | $750 | $225 |

Actual cost can increase for:

- Multiple images per bill
- High-resolution images
- Long item lists
- Retry on low confidence
- Extra validation calls

## Gemini Model Comparison

| Model | Best For | Accuracy | Speed | Cost | Production Fit |
|---|---|---:|---:|---:|---|
| Gemini 3.1 Pro Preview | Maximum Gemini accuracy | Very high | Medium | Medium-high | Risky preview |
| Gemini 3 Flash Preview | Fast multimodal extraction | High | Fast | Low-medium | Risky preview |
| Gemini 2.5 Pro | Stable complex extraction | High | Medium | Medium | Good |
| Gemini 2.5 Flash | High-volume extraction | Medium-high | Fast | Low | Best Gemini value |
| Gemini 2.5 Flash-Lite | Very cheap simple extraction | Medium | Very fast | Very low | Simple bills only |

## Gemini Pricing

Official listed pricing:

| Model | Input / 1M tokens | Output / 1M tokens |
|---|---:|---:|
| Gemini 3.1 Pro Preview | $2.00 | $12.00 |
| Gemini 3 Flash Preview | $0.50 | $3.00 |
| Gemini 2.5 Pro | $1.25 | $10.00 |
| Gemini 2.5 Flash | $0.30 | $2.50 |
| Gemini 2.5 Flash-Lite | $0.10 | $0.40 |

Prices above are for standard paid tier and short prompts under the higher-context threshold where applicable.

## Gemini Estimated Monthly Cost

Assumption per bill:

- 1 bill image
- 3,000 input tokens
- 1,500 output tokens
- Structured JSON output
- No Batch/Flex discount

Estimated cost per bill:

| Model | Approx Cost / Bill |
|---|---:|
| Gemini 3.1 Pro Preview | $0.024 |
| Gemini 3 Flash Preview | $0.006 |
| Gemini 2.5 Pro | $0.0188 |
| Gemini 2.5 Flash | $0.0047 |
| Gemini 2.5 Flash-Lite | $0.0009 |

Monthly estimate:

| Bills / Month | Gemini 3.1 Pro Preview | Gemini 3 Flash Preview | Gemini 2.5 Pro | Gemini 2.5 Flash | Gemini 2.5 Flash-Lite |
|---:|---:|---:|---:|---:|---:|
| 1,000 | $24 | $6 | $19 | $5 | $1 |
| 5,000 | $120 | $30 | $94 | $23 | $5 |
| 10,000 | $240 | $60 | $188 | $47 | $9 |
| 25,000 | $600 | $150 | $469 | $116 | $23 |

## OpenAI vs Gemini Decision

| Priority | Recommended Model |
|---|---|
| Highest accuracy | OpenAI GPT-5.5 |
| Best OpenAI value | OpenAI GPT-5.4 |
| Lowest cost with acceptable quality | Gemini 2.5 Flash |
| Best Gemini accuracy | Gemini 2.5 Pro |
| Experimental Gemini option | Gemini 3.1 Pro Preview |
| Simple bills at scale | Gemini 2.5 Flash-Lite |

## Final Recommendation For Client

Use this setup:

```txt
Primary: OpenAI GPT-5.5
Fallback: OpenAI GPT-5.4
Cost-saving alternate: Gemini 2.5 Flash
```

For best practical result:

- Run GPT-5.5 for first production version.
- Store extracted JSON preview.
- Show confidence warnings.
- Let user edit before save.
- Track failed/edited fields.
- After 500-1000 real bills, compare accuracy.
- If GPT-5.4 gives similar accuracy, switch to GPT-5.4.
- If cost pressure is high, test Gemini 2.5 Flash.

## Implementation Notes

Backend should:

- Store API key in `.env`.
- Validate image type and size.
- Compress image when safe.
- Send image to model.
- Request strict JSON schema.
- Validate response with backend schema.
- Match item names/barcodes against item master.
- Return mapped bill form payload.
- Never directly create bill.

Frontend should:

- Add Upload Bill Image button.
- Show extraction loading state.
- Fill Create Bill screen.
- Highlight low-confidence fields.
- Allow manual correction.
- Save only after user confirmation.

## Source Links

- OpenAI pricing: https://openai.com/api/pricing/
- OpenAI GPT-5.5 release/pricing notes: https://openai.com/index/introducing-gpt-5-5/
- OpenAI Structured Outputs: https://platform.openai.com/docs/guides/structured-outputs
- OpenAI image pricing notes: https://openai.com/api/pricing/
- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini models: https://ai.google.dev/gemini-api/docs/models
- Gemini Structured Outputs: https://ai.google.dev/gemini-api/docs/structured-output
