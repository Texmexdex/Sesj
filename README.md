# SESJ Field Quote

Phone-first quote and invoice tool for South East Stump Jumpers LLC.
Live page: https://texmexdex.github.io/Sesj/

- One standard pricing engine: person-hours × target pay, grossed up for the 25% business share, plus disposal, crane and saw-wear fees off the top.
- Floors: $150 smallest solo job, $250 per person per day on crew jobs, $300 goal (yellow flag below it).
- Fixed discount buttons, capped, and trimmed so nobody drops under the floor.
- Agreed total for negotiated jobs, with the pay split recalculated.
- Job numbers SJ-YYYY-NNN handed out by the backend, so two phones never collide.
- Quote → Won/Lost → photo checklist → Job complete → printable invoice.
- Works with no signal: saves on the phone and syncs when it's back online.

The old invoice sheets are still here: `invoice-old.html` and `invoice-old-mobile.html`.

## Backend setup (Google Sheet, about 10 minutes, once)

1. Create a new Google Sheet, for example "SESJ Jobs".
2. In the sheet: **Extensions → Apps Script**. Delete what's in `Code.gs` and paste in [`backend/Code.gs`](backend/Code.gs). Save.
3. In Apps Script: **Project Settings (gear icon) → Script properties → Add script property**.
   Name: `PIN`. Value: a PIN only you know. Save.
4. **Deploy → New deployment**. Gear next to "Select type" → **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Deploy, approve the Google permission prompt, and copy the **Web app URL** (ends in `/exec`).
5. Open the live page on your phone → **Rates** tab → **Connection**. Paste the URL and your PIN → **Connect and sync**.
6. Set your real numbers in the Rates tab and tap **Save rates**. They land in the sheet's **Rates** tab.

The sheet gets two tabs on first use:

- **Quotes**: one row per quote/job with readable columns. Changing a row's **Status** (quoted / won / lost / done) in the sheet updates the app. Leave the **ID** and **JSON** columns alone; the app needs them.
- **Rates**: edit a **Value** and every phone picks it up on its next sync (every minute, or when the page is reopened).

Who can get in: the web app URL plus the PIN. The URL is never stored in this repo; each phone enters it once. Anyone with both can read and add quotes, so keep the PIN private.

If you change `Code.gs` later: **Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy**. The URL stays the same.
