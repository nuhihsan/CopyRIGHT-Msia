# Setting up the free version of Meja Copy Hannah

This puts the app on a normal website that runs on **your** free accounts. She doesn't need a Claude account. Expect about 30 minutes. No credit card is needed for any step.

**How it fits together**

```
Her phone or laptop  ──>  GitHub Pages (the app)  ──>  Cloudflare Worker (keeps the keys secret)
                                                          ├─ 1. Gemini     (best Malay, reads images)
                                                          ├─ 2. SEA-LION   (backup, made for Southeast Asian languages)
                                                          └─ 3. Groq       (last resort, very fast)
```

The Worker tries Gemini first. If Gemini is busy, at its daily limit or down, it moves to SEA-LION, then to Groq. The app shows which one wrote each result.

---

## Step 1: Get three free AI keys (10 minutes)

Keep the keys somewhere private, like a password manager. Never paste them into the app, GitHub or a chat.

1. **Gemini:** go to **aistudio.google.com**, sign in with a Google account, click **Get API key**, then **Create API key**. Copy it.
2. **SEA-LION:** go to **playground.sea-lion.ai**, sign in, open the **API Key** page and create a key. If the page has moved, **docs.sea-lion.ai** explains where to find it.
3. **Groq:** go to **console.groq.com**, sign in, open **API Keys**, click **Create API Key**. Copy it.

Also pick a **passcode** for her, at least 10 characters. This is what stops strangers from using your keys.

## Step 2: Create the Cloudflare Worker (10 minutes)

1. Go to **dash.cloudflare.com** and sign up (free).
2. Open **Workers & Pages**, click **Create**, choose **Create Worker** (the "Hello World" starter), name it `meja-copy`, and click **Deploy**.
3. Click **Edit code**. Delete everything in the editor, paste the whole contents of [`worker/worker.js`](worker/worker.js) from this repo, and click **Deploy**.
4. Go back to the Worker, open **Settings**, then **Variables and Secrets**, and add these. Use type **Secret** for the first four:

   | Name | Type | Value |
   |---|---|---|
   | `PASSCODE` | Secret | the passcode you picked |
   | `GEMINI_API_KEY` | Secret | your Gemini key |
   | `SEALION_API_KEY` | Secret | your SEA-LION key |
   | `GROQ_API_KEY` | Secret | your Groq key |
   | `ALLOWED_ORIGIN` | Text | `https://nuhihsan.github.io` |

5. Copy the Worker's address. It looks like `https://meja-copy.YOURNAME.workers.dev`.

**Check it:** open that address in a browser. You should see `{"ok":true,"app":"Meja Copy Hannah worker"}`.

### Storage for sync and trends (5 minutes)

This is needed for syncing her data between devices and for the weekly trend board.

1. In Cloudflare, open **Storage & Databases**, then **Workers KV**, and create a namespace called `meja-store`.
2. In your Worker, open **Settings**, then **Bindings**, click **Add binding**, choose **KV namespace**, set the variable name to `STORE` and pick `meja-store`.
3. Still in **Settings**, open **Trigger Events**, add a **Cron Trigger** and enter `39 23 * * 0`. That's every Monday at 7:39am Malaysia time, for the trend board.

The Worker reads Google Trends Malaysia plus Malaysian news feeds, then asks the AI to build the board. In the app, the **⚙ Connection** page has a **Refresh trends now** button for the first run.

## Step 3: Turn on GitHub Pages (2 minutes)

1. Merge the pull request in this repo, if you haven't yet.
2. In the repo, open **Settings**, then **Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, branch **main**, folder **/docs**, and click **Save**.
4. After a minute or two the app is live at **https://nuhihsan.github.io/CopyRIGHT-Msia/**

## Step 4: Connect her phone (1 minute)

Send her this link, with your Worker address at the end:

```
https://nuhihsan.github.io/CopyRIGHT-Msia/?w=https://meja-copy.YOURNAME.workers.dev
```

She opens it, taps **⚙**, types the passcode and taps **Save and test**. It should say **Connected ✓** and list the three AIs. Tell her the passcode in person or by phone, not in the same message as the link.

## Step 5: Turn on sync (2 minutes, on her laptop first)

