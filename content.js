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

            // ---- STEP 3b: Handle virtualized code editors ----
            // Code editors (Monaco, CodeMirror, Ace, custom) often only render visible lines.
            // We need to find them, extract full code, and replace with plain <pre> blocks.
            btn.innerText = '⏳ Extracting code from editors...';
            const savedEditors = [];

            // Strategy: Find ALL scrollable containers that look like code blocks.
            // A code block typically: has monospace font, dark background, contains numbered lines.
            const allContainers = contentElement.querySelectorAll('*');
            const processedContainers = new Set();

            for (let el of allContainers) {
                // Skip if already processed or too small
                if (processedContainers.has(el)) continue;
                if (el.clientHeight < 50 || el.clientWidth < 200) continue;

                const cs = window.getComputedStyle(el);
                
                // Detect code-like containers: has scrollbar OR contains code/pre elements
                const isScrollable = el.scrollHeight > el.clientHeight + 20;
                const hasCodeChildren = el.querySelector('pre, code, .view-line, .view-lines, .CodeMirror-line, .ace_line, .cm-line');
                const hasMonoFont = cs.fontFamily.toLowerCase().includes('mono') || 
                                    cs.fontFamily.toLowerCase().includes('courier') ||
                                    cs.fontFamily.toLowerCase().includes('consolas');
                const hasDarkBg = cs.backgroundColor && (
                    cs.backgroundColor.includes('rgb(30') || cs.backgroundColor.includes('rgb(31') ||
                    cs.backgroundColor.includes('rgb(33') || cs.backgroundColor.includes('rgb(34') ||
                    cs.backgroundColor.includes('rgb(35') || cs.backgroundColor.includes('rgb(36') ||
                    cs.backgroundColor.includes('rgb(37') || cs.backgroundColor.includes('rgb(38') ||
                    cs.backgroundColor.includes('rgb(39') || cs.backgroundColor.includes('rgb(40') ||
                    cs.backgroundColor.includes('rgb(41') || cs.backgroundColor.includes('rgb(42') ||
                    cs.backgroundColor.includes('rgb(43') || cs.backgroundColor.includes('rgb(44') ||
                    cs.backgroundColor.includes('rgb(45') || cs.backgroundColor.includes('rgb(46') ||
                    cs.backgroundColor.includes('rgb(47') || cs.backgroundColor.includes('rgb(48') ||
                    cs.backgroundColor.includes('rgb(49') || cs.backgroundColor.includes('rgb(50')
                );

                // Must look like a code block: either scrollable with code children, or dark bg with mono font
                if (!((isScrollable && hasCodeChildren) || (hasDarkBg && (hasCodeChildren || hasMonoFont)))) continue;

                // Check if this element is inside an already-processed parent
                let isChild = false;
                for (let processed of processedContainers) {
                    if (processed.contains(el)) { isChild = true; break; }
                }
                if (isChild) continue;

                try {
                    let fullText = null;

                    // Method A: Try Monaco API
                    if (window.monaco && window.monaco.editor) {
                        try {
                            const editors = window.monaco.editor.getEditors();
                            for (let ed of editors) {
                                const domNode = ed.getDomNode();
                                if (el.contains(domNode) || domNode === el || domNode.contains(el)) {
                                    fullText = ed.getModel().getValue();
                                    break;
                                }
                            }
                        } catch(e) {}
                    }

                    // Method B: Look for a hidden textarea (many editors use one for input)
                    if (!fullText) {
                        const textarea = el.querySelector('textarea');
                        if (textarea && textarea.value && textarea.value.trim().length > 10) {
                            fullText = textarea.value;
                        }
                    }

                    // Method C: Scroll through to force-render all lines, then collect
                    if (!fullText) {
                        // Find the internal scrollable element
                        let scrollTarget = null;
                        const candidates = [el, ...el.querySelectorAll('[class*="scroll"], [class*="Scroll"]')];
                        for (let c of candidates) {
                            if (c.scrollHeight > c.clientHeight + 20) {
                                scrollTarget = c;
                                break;
                            }
                        }

                        if (scrollTarget) {
                            const origTop = scrollTarget.scrollTop;
                            const total = scrollTarget.scrollHeight;
                            const lineTexts = new Map();

                            // Scroll through in chunks to force virtualized content to render
                            for (let pos = 0; pos <= total + 100; pos += 200) {
                                scrollTarget.scrollTop = pos;
                                await new Promise(r => setTimeout(r, 80));

                                // Collect all line-like elements
                                const lineEls = el.querySelectorAll(
                                    '.view-line, .CodeMirror-line, .ace_line, .cm-line, ' +
                                    '[class*="code-line"], [class*="codeLine"]'
                                );
                                for (let lineEl of lineEls) {
                                    const top = parseInt(lineEl.style.top) || lineEl.offsetTop;
                                    if (!lineTexts.has(top)) {
                                        lineTexts.set(top, lineEl.textContent);
                                    }
                                }
                            }

                            // Restore scroll position
                            scrollTarget.scrollTop = origTop;
                            await new Promise(r => setTimeout(r, 100));

                            if (lineTexts.size > 0) {
                                const sorted = [...lineTexts.entries()].sort((a, b) => a[0] - b[0]);
                                fullText = sorted.map(([_, text]) => text).join('\n');
                            }
                        }
                    }

                    // Method D: Just get all text content from code/pre elements inside
                    if (!fullText || fullText.trim().length < 10) {
                        const preEl = el.querySelector('pre');
                        const codeEl = el.querySelector('code');
                        if (preEl && preEl.textContent.trim().length > 10) {
                            fullText = preEl.textContent;
                        } else if (codeEl && codeEl.textContent.trim().length > 10) {
                            fullText = codeEl.textContent;
                        }
                    }

                    // Only replace if we got meaningful text AND there's hidden content
                    if (fullText && fullText.trim().length > 10 && isScrollable) {
                        processedContainers.add(el);

                        // Match the editor's visual style
                        let bgColor = '#1e1e1e';
                        let textColor = '#d4d4d4';
                        const editorBg = window.getComputedStyle(el);
                        if (editorBg.backgroundColor && editorBg.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                            bgColor = editorBg.backgroundColor;
                        }

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
                        const lines = fullText.split('\n');
                        const numbered = lines.map((line, i) => {
                            const num = String(i + 1).padStart(3, ' ');
                            return `${num}  ${line}`;
                        }).join('\n');
                        pre.textContent = numbered;

                        savedEditors.push({ container: el, original: el.innerHTML, height: el.style.height, maxHeight: el.style.maxHeight, overflow: el.style.overflow });
                        el.innerHTML = '';
                        el.appendChild(pre);
                        el.style.setProperty('height', 'auto', 'important');
                        el.style.setProperty('max-height', 'none', 'important');
                        el.style.setProperty('overflow', 'visible', 'important');
                    }
                } catch (err) {
                    console.warn('Could not extract code from editor:', err);
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
