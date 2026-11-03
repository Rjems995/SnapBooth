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
- **Photo Cropping & Reordering:** In the editor's **Photos** tab, drag each photo to reposition it, pinch or use the 100–300% zoom slider, and reset any individual crop. Drag a grip to change photo order in the editor or review screen; arrow keys and move buttons also work. Crops follow their photos and are applied to exports and shared images. Retaking a photo resets only its crop.
- **Mobile Editor:** Larger text and 44px controls, a persistent strip preview, independently scrolling settings, and a bottom **Finish & Save** action. Short landscape screens put the preview alongside settings. **Expand Preview** opens a larger scrollable view for drawing and inspecting long strips.
- **Local Draft Recovery:** Photos and design changes save automatically in this browser. After a refresh, choose **Resume your last session** or **Delete Draft** on the homepage. Drafts include crops, order, theme, text, stickers, drawings, and export choice. Partial captures can resume taking the remaining shots. Draft photos stay on the device; creating a temporary share link remains a separate action.
- **Finished-Strip Homepage:** Tap Black Film, Pastel Pink, or Haru Blue to start with that theme. New sessions also use the example's photo count, square framing, and layout; you can change the count before opening the camera. Choosing a theme with photos already in progress keeps those photos and their layout. The examples sit beside **Start Photobooth**, with the headline “Your moments, your photo strip.” The fictional demo portraits and generation prompt are documented in [`assets/README.md`](assets/README.md).
- **4 Photo Aspect Ratios:**
  - **PORTRAIT (3:4):** Classic studio portrait frame.
  - **LANDSCAPE (4:3):** Horizontal widescreen layout.
  - **SQUARE (1:1):** Grid-style formatting.
  - **MOBILE (9:16):** Tall individual photo framing. Export presets separately size the complete image for stories, wallpapers, or prints.
- **Studio Design Engine:**
  - **Preset Themes:** Classic, Minimal, Haru Blue, Black Film, Pastel Pink, Vintage, Party Y2K, Editorial.
  - **Frame Palette:** Custom RGB color picker + rapid preset swatches.
  - **Photo Filters:** B&W, Vintage, Sepia, Warm Tone, Cool Blue, Contrast, Leica Bright.
  - **Typography Controls:** Custom Main Title, Subtitle (Default: `SNAPBOOTHBYJAMES`), Font Styles, and Date Stamp (`YYYY.MM.DD`).
  - **Touch-Stretch Stickers:** Drag stickers onto the strip and stretch/resize them in real-time using the corner handle.
  - **Digital Touch Pen & Freehand Drawing Layer:** Draw doodles, write autographs, draw hearts, or write handwritten notes directly over the frame.
  - **Photo Corner Styles:** Toggle between Sharp cut edges and Rounded smooth photo corners.
- **Export Presets & Mobile Transfer:**
  - Export the original design, Instagram Story (1080×1920), Phone Wallpaper (1440×2560), 2×6-inch Strip (600×1800), or 4×6-inch Print (1200×1800).
  - Presets size the complete image and fit the entire design without cutting off photos, text, or decorations. Extra space uses the frame color. The photo orientation control continues to set individual photo framing.
  - Print presets include 300-DPI density metadata in JPEG and PNG files. Browser downloads, native sharing, QR transfer, and full-image previews use the selected output size.
  - Blob object URLs for reliable saving across mobile Safari, Chrome, and desktop browsers.
  - **Share Photo:** Opens the device's native share menu with the finished JPEG where file sharing is supported. Unsupported browsers offer local saving and optional link creation. Cancelling the share menu does not upload anything.
  - **Save / QR Modal:** Tap-and-hold mobile photo saving plus an explicit **Create Link & QR** action. The QR points to the finished strip's download page.
  - **Expiring Links:** Choose 15 minutes, 1 hour (default), or 24 hours. Only the finished strip is uploaded, and QR images are generated locally without sending the link to a QR service.

---

## Tech Stack

- **HTML5 & WebRTC** (`navigator.mediaDevices.getUserMedia`)
- **Tailwind CSS** (compiled into local CSS during the build; CDN fallback in the source HTML)
- **Vanilla JavaScript (ES6+)**
- **HTML5 Canvas API** (for cropped photo layouts and whole-image export presets)
- **IndexedDB** (local draft state and photo storage; unchanged photos are stored once)
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

On PowerShell systems that block `npm.ps1`, use `npm.cmd` for these commands. The build writes the studio, compiled styles, shared-photo page, and local QR library to `dist/`.

Optional browser verification: run `npm run test:browser` with Chrome or Edge installed. Set `SNAPBOOTH_TEST_BROWSER` to the browser executable if it is not in a standard Windows location. These checks use synthetic photos and isolated local storage. They verify QR downloads and expiry, mobile and desktop layouts, touch editing, refresh/resume/delete, partial capture recovery, every export size, and PNG/JPEG print density. Run `npm run test:editor` for the editor or `npm run test:studio` for the editor, homepage, drafts, and export presets. Screenshots are saved to the ignored `.tmp/` folder.

Drafts belong to the current browser profile and site address. Clearing browser data removes them; private browsing may not retain them after the browser closes. If storage is unavailable or full, the app reports that saving failed and keeps the current session usable. **Delete Draft** and the confirmed **Start Over** action remove the saved record and its photos.

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
├── editor.js / editor.css        # Crop geometry, touch editing, reorder, and editor layout
├── session-drafts.js             # Local snapshot validation, IndexedDB, and resume/delete
├── export-presets.js             # Whole-image sizes and PNG/JPEG print density
├── studio-extras.css             # Homepage, draft controls, and export preset styles
├── assets/                       # Original fictional homepage demo portraits and prompt
├── shared.html / shared.js       # Recipient preview and download page
├── server/photo-sharing.mjs      # Expiry, upload, retrieval, and cleanup logic
├── netlify/functions/            # Netlify storage and scheduled cleanup adapters
├── netlify.toml                  # Build and Functions configuration
├── scripts/build.cjs             # Static asset packaging
└── tests/                        # Camera and sharing regression tests
```

## License

Distributed under the MIT License. Feel free to remix, customize, and share!