1. On her laptop, under **⚙**, tap **Turn on sync** and create a **sync password**. This is hers alone, separate from the passcode. You don't need to know it.
2. The app shows a **recovery code** once. She should copy it into a password manager or notes app, or download it, then tick "I've saved it".
3. On her phone, open the app, tap **⚙**, **Turn on sync**, and type the same sync password. Her clients, rules, styles, slang bank and history appear.

From then on, changes sync by themselves a few seconds after she makes them, and whenever she opens the app.

---

## Privacy: the 🔒 button

- **Free Gemini** may use what she sends to improve Google's products, and people at Google may read it. That's fine for practice, but not for real client briefs.
- **🔒 Confidential mode** (the lock at the top of the app) skips Gemini and uses SEA-LION or Groq instead. She can also tick **Always confidential** on a client's profile, so it switches on automatically for that client.
- Reading screenshots and photos needs Gemini, so it pauses while the lock is on. Word, PDF and PowerPoint uploads still work.
- **If you later prepay $5 for Gemini** in AI Studio, Google stops using the data. Then add a Text variable `GEMINI_PAID` = `true` in the Worker, and Confidential mode will keep using Gemini.

## Changing things later

All of these are Worker variables (type Text). No code changes are needed.

| Variable | What it does | Default |
|---|---|---|
| `PROVIDER_ORDER` | Which AIs to try, in order | `gemini,sealion,groq` |
| `GEMINI_MODEL` | Gemini model name | `gemini-flash-latest` |
| `SEALION_MODEL` | SEA-LION model name | `aisingapore/Qwen-SEA-LION-v4.5-27B-IT` |
| `GROQ_MODEL` | Groq model name | `openai/gpt-oss-120b` |
| `GEMINI_PAID` | `true` once Gemini is prepaid | `false` |

**Spare slot for OpenAI:** add a Secret `OPENAI_API_KEY` and put `openai` into `PROVIDER_ORDER`, for example `openai,gemini,sealion,groq`.

**Extra free backup:** add a **Workers AI** binding named `AI` in the Worker's Bindings, then add `workersai` to `PROVIDER_ORDER`. It runs SEA-LION on Cloudflare's own free daily allowance.

## If something goes wrong

| What she sees | What to do |
|---|---|
| "Wrong passcode" | Re-type the passcode under ⚙. Check `PASSCODE` in the Worker. |
| "Couldn't reach the server" | Check the Worker address under ⚙ starts with `https://` and opens in a browser. |
| "The AI keys aren't set up" | One or more keys are missing in the Worker's Variables and Secrets. |
| A provider shows "no key" under ⚙ | Add that key, or remove it from `PROVIDER_ORDER`. |
| Everything comes from the backup | Gemini may have renamed its models. Set `GEMINI_MODEL` to a current name from AI Studio. Same idea for SEA-LION and Groq. |
| "All the AIs are busy or at their daily limit" | Free limits reset daily. Try later, or add the Workers AI backup. |
| The app doesn't load from another site | `ALLOWED_ORIGIN` must be exactly `https://nuhihsan.github.io`. |
| Sync says it isn't set up | Add the KV binding named `STORE` (Step 2, Storage). |
| "That password didn't work" on sync | Check caps lock, or use Forgot password with the recovery code. |

To see why a request failed, open the Worker in Cloudflare and check **Logs**. Lines starting with `[meja]` show which AI failed and why.

## Her data and sync

- Each device keeps its own copy in the browser. With sync on, the devices share one locked copy stored in your Cloudflare KV.
- That copy is **encrypted on her device** with a key protected by her sync password (AES-256-GCM, with the key derived using PBKDF2). The server, Cloudflare and you only ever see scrambled data.
- **Forgot the sync password?** Under ⚙, tap Turn on sync, then **Forgot password?** and enter the recovery code. If any of her devices still has sync on, she can also tap **Change password** there without the old one.
- **Lost the password and the recovery code, with no device synced?** Use **Start sync over from this device**. Only the synced copy is deleted. What's on each device stays, and syncs again after she sets a new password.
- **New recovery code** (on an unlocked device) makes a fresh code and stops the old one working. Use it if someone else may have seen the old code.
- The **Backup** button in Client tone still works as an extra safety copy.
- If she uses two devices within the same minute, give it a moment: Cloudflare storage can take up to a minute to show the newest copy everywhere.
