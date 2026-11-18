# UN/FOLD entrance scanner

Camera scan → protected n8n webhook → mark the correct registration `Present` in Google Sheets. The same QR codes in the existing email tickets work.

## Configure the sheet and n8n

1. In **Raise Worship Concert 2026 → Form Responses 1**, add `Check-in Status` and `Checked In At` as new headers at the right of row 1. The existing `Ticket Code`, `Payment Status`, `First Name`, and `Last Name` headers are used for lookup. Clear neither the ticket code nor the email delivery status.
2. Import `UNFOLD_Checkin_Webhook.json` in n8n. In **Read registrations** and **Mark Present**, select the same Google Sheets credential, document, and tab as your existing ticket sender. Check that **Mark Present** matches `row_number` and writes only `Check-in Status` and `Checked In At`. Use a test tab first. Keep the underlying response tab append-only during the event and use a filter view for sorting.
3. In **Scan webhook**, create a **Header Auth** credential. Set the name to `X-Checkin-Key` and the value to a random secret of at least 24 characters. Publish/activate the workflow and copy its **Production URL**. Keep this secret on the server.

## Deploy on Hostinger

1. Create a DNS record for the scanner hostname pointing to your VPS. The example uses `checkin.example.com`. Use the same DNS/TLS setup as your n8n hostname.
2. Copy this folder to the VPS. Run `cp .env.example .env`, then set the two secrets and the production webhook URL in `.env`. Generate strong random secrets with `openssl rand -hex 24` and use separate values. Set `SCANNER_HOST` and `SCANNER_ORIGIN` to match your DNS record. If your network is named differently, set `TRAEFIK_NETWORK` to the actual Traefik Docker network.
3. From this folder run `docker compose up -d --build`. Open the scanner hostname in a phone browser. The username is `gate`, and the password is the `STAFF_PASSWORD` from `.env`. Share it with entrance staff. Camera access requires HTTPS. Staff can use the browser or add the page to their home screen where supported.

## Test at the gate

Use an issued test ticket from a row marked `Paid`. Tap **Start camera** and point the camera at its QR. Verify the phone shows **Present**, and the sheet records `Present` and a timestamp on the matching row. Scan it again and verify **Already present** and the original timestamp. Also test a valid-format QR with no matching row.

Run one scanner server instance and route all entrance phones through it. It queues webhook calls so check-ins are processed in order. The n8n workflow has a shorter execution timeout than the scanner proxy request timeout. Check-in needs a live connection to the VPS and Sheets. If a request fails, the scanner displays an unverified result and staff can scan again.

## Update an existing scanner deployment

Extract the revised ZIP over the current scanner project directory. The ZIP contains `.env.example`; keep your existing `.env`. From that directory run `docker compose up -d --build unfold-scanner`, then reopen the scanner URL on your phone. This design update uses the existing n8n webhook configuration.
