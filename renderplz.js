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

        let finalContent = ''; // This will store the final combined content
        if (rona === 'TRUE') {
            // Click on the specific div based on its attributes
            const divElement = await page.$('div[role="combobox"][aria-haspopup="listbox"][id="mui-7"]');
            if (divElement) {
                await divElement.click();
                await page.waitForTimeout(1000); // Wait for dropdown to appear

                // Click on the li with data-value="250"
                const listItemElement = await page.$('li[data-value="250"]');
                if (listItemElement) {
                    await listItemElement.click();
                    await page.waitForTimeout(1000); // Give it some time if necessary
                    
                    // Capture content after the li is clicked
                    const contentAfterLiClick = await page.content();
                    finalContent += contentAfterLiClick;

                    // Click on the svg with data-testid="KeyboardArrowRightIcon"
                    const svgElement = await page.$('svg[data-testid="KeyboardArrowRightIcon"]');
                    if (svgElement) {
                        await svgElement.click();

                        // Capture content of the next page
                        const contentAfterSvgClick = await page.content();
                        finalContent += "\n\n-------- Next Page --------\n\n" + contentAfterSvgClick;
                    }
                    res.setHeader('Content-Type', 'text/plain');
                    return res.send(finalContent);
                }
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
