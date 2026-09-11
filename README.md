# Educative PDF Downloader

A lightweight browser extension that allows you to download Educative.io lesson pages as beautifully formatted PDF documents. 

Have you ever wanted to save an Educative lesson to read offline, or print it out for highlighting, but found that the browser's default print feature only captures the first visible page? This extension solves that problem by injecting a "Download as PDF" button that programmatically captures the full lesson content—including text, images, and code blocks—and converts it into a high-quality PDF.

## Features
- ⬇️ **One-Click Download:** Adds a convenient button to the bottom right of Educative lesson pages.
- 📄 **Full Page Capture:** Bypasses scrollable container limits to capture the entire lesson.
- 🎨 **Maintains Formatting:** Preserves styles, code highlighting, and images using `html2pdf.js`.
- 🛡️ **Safe Processing:** Automatically ignores embedded IDEs (like VS Code iframes) to prevent authentication redirects or crashes during generation.

## Installation

This extension is currently available to be loaded as an "Unpacked Extension" in Developer Mode.

### Google Chrome
1. Download or clone this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Toggle **Developer mode** ON (top right corner).
4. Click **Load unpacked** (top left).
5. Select the folder containing this extension's files.

### Microsoft Edge
1. Download or clone this repository.
2. Open Edge and navigate to `edge://extensions/`.
3. Toggle **Developer mode** ON (bottom left or top).
4. Click **Load unpacked**.
5. Select the folder containing this extension's files.

## Usage
1. Once installed, navigate to any lesson on [Educative.io](https://www.educative.io/).
2. Refresh the page if you just installed the extension.
3. You will see a floating **"⬇️ Download as PDF"** button in the bottom right corner.
4. Click it and wait a few seconds. A PDF file containing the lesson will automatically download to your computer!

## Technologies Used
- Manifest V3 Web Extension API
- JavaScript (Vanilla)
- [html2pdf.js](https://ekoopmans.github.io/html2pdf.js/)

## License
MIT License
