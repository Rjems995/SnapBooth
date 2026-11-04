# Homepage sample portraits

The homepage uses `demo-photos.webp`, a 768 × 768 copy of the original contact sheet encoded as WebP at quality 84. It is 58,022 bytes, 97.6% smaller than the 2,373,622-byte PNG. Each panel is 384 × 384 pixels, enough for the largest 120px homepage photo at 3× pixel density. All three sample strips share this one image, which the page preloads.

`demo-photos.png` is the original fictional contact sheet created with the built-in imagegen tool. It stays in the source repository for future edits and is excluded from the published build. To regenerate the WebP, resize the complete square image to 768 × 768 with high-quality resampling and encode at quality 84, preserving all four panels without cropping. The homepage crops the four square panels in CSS and composes them into Black Film, Pastel Pink, and Haru Blue sample designs. These examples never use a visitor's photos.

Final prompt:

> Create a photorealistic 2 by 2 contact sheet of four square Korean-style photobooth snapshots of the same two cheerful fictional adult friends, one Filipino woman and one Filipino man, both in their mid twenties, simple casual neutral clothing. Different playful poses in each quadrant: smiling, peace signs, finger hearts, laughing. Soft pale blue studio backdrop, flattering direct flash, natural skin, faces fully visible and centered with generous headroom. Four equal edge-to-edge squares, no gutters, no borders, no words, no logos. This will be cropped into four separate website demo photos.
