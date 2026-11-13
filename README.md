# CopyRIGHT-Msia

**Meja Copy BM** is a small web app for Bahasa Melayu copywriters in Malaysian advertising. It turns English copy into natural Malaysian BM in each client's voice, and helps writers learn from their editors' corrections.

## Features

- **Transcreate:** English to Malaysian BM in 1, 3 or 5 versions. A formality slider runs from Baku to Bahasa pasar. Options include flavour (Gen Z, Rojak, Festive, Corporate), Malaysian dialects (Kelantan, Terengganu, Utara, Perak, Pahang, Negeri Sembilan, Melaka, Johor, Sarawak, Sabah or a custom one), Rumi or Jawi script, and saved styles.
- **Variants:** headlines, CTAs and captions counted against platform character limits.
- **Client tone:** a profile for each client (tone, preferred terms, banned words, approved samples). "Learn from a correction" turns an editor's edits into reusable rules.
- **Brief decoder:** pulls out the key message, mandatories, deliverables and questions to ask from a brief.
- **Check copy:** checks client terms, BM grammar and spelling, 3R and religious sensitivity, and ad claims risk.
- **My copy:** an automatic history of everything written, with search, filters and stars.
- **Uploads:** reads Word, PDF, PowerPoint, text files and images.
- **Downloads:** exports to Word, PDF, PowerPoint, an Excel copy deck, or text.
- **Trends:** a weekly board of what Malaysia is talking about, with risk labels, upcoming dates and a personal slang bank. A "Trend-aware" switch lets copy draw on them.
- **Simple mode:** hides the advanced settings until they're needed.

## Two versions

| | Claude version | Free version |
|---|---|---|
| Where | `index.html` at the repo root, published as a Claude artifact | `docs/`, served by GitHub Pages |
| AI | Claude, on the viewer's own Claude account | Gemini, then SEA-LION, then Groq, on the owner's free keys |
| Middleman | None needed | `worker/worker.js` on Cloudflare Workers (free) |
| Saving | The viewer's Claude account, or the browser | The browser, plus the Backup button |
| Trends | Weekly Claude scheduled task | The Worker's weekly cron |
| Privacy switch | Not needed | 🔒 Confidential mode skips free Gemini |

**Setting up the free version:** follow [SETUP.md](SETUP.md). It takes about 30 minutes and needs no credit card.

## Files

- `index.html`, `lib/`: the Claude version
- `docs/index.html`, `docs/lib/`: the free version (GitHub Pages)
- `worker/worker.js`: the Cloudflare Worker for the free version
- `worker/wrangler.toml`: only needed if you deploy the Worker from the command line
- `SETUP.md`: step-by-step setup for the free version

## Notes

- Follow your agency's rules on AI tools. Don't paste confidential client material unless the agency allows it. In the free version, use 🔒 Confidential mode for client work.
- Dialect and Jawi output are first drafts. Have a native speaker or proofreader check them before client use.
- Sensitivity and claims checks are a first pass, not legal or client approval.

## Third-party libraries

| Library | Used for | Licence |
|---|---|---|
| mammoth | Reading Word files | BSD-2-Clause |
| pdf.js (pdfjs-dist 3.11) | Reading PDFs | Apache-2.0 |
| JSZip | Reading PowerPoint files | MIT or GPL-3.0 (dual) |
| docx | Word export | MIT |
| PptxGenJS | PowerPoint export | MIT |
| jsPDF | PDF export | MIT |
| html2canvas | PDF export | MIT |
| SheetJS (xlsx mini) | Excel export | Apache-2.0 |
