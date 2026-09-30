# AI credits

Every eligible user gets **100 free AI credits every day**. Simple AI work uses
a few credits, heavier work uses more, and anyone who runs out can buy exactly
the number of credits they want. This page is for the people who run and
maintain the system.

## The rules a user sees

- The daily free allowance is replaced, not added to, at midnight
  `AI_CREDITS_TIMEZONE` (default `Africa/Douala`). Unused free credits expire.
- Bought credits never expire.
- Free credits are always spent before bought ones.
- A heavy request (above `confirm_above_credits`) shows its estimated cost and
  asks first. A request the user cannot afford is refused before the model is
  called.
- A request that fails costs nothing.
- Executives are not charged (configurable); their usage is still recorded.

## Questions sent as photos

A student can attach up to `AI_CHAT_MAX_IMAGES` photos (default 3) to a chat
question, with or without text. The apps shrink each photo on the device
before sending it. The server opens and checks every image, refuses anything
that is not a readable JPG, PNG, WebP or GIF, and sends it to
`GROQ_VISION_MODEL` (default `meta-llama/llama-4-scout-17b-16e-instruct`;
the default text model cannot read images). Photos are never stored.

A photo question is charged as the `image_question` feature. Its cost is:

- the tokens the picture actually used;
- the feature multiplier (1.5 by default);
- `per_image_credits` (5 by default) for each photo.

The estimate assumes `estimated_tokens_per_image` for each photo. With the
default rates, a typical photo question costs about 15 to 25 credits, against
5 to 12 for the same question typed.

## How a request is charged

1. **Estimate.** `credit_engine.estimate_request` counts the system prompt,
   the user's text and a typical answer length for the feature (chat questions
   are classified simple, normal, detailed or complex from their wording).
2. **Check.** `require_affordable` answers 402 `ai_credits_insufficient` if the
   balance is short, or 409 `ai_credits_confirmation_required` if the request is
   heavy and the app can ask. Apps say they can ask with `X-AI-Credits-Client`,
   and confirm with `X-AI-Credits-Confirm: 1`. Older installed builds do not
   send the client header, so they are never asked, only refused when short.
3. **Hold.** The estimate is set aside (`AICreditHold`) against the new
   `AIRequest`.
4. **Meter.** The feature's work runs inside `credit_engine.metered(...)` (or
   under the `@credit_engine.meters(...)` decorator). Every `call_groq_api`
   call made inside it reports its input, output and cached tokens.
5. **Settle or release.** If the request completed, the hold is settled at the
   real cost: any difference goes back, and an overrun is taken only if the
   balance has it (the rest is waived, never negative). If it failed, the hold
   goes back in full. Holds whose worker died are returned by the
   `release_stale_ai_credit_holds` beat task every 10 minutes.

Real cost in credits:

```
ceil((fresh_input/1000 * in_rate + cached_input/1000 * cached_rate + output/1000 * out_rate)
     * feature_multiplier * model_multiplier) + documents * per_document_credits
at least minimum_charge; a response served from cache costs cached_response_credits
```

Defaults: 1 credit per 1,000 input tokens, 0.25 per 1,000 cached input
tokens, 5 per 1,000 output tokens, minimum 3. A plain chat question costs
about 3 to 5 credits; a worked problem or long explanation costs 10 to 15; a
generated exam paper costs 15 to 25. Rates and multipliers are starting
points, to be tuned from the economics dashboard.

## Where the money is safe

- **Balances** change only through a compare-and-swap UPDATE that retries on
  conflict, so concurrent requests cannot double-spend. The database also
  refuses a negative balance (`CHECK` constraints).
- **The ledger** (`AICreditTransaction`) records every movement. A purchase or
  a usage charge is unique per reference (`gw:<transaction id>`, `ai:<request
  id>`), so a payment reported twice credits once.
- **Purchases** go through Fapshi like every other payment: the price is
  calculated on the server from the number of credits, and credits are added
  only after Fapshi itself confirms the full amount, through the status check,
  the webhook or `reconcile_fapshi_payments`, whichever comes first.
  The generic `fapshi/collect/` endpoint refuses the `ai_credits` purpose.

## Configuration

Everything that affects pricing lives in the one `AICreditConfig` row, edited
from the dashboard's **AI Economics > Configuration** tab (CEO, CTO and Super
Admin only; other executives can read it) or Django admin:

- daily free credits
- credits per photo and tokens per photo
- price per credit (FCFA)
- minimum and maximum purchase
- token rates
- feature and model multipliers
- per-feature estimates
- cached-response cost
- policy for answers cut off at their length limit
- confirmation and low-balance thresholds
- provider costs per model
- payment gateway share and server cost per request

**Purchases stay closed until a price per credit is set.** That is deliberate:
the price should be chosen from the **AI Economics > Overview** figures (AI
cost per credit, break-even price, cost of the free allowance per user per
day), after the provider rates have been checked against the real invoice.

## Endpoints (`/api/v1/ai/`)

| Method | Path | Who |
|---|---|---|
| GET | `credits/` | balance |
| POST | `credits/estimate/` | estimate a request |
| GET | `credits/history/` | the user's ledger (`?kind=AI_USAGE,PURCHASE`) |
| GET | `credits/usage/` | usage by feature and day (`?days=30`) |
| GET | `credits/pricing/?credits=350` | server price for a number of credits |
| POST | `credits/purchase/` | start a mobile money purchase |
| GET | `credits/purchase/<transaction_id>/` | purchase status (re-checks Fapshi) |
| GET/PATCH | `credits/admin/config/` | executives / CEO, CTO, Super Admin |
| GET | `credits/admin/economics/?days=30` | executives |
| GET | `credits/admin/account/?user=<matricule>` | executives |
| POST | `credits/admin/adjust/` | CEO, CTO, Super Admin |

`chat/quota/` still answers in its old shape, from credits, for app builds
installed before credits existed.

## Deploying

```bash
python manage.py migrate ai_features
python manage.py migrate fees
```

Restart Celery beat so the stale-hold task is scheduled. Set
`AI_CREDITS_TIMEZONE` if the platform should not follow Cameroon's midnight.
