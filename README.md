# SNAPBOOTH — K-Style Photobooth Studio

An architectural, tactile web-based photobooth app inspired by Korean self-photo booth culture (Life Four Cuts, Haru Film). The camera, editor, downloads, and native photo sharing run in the browser. Optional expiring photo links use Netlify Functions and Netlify Blobs.

**Live Studio App:** [https://snapboothbyjames.netlify.app/](https://snapboothbyjames.netlify.app/)

---

## Key Features

- **Shot Selection First:** Choose 2, 3, 4, or 6 shots prior to camera activation. The selection dynamically configures photo sequence counts, review grids, and layout geometries.
- **WebRTC Camera Engine:** Real-time webcam feed with configurable timer countdowns (3S, 5S, 10S), photo flash effect, sound cues, selfie mirror toggle (`MIRROR: ON / OFF`), and front/rear camera lens switching.
- **Live Camera Filters:** Preview and snap photos with real-time filters (`RAW`, `B&W`, `COOL`, `WARM`).
- **Fail-Safe Fallback Mode:** Automatic studio demo mode and image upload fallback if webcam permissions are denied or unavailable.
- **Shot Review & Position Swap:** Inspect captured shots in a review grid, swap photo frame positions (`<` / `>`), or retake individual shots without resetting the sequence.
- **4 Photo Aspect Ratios:**
  - **PORTRAIT (3:4):** Classic studio portrait frame.
  - **LANDSCAPE (4:3):** Horizontal widescreen layout.
  - **SQUARE (1:1):** Grid-style formatting.
  - **MOBILE (9:16):** Tailored 1080x1920 story & wallpaper format for mobile phones.
- **Studio Design Engine:**
  - **Preset Themes:** Classic, Minimal, Haru Blue, Black Film, Pastel Pink, Vintage, Party Y2K, Editorial.
  - **Frame Palette:** Custom RGB color picker + rapid preset swatches.
  - **Photo Filters:** B&W, Vintage, Sepia, Warm Tone, Cool Blue, Contrast, Leica Bright.
  - **Typography Controls:** Custom Main Title, Subtitle (Default: `SNAPBOOTHBYJAMES`), Font Styles, and Date Stamp (`YYYY.MM.DD`).
  - **Touch-Stretch Stickers:** Drag stickers onto the strip and stretch/resize them in real-time using the corner handle.
  - **Digital Touch Pen & Freehand Drawing Layer:** Draw doodles, write autographs, draw hearts, or write handwritten notes directly over the frame.
  - **Photo Corner Styles:** Toggle between Sharp cut edges and Rounded smooth photo corners.
- **300 DPI High-Res Export & Mobile Transfer:**
  - Pure HTML Canvas rendering for high-res JPG and PNG file downloads.
  - Blob object URLs for reliable saving across mobile Safari, Chrome, and desktop browsers.
  - **Share Photo:** Opens the device's native share menu with the finished JPEG where file sharing is supported. Unsupported browsers offer local saving and optional link creation. Cancelling the share menu does not upload anything.
  - **Save / QR Modal:** Tap-and-hold mobile photo saving plus an explicit **Create Link & QR** action. The QR points to the finished strip's download page.
  - **Expiring Links:** Choose 15 minutes, 1 hour (default), or 24 hours. Only the finished strip is uploaded, and QR images are generated locally without sending the link to a QR service.

---

## Tech Stack

- **HTML5 & WebRTC** (`navigator.mediaDevices.getUserMedia`)
- **Tailwind CSS** (via CDN for sharp brutalist studio UI)
- **Vanilla JavaScript (ES6+)**
- **HTML5 Canvas API** (for 300 DPI image rendering and center-crop exports)
- **Web Audio API** (synthesized sound effects)
- **Netlify Functions + Blobs** (optional temporary photo storage)
- **qrcode-generator** (locally generated QR images)

---

## Build and test

Use Node.js 22 or newer:

```sh
npm ci
npm test
npm run build
```

On PowerShell systems that block `npm.ps1`, use `npm.cmd` for these commands. The build writes the studio, shared-photo page, and local QR library to `dist/`.

Optional browser verification: run `npm run test:browser` with Chrome or Edge installed. Set `SNAPBOOTH_TEST_BROWSER` to the browser executable if it is not in a standard Windows location. This check uses synthetic photos and an isolated local store, decodes the generated QR, and verifies recipient downloads and expiry.

## Deploy with expiring photo links

1. Connect this repository to the existing Netlify site using a Git-based deployment, or deploy through Netlify CLI with function support.
2. Use the included `netlify.toml`: build command `npm run build`, publish directory `dist`, functions directory `netlify/functions`.
3. Deploy the site. [Netlify supplies Blobs credentials to Functions automatically](https://docs.netlify.com/build/data-and-storage/netlify-blobs/); no storage secret belongs in the HTML.
4. Export a strip, open **Save / QR**, choose an expiry, and select **Create Link & QR**. Scan the code on another device to preview and download that strip.

The photo endpoint checks expiry on every request and sends `no-store` headers. Expired links stop serving the image immediately, even before the hourly cleanup deletes expired stored photos. Copies already downloaded to a device remain on that device. Files larger than 4 MiB can still be downloaded or shared directly, but cannot be uploaded as temporary links.

To exercise the Functions and Blobs locally, run `netlify dev` from the repository using an installed [Netlify CLI](https://docs.netlify.com/cli/get-started/). The automated tests use an isolated in-memory store and require no Netlify account or live photo uploads.

Static hosts, including GitHub Pages and static-only Netlify Drop uploads, can serve the contents of `dist/` for the studio, downloads, and [native file sharing where supported](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share). Temporary links require the Netlify Functions deployment; static-only hosts show a fallback message when link creation is attempted.

Webcams and native sharing require a secure HTTPS context (or localhost for development).

---

## Repository Structure

```text
snapbooth/
├── snapbooth_photobooth_app.html  # Studio source; built as dist/index.html
├── sharing.js                    # Native sharing and opt-in link/QR flow
├── shared.html / shared.js       # Recipient preview and download page
├── server/photo-sharing.mjs      # Expiry, upload, retrieval, and cleanup logic
├── netlify/functions/            # Netlify storage and scheduled cleanup adapters
├── netlify.toml                  # Build and Functions configuration
├── scripts/build.cjs             # Static asset packaging
└── tests/                        # Camera and sharing regression tests
```

## License

Distributed under the MIT License. Feel free to remix, customize, and share!
