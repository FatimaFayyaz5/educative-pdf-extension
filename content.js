// Wait for the page to fully load
window.addEventListener('load', () => {
    setTimeout(initExtension, 2000);
});

function initExtension() {
    if (document.getElementById('educative-pdf-download-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'educative-pdf-download-btn';
    btn.type = 'button';
    btn.innerText = '⬇️ Download as PDF';
    document.body.appendChild(btn);

    btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const originalText = btn.innerText;
        btn.classList.add('downloading');
        btn.disabled = true;

        try {
            // ---- STEP 1: Find the content container ----
            let contentElement = document.querySelector(
                '[class*="PageContent"], [class*="Article"], [class*="reader-content"], article, main'
            );

            if (!contentElement) {
                const divs = Array.from(document.querySelectorAll('div'));
                let largestArea = 0;
                for (const div of divs) {
                    const rect = div.getBoundingClientRect();
                    const area = rect.width * rect.height;
                    if (area > largestArea && rect.width > 300 && rect.width < window.innerWidth * 0.9) {
                        largestArea = area;
                        contentElement = div;
                    }
                }
            }
            if (!contentElement) contentElement = document.body;

            // ---- STEP 2: Fix ancestor overflow (so the full page is visible) ----
            const savedAncestors = [];
            let current = contentElement;
            while (current && current !== document.documentElement) {
                const cs = window.getComputedStyle(current);
                if (['hidden','auto','scroll'].includes(cs.overflow) || ['hidden','auto','scroll'].includes(cs.overflowY)) {
                    savedAncestors.push({
                        el: current,
                        overflow: current.style.overflow,
                        overflowY: current.style.overflowY,
                        height: current.style.height,
                        maxHeight: current.style.maxHeight
                    });
                    current.style.setProperty('overflow', 'visible', 'important');
                    current.style.setProperty('overflow-y', 'visible', 'important');
                    current.style.setProperty('height', 'auto', 'important');
                    current.style.setProperty('max-height', 'none', 'important');
                }
                current = current.parentElement;
            }

            // ---- STEP 3: Expand all scrollable code blocks on the REAL page ----
            btn.innerText = '⏳ Expanding code blocks...';
            const savedScrollables = [];
            const allEls = contentElement.querySelectorAll('*');
            for (let el of allEls) {
                if (el.scrollHeight > el.clientHeight + 5 && el.clientHeight > 20) {
                    savedScrollables.push({
                        el: el,
                        maxHeight: el.style.maxHeight,
                        height: el.style.height,
                        overflow: el.style.overflow,
                        overflowY: el.style.overflowY
                    });
                    el.style.setProperty('max-height', 'none', 'important');
                    el.style.setProperty('height', 'auto', 'important');
                    el.style.setProperty('overflow', 'visible', 'important');
                    el.style.setProperty('overflow-y', 'visible', 'important');
                }
            }

            // Wait for the browser to re-render expanded code blocks
            await new Promise(r => setTimeout(r, 500));

            // ---- STEP 3b: Handle Monaco editors (virtualized code blocks) ----
            // Monaco only renders visible lines. We need to extract the full code and replace with a <pre>.
            btn.innerText = '⏳ Extracting code from editors...';
            const savedEditors = [];

            // Method 1: Try to access Monaco API directly
            const monacoEditorEls = contentElement.querySelectorAll('.monaco-editor');
            for (let editorEl of monacoEditorEls) {
                try {
                    let fullText = null;

                    // Try to get the editor instance from Monaco's global API
                    if (window.monaco && window.monaco.editor) {
                        const editors = window.monaco.editor.getEditors();
                        for (let ed of editors) {
                            if (editorEl.contains(ed.getDomNode()) || ed.getDomNode() === editorEl) {
                                fullText = ed.getModel().getValue();
                                break;
                            }
                        }
                    }

                    // Method 2: Scroll through the editor to force-render all lines, then collect them
                    if (!fullText) {
                        const scrollable = editorEl.querySelector('.monaco-scrollable-element');
                        const viewLines = editorEl.querySelector('.view-lines');
                        if (scrollable && viewLines) {
                            // Scroll to bottom and back to force Monaco to render all lines
                            const origScrollTop = scrollable.scrollTop;
                            const totalHeight = scrollable.scrollHeight;
                            const step = 300;
                            
                            for (let pos = 0; pos <= totalHeight; pos += step) {
                                scrollable.scrollTop = pos;
                                await new Promise(r => setTimeout(r, 50));
                            }
                            scrollable.scrollTop = origScrollTop;
                            await new Promise(r => setTimeout(r, 100));

                            // Now collect all view-line text
                            const lines = viewLines.querySelectorAll('.view-line');
                            const lineMap = new Map();
                            for (let line of lines) {
                                const top = parseInt(line.style.top) || 0;
                                lineMap.set(top, line.textContent);
                            }
                            // Sort by vertical position
                            const sortedTops = [...lineMap.keys()].sort((a, b) => a - b);
                            fullText = sortedTops.map(t => lineMap.get(t)).join('\n');
                        }
                    }

                    // Method 3: Just grab whatever text is visible
                    if (!fullText) {
                        const viewLines = editorEl.querySelector('.view-lines');
                        if (viewLines) {
                            fullText = viewLines.textContent;
                        }
                    }

                    if (fullText && fullText.trim().length > 0) {
                        // Find the outermost container for this editor (the whole code block widget)
                        let container = editorEl;
                        // Walk up to find the wrapper that includes the header bar (filename, language, etc.)
                        for (let i = 0; i < 5; i++) {
                            if (container.parentElement && container.parentElement !== contentElement) {
                                container = container.parentElement;
                            }
                        }

                        // Get the styling from visible code lines for matching colors
                        const existingLine = editorEl.querySelector('.view-line');
                        let bgColor = '#1e1e1e';
                        let textColor = '#d4d4d4';
                        if (existingLine) {
                            const lineCs = window.getComputedStyle(existingLine);
                            textColor = lineCs.color || textColor;
                        }
                        const editorBg = window.getComputedStyle(editorEl);
                        bgColor = editorBg.backgroundColor || bgColor;

                        // Create a replacement <pre> with all the code
                        const pre = document.createElement('pre');
                        pre.style.cssText = `
                            background: ${bgColor};
                            color: ${textColor};
                            padding: 16px;
                            border-radius: 6px;
                            font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
                            font-size: 13px;
                            line-height: 1.5;
                            white-space: pre-wrap;
                            word-wrap: break-word;
                            overflow: visible;
                            margin: 0;
                        `;
                        // Add line numbers
                        const lines = fullText.split('\n');
                        const numbered = lines.map((line, i) => {
                            const num = String(i + 1).padStart(3, ' ');
                            return `${num}  ${line}`;
                        }).join('\n');
                        pre.textContent = numbered;

                        savedEditors.push({ container: editorEl, original: editorEl.innerHTML });
                        editorEl.innerHTML = '';
                        editorEl.appendChild(pre);
                        editorEl.style.setProperty('height', 'auto', 'important');
                        editorEl.style.setProperty('max-height', 'none', 'important');
                        editorEl.style.setProperty('overflow', 'visible', 'important');
                    }
                } catch (err) {
                    console.warn('Could not extract code from Monaco editor:', err);
                }
            }

            await new Promise(r => setTimeout(r, 300));

            // ---- STEP 4: Convert all images to base64 data URLs (bypass CORS entirely) ----
            btn.innerText = '⏳ Processing images...';
            const imgs = contentElement.querySelectorAll('img');
            const savedImgs = [];

            for (let img of imgs) {
                if (!img.src || img.src.startsWith('data:')) continue;
                if (img.naturalWidth === 0) continue; // not loaded

                try {
                    // Create an offscreen canvas and draw the image
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    const dataURL = canvas.toDataURL('image/png');

                    savedImgs.push({ el: img, originalSrc: img.src });
                    img.src = dataURL;
                } catch (e) {
                    // If canvas is tainted (cross-origin), try fetching the image with CORS
                    try {
                        const response = await fetch(img.src, { mode: 'cors' });
                        const blob = await response.blob();
                        const dataURL = await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.readAsDataURL(blob);
                        });
                        savedImgs.push({ el: img, originalSrc: img.src });
                        img.src = dataURL;
                    } catch (e2) {
                        console.warn('Could not convert image to base64:', img.src, e2);
                        // Leave the image as-is
                    }
                }
            }

            // Wait a moment for src changes to apply
            await new Promise(r => setTimeout(r, 300));

            // ---- STEP 5: Generate the PDF ----
            btn.innerText = '⏳ Generating PDF...';

            let title = document.title || 'Educative_Lesson';
            const h1 = contentElement.querySelector('h1');
            if (h1 && h1.innerText) title = h1.innerText;
            const filename = title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.pdf';

            const opt = {
                margin:       [15, 15, 15, 15],
                filename:     filename,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  {
                    scale: 2,
                    useCORS: true,
                    allowTaint: false,
                    logging: false,
                    windowWidth: contentElement.scrollWidth,
                    scrollY: 0,
                    ignoreElements: (element) => {
                        const tag = element.tagName ? element.tagName.toLowerCase() : '';
                        return tag === 'iframe' || tag === 'canvas' || tag === 'video';
                    }
                },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak:    { mode: ['css', 'legacy'] }
            };

            await html2pdf().set(opt).from(contentElement).save();

            // ---- STEP 6: Restore everything ----
            for (let item of savedAncestors) {
                item.el.style.overflow = item.overflow;
                item.el.style.overflowY = item.overflowY;
                item.el.style.height = item.height;
                item.el.style.maxHeight = item.maxHeight;
            }
            for (let item of savedScrollables) {
                item.el.style.maxHeight = item.maxHeight;
                item.el.style.height = item.height;
                item.el.style.overflow = item.overflow;
                item.el.style.overflowY = item.overflowY;
            }
            for (let item of savedImgs) {
                item.el.src = item.originalSrc;
            }
            for (let item of savedEditors) {
                item.container.innerHTML = item.original;
            }

            btn.innerText = '✅ Download Successful!';
            setTimeout(() => {
                btn.innerText = originalText;
                btn.classList.remove('downloading');
                btn.disabled = false;
            }, 3000);

        } catch (error) {
            console.error("PDF Generation Error:", error);
            alert("PDF Generation Error: " + (error.message || error));
            btn.innerText = '❌ Error!';
            setTimeout(() => {
                btn.innerText = originalText;
                btn.classList.remove('downloading');
                btn.disabled = false;
            }, 3000);
        }
    });
}
