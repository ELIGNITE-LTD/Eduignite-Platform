# EduIgnite AI on Telegram

Anyone can use EduIgnite AI from Telegram, with or without an EduIgnite
account. The bot is the same assistant as in the apps, paid for in the same
AI credits.

## What people can do

- Ask any school question, in English or French.
- Send a photo of a question (up to 3 at once); the vision model reads it.
- Tap **PDF** under any answer to download it. Answers with a graph, chart,
  flowchart or labelled diagram **always arrive as a PDF**, drawn exactly as
  in the apps.
- `/balance`, `/history`, `/new` (fresh conversation), `/language`.
- `/buy 500`, then share or type a mobile money number. Fapshi prompts the
  phone, and the bot announces the credits when payment is confirmed.
- `/link` connects an EduIgnite account (the app shows a one-tap link or a
  code under **AI Credits → Connect Telegram**).

People without an account get a guest account (role `AI_GUEST`) with
**30 free credits a day**. Linking an account switches to its 100 a day, and
moves any credits the guest bought onto the real account.

## Turning it on

1. **Create the bot (you, once).** In Telegram, open **@BotFather**:
   - send `/newbot`;
   - name it "EduIgnite AI";
   - pick a username ending in `bot`, for example `EduIgniteAIBot`.

   BotFather gives you a token. Keep it secret.
2. **Set the server settings** (AWS SSM, like the other secrets):
   - `TELEGRAM_BOT_TOKEN`: the token from BotFather.
   - `TELEGRAM_WEBHOOK_SECRET`: any long random string, for example from
     `python -c "import secrets; print(secrets.token_urlsafe(32))"`.
   - `TELEGRAM_BOT_USERNAME`: the bot's username, without the @.
   - `BOTS_PUBLIC_API_URL`: `https://api.eduignite.online`.
3. **Deploy**, then on the server run:

   ```bash
   python manage.py telegram_setup
   ```

   This registers the webhook (signed with the secret) and sets the command
   menu and description in English and French.
   `python manage.py telegram_setup --remove` switches the bot off.

## How it works

- `POST /api/v1/bots/telegram/webhook/` checks Telegram's secret header and
  ignores repeated deliveries (`ProcessedUpdate`). The work itself runs in
  Celery, so Telegram gets its answer immediately.
- `apps/bots/handlers.py` turns each update into a reply. Questions go
  through `apps.ai_features.assistant.answer`, the same function the app's
  `/ai/chat/` uses. That means the same pricing, the same holds and the same
  refunds, with `channel = telegram` on every usage record. AI Economics
  shows usage by channel.
- Answers are converted to Telegram's HTML (`apps/bots/formatting.py`):
  - LaTeX becomes real symbols (x², √, ≤, π);
  - tables become monospace;
  - long answers are split.
- PDFs (`apps/bots/rendering.py`) are printed by headless Chromium from the
  website's `/print/ai-answer` page. The answer reaches that page through a
  one-time token, never in the URL. If the browser is unavailable, a plainer
  text PDF is sent instead. The Docker image installs Chromium via
  Playwright.

## Diagrams the assistant can draw

The apps and the PDFs draw these fenced blocks:

| Block | For |
|---|---|
| `graph` | function plots, number lines, bar / line / area / pie charts |
| `mermaid` | flowcharts, sequences, timelines |
| `figure` | labelled diagrams: shapes, arrows, angles, circuit symbols, with labels laid out in columns beside the drawing |
| `figure` + `"template"` | textbook biology diagrams: `animal-cell`, `plant-cell`, `bacterium`, `flower`, `leaf-section`, `heart`, `eye`, `neuron`, with English or French part names |

The templates live in `apps/*/src/lib/ai-figure-templates.ts`. The list of
templates and parts the assistant is told about (`FIGURE_TEMPLATES` in
`apps/ai_features/utils.py`) is checked against that file by
`tests_prompt.FigureTemplateListTests`. Add a part or a template in both
places, and the test will tell you if you missed one.
