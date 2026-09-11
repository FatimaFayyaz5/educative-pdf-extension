// Wait for the page to fully load
window.addEventListener('load', () => {
    // Slight delay to ensure dynamic React content is rendered
    setTimeout(initExtension, 2000);
});

function initExtension() {
    // Check if button already exists
    if (document.getElementById('educative-pdf-download-btn')) return;

    // Create the button
    const btn = document.createElement('button');
    btn.id = 'educative-pdf-download-btn';
    btn.type = 'button'; // Prevent accidental form submission
    btn.innerText = '⬇️ Download as PDF';
    document.body.appendChild(btn);

    btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const originalText = btn.innerText;
        btn.innerText = '⏳ Generating PDF... Please wait.';
        btn.classList.add('downloading');
        btn.disabled = true;

        try {
            // Find the main content container.
            // Educative uses various class names, we try the most common ones or fallbacks.
            let contentElement = document.querySelector('[class*="PageContent"], [class*="Article"], [class*="reader-content"], article, main');
            
            if (!contentElement) {
                // Heuristic fallback: find a large div that's likely the main content
                const divs = Array.from(document.querySelectorAll('div'));
                let largestArea = 0;
                for (const div of divs) {
                    const rect = div.getBoundingClientRect();
                    const area = rect.width * rect.height;
                    // Usually content is wide but doesn't take the full screen width due to sidebars
                    if (area > largestArea && rect.width > 300 && rect.width < window.innerWidth * 0.9) {
                        largestArea = area;
                        contentElement = div;
                    }
                }
            }

            // If we still can't find it, use body
            if (!contentElement) {
                console.warn("Could not find specific content container, defaulting to document.body");
                contentElement = document.body;
            }

            // Ensure the element and its ancestors aren't hiding overflow which clips PDF generation.
            // We do NOT do this recursively to children, because complex code editors 
            // (like Monaco) rely on hidden overflow and will crash/hang if forced visible.
            const originalStyles = [];
            
            function fixAncestorsOverflow(element) {
                let current = element;
                while (current && current !== document.documentElement) {
                    const style = window.getComputedStyle(current);
                    if (style.overflow === 'hidden' || style.overflow === 'auto' || style.overflow === 'scroll' || 
                        style.overflowY === 'hidden' || style.overflowY === 'auto' || style.overflowY === 'scroll') {
                        
                        originalStyles.push({
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
            }

            fixAncestorsOverflow(contentElement);

            // Get the title for the filename
            let title = document.title || 'Educative_Lesson';
            const h1 = contentElement.querySelector('h1');
            if (h1 && h1.innerText) {
                title = h1.innerText;
            }
            const filename = title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.pdf';

            // Configure html2pdf options
            const opt = {
                margin:       [15, 15, 15, 15], // top, left, bottom, right in mm
                filename:     filename,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { 
                    scale: 2, 
                    useCORS: true, 
                    logging: false,
                    windowWidth: contentElement.scrollWidth, // Ensures full width is captured
                    scrollY: 0, // Prevent cutoff
                    ignoreElements: (element) => {
                        const tag = element.tagName ? element.tagName.toLowerCase() : '';
                        // Ignore iframes (auth redirects) and canvases (Monaco minimaps often taint the render)
                        return tag === 'iframe' || tag === 'canvas' || tag === 'video';
                    },
                    onclone: (clonedDoc) => {
                        // Force CORS on all images to prevent cached non-CORS images from tainting
                        const imgs = clonedDoc.querySelectorAll('img');
                        for (let img of imgs) {
                            img.crossOrigin = "anonymous";
                        }
                    }
                },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak:    { mode: ['css', 'legacy'] } // Helps avoid cutting text lines in half
            };

            // Generate the PDF
            await html2pdf().set(opt).from(contentElement).save();
            
            // Restore original styles
            for (const item of originalStyles) {
                item.el.style.overflow = item.overflow;
                item.el.style.overflowY = item.overflowY;
                item.el.style.height = item.height;
                item.el.style.maxHeight = item.maxHeight;
            }

            btn.innerText = '✅ Download Successful!';
            setTimeout(() => {
                btn.innerText = originalText;
                btn.classList.remove('downloading');
                btn.disabled = false;
            }, 3000);
            
        } catch (error) {
            console.error("PDF Generation Error:", error);
            alert("PDF Generation Error: " + (error.message || error) + "\n\n(Please share this error message with me!)");
            btn.innerText = '❌ Error! Check Console';
            setTimeout(() => {
                btn.innerText = originalText;
                btn.classList.remove('downloading');
                btn.disabled = false;
            }, 3000);
        }
    });
}
