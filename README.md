# WhatsApp Easy Automation

A small self-hosted panel that automates WhatsApp with visual workflows.

You scan a QR code to link your WhatsApp, then draw a flow on the canvas: something happens (an email arrives, someone sends you a command, a webhook is called) and the flow takes care of the rest — sending messages, inviting people to a group, checking whether they joined, and so on.

No cloud service, no database server. Everything runs on your own machine and stores data in a single SQLite file.

## What it can do

- **Visual editor** — drag steps onto the canvas, connect them, save.
- **Four trigger sources** — email over IMAP, incoming WhatsApp messages, a Telegram bot, or an HTTP webhook.
- **Real filtering** — react only to a specific sender, or only to a command like `/add`. Numbers can be taken from the message text, from the sender, or from a JSON field.
- **40+ steps** — text, image, video, document, audio, location, contact card, group invite and add, remove, promote, group admin actions, profile updates, true/false checks, wait, and HTTP requests to any API.
- **Multiple numbers** — link as many WhatsApp accounts as you need.
- **Safety settings** — random delay between actions and a daily limit per account.
- **API keys** — create them in the panel with `admin` or `webhook` scope.

## Requirements

Node.js 18 or newer.

## Install

```bash
git clone https://github.com/qiyascc/whatsapp-easy-automation.git
cd whatsapp-easy-automation
npm install
AUTH_TOKEN=pick-a-long-random-token npm start
```

Open `http://127.0.0.1:9333` and sign in with the token you just set.

## First steps

1. **Dashboard → New session**, then scan the QR with WhatsApp (Settings → Linked devices).
2. **Integrations** — set the mailbox, the Telegram bot token, the delays and the default group.
3. **Workflows → New workflow** — drop an *Event Trigger*, pick a source, connect the steps you want, then enable it.

A quick example: an *Event Trigger* listening to WhatsApp, set to the command `/add`, allowed only from your own number, connected to *Add to Group*. Now sending `/add +994501234567` from your phone adds that person to the group.

## Settings

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `9333` | Port to listen on |
| `HOST` | `127.0.0.1` | Interface to bind |
| `AUTH_TOKEN` | empty | Panel password. Always set it if the port is reachable from outside |
| `APP_SECRET` | empty | Key used to encrypt stored passwords |
| `TRUST_PROXY` | `0` | Set to `1` when running behind nginx |

Put nginx with HTTPS in front of it if you expose the panel to the internet.

## Webhooks

Create a key in the **API Keys** tab, then post anything you want to it:

```bash
curl -X POST https://your-domain.com/api/hooks/wak_live_xxxxxxxx \
  -H 'Content-Type: application/json' \
  -d '{"text":"/add +994501234567","sender":"my-shop"}'
```

The whole JSON body is available inside the flow as `{{payload.…}}`.

## Good to know

This project talks to WhatsApp through Baileys, which is not an official client. Sending unsolicited messages or adding strangers to groups goes against the WhatsApp Terms of Service and can get the number banned. Delays and daily limits lower the risk but do not remove it. Use it for people who actually want to hear from you.

## License

MIT. Do whatever you want with it.

## Contact

- WhatsApp: [wa.me/+994509894622](https://wa.me/+994509894622)
- Telegram: [t.me/qiyascc](https://t.me/qiyascc)
- Instagram: [instagram.com/qiyascc](https://instagram.com/qiyascc)
- LinkedIn: [linkedin.com/in/qiyascc](https://linkedin.com/in/qiyascc)
