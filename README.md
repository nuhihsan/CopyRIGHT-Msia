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
- **Simple mode:** hides the advanced settings until they're needed.

## How to use it

The app is built as a Claude artifact. The writing tools, image reading, online saving and downloads all use Claude's artifact runtime, so open it from Claude (claude.ai or the Claude app) while signed in.

Opened outside Claude (for example locally or on GitHub Pages), the page still loads. Client profiles, saved styles, term checks, file reading for Word, PDF and PowerPoint, and history all work, with everything saved in that browser. The AI tools and downloads won't work there.

## Files

- `index.html`: the whole app (HTML, CSS and JavaScript in one file)
- `lib/`: third-party libraries the app loads when they're needed

## Notes

- Follow your agency's rules on AI tools. Don't paste confidential client material unless the agency allows it.
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
