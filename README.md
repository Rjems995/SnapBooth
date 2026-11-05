# SnapBooth

Take photo strips with your friends, right in your browser.

SnapBooth is a browser-based photo booth by James, inspired by Korean photo studios. Take photos or upload your own, customize a strip, then download, print, or share it. Camera capture, editing, downloads, and draft storage work in the browser. Optional expiring photo links use Netlify Functions and Netlify Blobs.

[Open SnapBooth](https://snapboothbyjames.netlify.app/)

## Run locally

Install **Node.js 22 or newer**, then run these commands from the repository folder in PowerShell:

```powershell
npm.cmd ci
npm.cmd run build
npx.cmd serve dist
```

If prompted, allow `npx` to install `serve`. Open the local address printed in the terminal, usually `http://localhost:3000`. Keep the terminal running while using the app; press **Ctrl+C** to stop the server.

On macOS, Linux, or shells without PowerShell's script restriction, use `npm` and `npx` instead of `npm.cmd` and `npx.cmd`.

After editing source files, run `npm.cmd run build` again and refresh the browser. The build writes the published app to `dist/`; edit the source files rather than the generated files in that folder.

Camera access requires HTTPS or localhost. Allow camera permission when prompted. If the camera cannot start, choose **Try again** or **Upload photos**. Temporary QR download links require the Netlify backend; the local static server supports the booth, editor, downloads, and native sharing where available.

## Using the booth

1. Choose **Start photobooth**, or select a Black Film, Pastel Pink, or Haru Blue example on the homepage.
2. Pick **2, 3, 4, or 6 photos**, then choose **Open camera**.
3. Select a **3-, 5-, or 10-second timer** and choose **Take photos**. You can also upload existing photos.
4. Review the results, reorder them, or retake individual photos.
5. Choose **Customize strip** to adjust framing, themes, filters, text, stickers, and drawings.
6. Choose **Save & share**, select an export size, and download a JPG or PNG, share the photo, or create a QR download link.

## Features

### Camera and review

- Clear loading and permission feedback. Capture stays disabled until the camera provides a usable video frame.
- Retry or upload options when camera access is unavailable. The unavailable-camera illustration is never captured as a photo.
- Mirror preview, front/rear camera switching where supported, flash and sound effects, and live Original, B&W, Cool, and Warm filters.
- Individual and full-session retakes restart the camera, wait for readiness, and respect the selected timer. Failed retakes preserve the originals.
- Drag handles, move buttons, and keyboard controls for reordering photos.

### Editing

- Reposition photos inside their frames, pinch to zoom or use the **100–300%** slider, and reset individual crops. Crops follow photos when reordered; retaking a photo resets only that photo's crop.
- Portrait **3:4**, landscape **4:3**, square **1:1**, and tall **9:16** framing for individual photos.
- Strip, grid, and Polaroid layouts matched to the photo count.
- Eight themes: Classic, Minimal, Haru Blue, Black Film, Pastel Pink, Vintage, Party Y2K, and Editorial.
- Custom frame colors, sharp or rounded corners, photo filters, title text, fonts, and a date label.
- Draggable, resizable stickers and freehand drawing with pen, eraser, brush sizes, undo, and clear actions.
- Checkmarks and accessible selected states for layouts, themes, filters, framing, colors, and drawing tools. Custom changes clear preset markers that no longer match. Draft restoration also restores selection indicators.

### Interface and homepage

- A custom smiling photo-strip logo, handwritten-style **by James** signature, and matching browser tab icon.
- Warm paper colors, subtle SVG grain, and light and dark themes. Texture stays on the workspace surfaces, not on photos or exported strips, and is removed in forced-colors mode.
- A booth that fits the viewport, with independently scrolling settings, a persistent mobile preview, and a reachable main action. **Expand preview** opens a larger view for inspecting or drawing on a strip.
- Keyboard-accessible choices, clear focus states, larger touch targets, and reduced-motion support.
- Selectable homepage examples. A fresh session adopts the selected example's theme, photo count, square framing, and layout. If photos are already in progress, selecting an example applies its theme while preserving the photos and layout.
- A shared, preloaded **58 KB WebP** for the homepage examples, reduced from the original 2.37 MB PNG. The fictional demo portraits and their generation prompt are documented in [assets/README.md](assets/README.md).

### Draft recovery

Photos and edits save automatically in IndexedDB on the current device. After a refresh, the homepage offers **Resume your last session** and **Delete draft**. Saved sessions include crops, photo order, design settings, text, stickers, drawings, and the export preset. Partial captures can continue with the remaining photos.

Drafts belong to the current browser profile and site address. Clearing browser data removes them; private browsing may not retain them. If storage is unavailable or full, the app reports the problem while keeping the current session usable. **Delete draft** and the confirmed **Start over** action remove the saved draft and its photos.

### Downloads and sharing

Export presets size the **complete strip**, separately from individual photo framing:

| Preset | Output size |
| --- | --- |
| Original design | Keeps the strip's proportions |
| Instagram Story | 1080 × 1920 px |
| Phone Wallpaper | 1440 × 2560 px |
| 2×6-inch Strip | 600 × 1800 px, 300 DPI |
| 4×6-inch Print | 1200 × 1800 px, 300 DPI |

Each preset fits the whole design without cutting off text, photos, or decorations. Extra space uses the frame color. Print presets include density metadata in both JPG and PNG files.

**Share photo** opens the device's share menu with the finished JPEG where file sharing is supported. Other browsers offer local saving and optional link creation. Cancelling the share menu does not create a photo link.

**Get a QR download link** opens a save-and-transfer dialog. Choose **15 minutes**, **1 hour**, or **24 hours**, then select **Create link & QR** to upload only the finished strip. The QR points to that strip's download page, and the QR image is generated locally without a third-party QR service. Anyone with the link can download the strip until it expires.

## Checks

```powershell
npm.cmd test
npm.cmd run test:browser
```

The unit tests cover camera readiness and retakes, crop geometry, photo ordering, draft recovery, export sizes and print metadata, and photo-sharing behavior.

Browser checks require Chrome or Edge. Set `SNAPBOOTH_TEST_BROWSER` to the executable path if it is not in a standard Windows location. They use synthetic camera input, test photos, temporary browser profiles, and isolated storage; no real camera or live photo upload is required.

| Command | Coverage |
| --- | --- |
| `npm.cmd run test:browser` | Sharing and the complete studio browser checks |
| `npm.cmd run test:editor` | Responsive editor, touch gestures, keyboard ordering, crops, previews, and exports |
| `npm.cmd run test:studio` | Editor checks plus camera loading/permission recovery, selected settings, homepage, draft recovery, and export presets |

Browser commands build the app before testing. Screenshots are saved in the ignored `.tmp/` folder. Interaction checks in `tests/browser-interactions.cjs` run as part of the studio suite.

## Deploy with photo links

The included `netlify.toml` configures:

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`
- Node.js: `22`
- Expired-photo cleanup: hourly

Connect the repository to Netlify for a Git-based deployment, or deploy with Netlify CLI including Functions. The backend uses Netlify Blobs for temporary photo storage; no storage secret belongs in the HTML. To exercise the backend locally, run `netlify dev` with Netlify CLI installed and the site configured.

Photo endpoints check expiry on every request and send `no-store` headers. Links stop serving photos at expiry, even before cleanup removes stored files. Already-downloaded copies remain on the recipient's device. Temporary links accept finished JPEGs up to **4 MiB**; larger images can still be downloaded or shared directly.

Static hosts can serve `dist/` for camera capture, editing, downloads, and supported native sharing. Temporary photo links require the Netlify Functions backend; static-only deployments show a fallback message when link creation is attempted.

## Project structure

```text
snapbooth_photobooth_app.html  Main app and UI; built as dist/index.html
studio-extras.css             Branding, texture, responsive screens, and interaction styles
editor.js / editor.css        Crop geometry, touch editing, reordering, and preview layout
session-drafts.js             IndexedDB storage, draft validation, resume, and deletion
export-presets.js             Whole-image export sizes and JPG/PNG print metadata
sharing.js                   Native sharing and optional photo-link/QR flow
shared.html / shared.js       Recipient preview and download page
assets/                      Homepage WebP, original source image, and asset notes
server/photo-sharing.mjs      Upload, retrieval, expiry, and cleanup logic
netlify/functions/           Netlify storage and scheduled cleanup adapters
netlify.toml                 Build and Functions configuration
scripts/build.cjs            Tailwind compilation and static asset packaging
tests/                       Unit tests and Chrome/Edge integration checks
```

The app uses vanilla JavaScript, Tailwind CSS, Canvas, IndexedDB, and Web Audio. Tailwind is compiled locally during the build; the source HTML retains its CDN configuration. QR generation uses `qrcode-generator`, and the optional backend uses `@netlify/blobs`.

`dist/`, `node_modules/`, `.tmp/`, and local environment files are ignored by Git.

## License

MIT.
