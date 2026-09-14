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
