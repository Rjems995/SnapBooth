# SNAPBOOTH — K-Style Photobooth Studio 📸

A modern, responsive, and interactive web-based photobooth web application inspired by Korean self-photo booth culture (Life Four Cuts, Haru Film). Built as a self-contained web app using HTML5 Canvas, WebRTC, and Tailwind CSS.

## Key Features

* **Shot Format Selection First**: Always select **2, 3, 4, or 6 shots** prior to camera activation.
* **WebRTC Camera Engine**: Real-time webcam preview, countdown timer (3-2-1), photo flash effect, audio synthesizer cues, and device switching.
* **Fail-Safe Fallback**: Automatic upload & studio demo mode if webcam access is restricted or denied.
* **Individual Shot Retake**: Inspect captured photos with options to retake specific photos or clear all photos.
* **Dynamic Shot Layouts**: Responsive layouts tailored strictly to the selected shot count (Strips, 2x2 4-Cuts, 3x2 Grids, Polaroids).
* **Studio Design Customizer**:
  * **Themes**: Classic, Minimal, Haru Blue, Black Film, Pastel Pink, Vintage Retro.
  * **Frame Customizer**: Full color palette selector.
  * **Filters**: B&W, Vintage, Sepia, Warm, Cool Blue, High Contrast, Leica Bright.
  * **Typography & Stickers**: Customizable title, subtitle, auto-date stamp, and draggable emoji stamps.
* **300 DPI High-Res Export**: Direct HTML Canvas export to clean JPG or PNG files without browser UI artifacts.

## How to Deploy on GitHub Pages

1. Create a new repository on GitHub (e.g., `snapbooth`).
2. Upload `index.html` and `README.md` to the repository.
3. Navigate to **Settings** > **Pages**.
4. Set the source branch to `main` (or `master`) and folder to `/ (root)`.
5. Click **Save**. Your photobooth app will be live on an HTTPS secure URL!