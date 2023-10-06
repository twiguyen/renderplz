// Required modules
const express = require('express');
const puppeteer = require('puppeteer');

// Express setup
const app = express();
const PORT = process.env.PORT || 3000;

// Puppeteer browser and page objects
let browser;
let page;

// Initializes Puppeteer and opens a new browser page
async function startBrowser() {
    browser = await puppeteer.launch({
        // headless: false,
        defaultViewport: null
    });
    page = await browser.newPage();
    // Set a standard User-Agent to avoid potential blocking by websites
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36');
}

// Trigger browser initialization
startBrowser();

app.get('/', async (req, res) => {
    const url = req.query.url;
    const hrms = req.query.HRMS;
    const vip = req.query.VIP;
    const rona = req.query.RONA;

    if (!url) {
        return res.status(400).send("URL parameter is required.");
    }

    const enableJavaScript = req.query.CF === 'TRUE';
    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        if (rona === 'TRUE') {
            const clicked = await page.evaluate(() => {
                const element = document.querySelector('li[data-value="250"]');
                if (element) {
                    element.click();
                    return true;
                }
                return false;
            });

            if (clicked) {
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
            }
        }
    
        if (hrms === 'TRUE') {
            // Attempt to click on the "View All Jobs" button
            const clicked = await page.evaluate(() => {
                const elements = document.querySelectorAll('span.ps-text');
                for (let element of elements) {
                    if (element.textContent.trim() === 'View All Jobs') {
                        element.click();
                        return true;
                    }
                }
                return false;
            });
    
            if (clicked) {
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
            }

            await page.waitForTimeout(3000);

            let previousHeight = 0;
            // Loop to scroll through lazy-loaded content
            while (true) {
                const currentHeight = await page.evaluate(() => {
                    const scrollable = document.getElementById('win0divHRS_AGNT_RSLT_I$grid$0');
                    return scrollable.scrollHeight;
                });

                if (currentHeight === previousHeight) break; 
                // Scroll to load more content
                await page.evaluate(() => {
                    const scrollable = document.getElementById('win0divHRS_AGNT_RSLT_I$grid$0');
                    if (scrollable) {
                        scrollable.scrollTop = scrollable.scrollHeight;
                    }
                });
            
                previousHeight = currentHeight;
                await page.waitForTimeout(2000);
            }
        }

        if (vip === 'TRUE') {
            // Wait for the text "Loading site" to disappear within a div with class "processing"
            await page.waitForFunction(() => {
                const processingDiv = document.querySelector('.processing');
                if (processingDiv) {
                    return !processingDiv.textContent.includes('Loading site');
                }
                return true;
            });
        }
    
        const content = await page.content();
        res.setHeader('Content-Type', 'text/plain');
        res.send(content);
    
    } catch (error) {
        console.error(error);
        res.status(500).send("Failed to render content");
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
