SNAPBOOTH — K-Style Photobooth Studio

VISIT - https://snapboothbyjames.netlify.app/

An architectural, tactile web-based photobooth app inspired by Korean self-photo booth culture (Life Four Cuts, Haru Film). Built with pure HTML5 Canvas, WebRTC, Tailwind CSS, and Web Audio API. Zero dependencies or backend required.

Key Features

Mandatory Shot Selection First: Pick 2, 3, 4, or 6 shots prior to camera activation. The selection dynamically locks in photo counts, review grids, and tailored geometries.

WebRTC Camera Engine: Real-time webcam feed with live countdowns (3-2-1), photo flash animation, synthesizer audio cues, and camera device toggling.

Fail-Safe Fallback: Automatic upload and studio demo mode if webcam permissions are denied or unavailable in sandboxed environments.

Individual Shot Retake: Inspect captured photos in a review grid with options to retake specific photos or reset the sequence.

Dynamic Compatible Layouts: Architectural layouts tailored strictly to selected shot count (Vertical Strips, 2x2 4-Cuts, 3x2 Grids, Polaroid Duos/Trios).

Studio Design Customizer:

Themes: Classic White, Minimal, Haru Blue, Black Film, Pastel Pink, Vintage Retro, Y2K Party, Editorial.

Frame Palette: Full RGB picker + rapid preset buttons.

Canvas Photo Filters: B&W, Vintage, Sepia, Warm Tone, Cool Blue, High Contrast, Leica Bright.

Typography & Date Stamps: Title, subtitle, automatic date stamp (YYYY.MM.DD), and font styles.

Draggable Stamps: Click-to-place stamps with drag-and-drop repositioning.

300 DPI High-Res Export: Pure HTML Canvas export generating clean JPG or PNG files without browser UI artifacts.

Tech Stack

HTML5 & WebRTC (navigator.mediaDevices.getUserMedia)

Tailwind CSS (via CDN for sharp brutalist studio geometry)

Vanilla JavaScript (ES6+)

HTML5 Canvas API (for high-resolution image rendering and export)

Web Audio API (synthesized click, beep, and shutter sound effects)

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

Note on Camera Permissions: Webcams require an HTTPS connection to function. GitHub Pages automatically provides HTTPS SSL certificates for all deployed sites.

Repository Structure

snapbooth/
├── index.html     # Complete single-file photobooth application
└── README.md      # Repository documentation


License

Distributed under the MIT License. Feel free to remix, customize, and share!
