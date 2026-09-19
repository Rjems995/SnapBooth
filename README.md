SNAPBOOTH — K-Style Photobooth Studio

<img width="1058" height="534" alt="image" src="https://github.com/user-attachments/assets/aa527230-ae58-4b0c-971a-737122e25528" />

An architectural, tactile web-based photobooth app inspired by Korean self-photo booth culture (Life Four Cuts, Haru Film). Built with pure HTML5 Canvas, WebRTC, Tailwind CSS, and Web Audio API. Zero dependencies or backend required.

Live Studio App: https://snapboothbyjames.netlify.app/

Key Features

Shot Selection First: Choose 2, 3, 4, or 6 shots prior to camera activation. The selection dynamically configures photo sequence counts, review grids, and layout geometries.

WebRTC Camera Engine: Real-time webcam feed with configurable timer countdowns (3S, 5S, 10S), photo flash effect, sound cues, selfie mirror toggle (MIRROR: ON / OFF), and front/rear camera lens switching.

Live Camera Filters: Preview and snap photos with real-time filters (RAW, B&W, COOL, WARM).

Fail-Safe Fallback Mode: Automatic studio demo mode and image upload fallback if webcam permissions are denied or unavailable.

Shot Review & Position Swap: Inspect captured shots in a review grid, swap photo frame positions (< / >), or retake individual shots without resetting the sequence.

4 Photo Aspect Ratios:

PORTRAIT (3:4) — Classic studio portrait frame.

LANDSCAPE (4:3) — Horizontal widescreen layout.

SQUARE (1:1) — Grid style formatting.

MOBILE (9:16) — Tailored 1080x1920 story & wallpaper format for mobile phones.

Studio Design Studio:

Preset Themes: Classic, Minimal, Haru Blue, Black Film, Pastel Pink, Vintage, Party Y2K, Editorial.

Frame Palette: RGB color picker + rapid preset swatches.

Photo Filters: B&W, Vintage, Sepia, Warm Tone, Cool Blue, Contrast, Leica Bright.

Typography Controls: Main Title, Subtitle (Default: SNAPBOOTHBYJAMES), Font Styles, and Date Stamp (YYYY.MM.DD).

Touch-Stretch Stickers: Drag stickers onto the strip and stretch/resize them in real-time using the blue corner handle.

Photo Corner Styles: Toggle between Sharp cut edges and Rounded smooth photo corners.

300 DPI High-Res Export & Mobile Transfer:

Pure HTML Canvas rendering for high-res JPG and PNG file downloads.

Blob object URLs for reliable saving across mobile Safari, Chrome, and desktop browsers.

Save / QR Modal: Tap-and-hold (long-press) mobile photo saving and scannable QR code generator for desktop-to-mobile session transfers.

Tech Stack

HTML5 & WebRTC (navigator.mediaDevices.getUserMedia)

Tailwind CSS (via CDN for sharp brutalist studio UI)

Vanilla JavaScript (ES6+)

HTML5 Canvas API (for 300 DPI image rendering and center-crop exports)

Web Audio API (synthesized sound effects)

How to Deploy on GitHub Pages

Create Repository: Create a new public repository on GitHub named snapbooth.

Upload Files: Upload index.html and README.md to your repository root folder.

Configure Pages:

Go to Settings > Pages in your GitHub repository.

Under Source, select Deploy from a branch.

Set the branch to main (or master) and folder to / (root).

Click Save.

Access Live App: In 1–2 minutes, GitHub will generate a secure HTTPS link:
https://<your-username>.github.io/snapbooth/

Note on Camera Permissions: Webcams require a secure https:// connection to function. Netlify Drop and GitHub Pages automatically provide free HTTPS SSL certificates.

Repository Structure

snapbooth/
├── index.html     # Complete single-file photobooth application
└── README.md      # Documentation


License

Distributed under the MIT License. Feel free to remix, customize, and share!
