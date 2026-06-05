# YTools

YTools is a minimalist, typography-driven Chrome extension that extracts a complete list of videos from YouTube channel pages. It features an automated scroll-and-scan mechanism to dynamically collect all uploaded content.

Designed with a sleek, premium dark mode aesthetic under the specifications requested by **RiffPointer**.

---

## Design System & Aesthetics
- **Color Theme**: Pure flat 2-tone style. A deep slate/dark grey (`#0d0d0d`, `#161616`) combined with crisp white (`#ffffff`) typography and borders.
- **Typography**: Complete styling powered by the Google Font **Inter** for clean readability, bold hierarchy, and uppercase tracking.
- **Border Radius**: Exact `4px` rounded corners on all UI panels, buttons, scrollbars, and badges.
- **Layout**: Strictly functional typography with zero unnecessary elements or decorative distractions.

---

## Core Features
1. **Channel Detection**: Automatic warning indicator if the active tab is not a YouTube channel page.
2. **Auto-Scrolling Scanner**: A background scan loop that automatically scrolls down the page to trigger YouTube's lazy loader, retrieving all videos.
3. **Resilience**: The scanner runs inside the page DOM. If you accidentally close the extension popup, scanning continues seamlessly. Reopening the popup reconnects and displays the current state.
4. **Copy List**: Generates a clean text representation of the videos (index, title, duration, and direct URL) copied to your clipboard.
5. **Save JSON**: Instantly downloads a clean JSON file containing arrays of `{ title, url, duration }` objects.
6. **Direct Navigation**: Clicking any video in the extracted list opens it in a new browser tab.

---

## How to Install YTools in Chrome

1. **Clone or Download** this repository to a local directory on your machine.
2. Open Google Chrome and navigate to **`chrome://extensions/`**.
3. Toggle the **Developer mode** switch in the top-right corner to **ON**.
4. Click the **Load unpacked** button in the top-left corner.
5. Select the folder containing this project (the directory containing `manifest.json`).
6. Pin **YTools** to your browser toolbar for quick access.

---

## How to Use

1. Go to any YouTube channel (e.g., [YouTube Creator Channel](https://www.youtube.com/@YouTubeCreators)).
2. Navigate to the channel's **Videos** or **Shorts** tab (recommended for extracting the full catalog).
3. Click the **YTools** extension icon.
4. Click **START SCANNING**. The page will scroll down automatically, indexing videos in real-time.
5. Click **STOP SCANNING** at any time to pause, or let it run until it reaches the end of the channel.
6. Use **COPY LIST** or **SAVE JSON** to export your extracted catalog.
7. Click **RESET** to clear and reload the page state.

---
*Created by RiffPointer*
