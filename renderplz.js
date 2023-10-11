// Required modules
const express = require('express');
const puppeteer = require('puppeteer');

// Express setup
const app = express();
const PORT = process.env.PORT || 3000;

// Puppeteer browser and page objects
let browser;
let page;

async function startBrowser(disableWebSecurity = false) {
    const launchOptions = {
        //headless: false,
        defaultViewport: null,
    };

    if (disableWebSecurity) {
        launchOptions.args = ['--disable-web-security'];
    }

    browser = await puppeteer.launch(launchOptions);


    page = await browser.newPage();

    // Set a standard User-Agent to avoid potential blocking by websites
    await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',

    });
}

// Trigger browser initialization
console.log(puppeteer.executablePath());
startBrowser();

app.get('/', async (req, res) => {
    const url = req.query.url;
    const disableWebSecurity = req.query.DISABLE_WS;

    if (disableWebSecurity) {
        if (browser) await browser.close();
        await startBrowser(true);
    }

    const hrms = req.query.HRMS;
    const vip = req.query.VIP;
    const rona = req.query.RONA;
    const displayID = req.query.DISPLAY_ID;

    if (!url) {
        return res.status(400).send("URL parameter is required.");
    }


    try {


        await page.goto(url, { waitUntil: ['load', 'networkidle0'], timeout: 120000 });



        let finalContent = '';

        if (rona === 'TRUE') {

            const divElement = await page.$('div[role="combobox"][aria-haspopup="listbox"][id="mui-7"]');
            if (divElement) {
                await divElement.click();
                await page.waitForTimeout(1000);


                const listItemElement = await page.$('li[data-value="250"]');
                if (listItemElement) {
                    await listItemElement.click();
                    await page.waitForTimeout(1000);


                    const contentAfterLiClick = await page.content();
                    finalContent += contentAfterLiClick;


                    const svgElement = await page.$('svg[data-testid="KeyboardArrowRightIcon"]');
                    if (svgElement) {
                        await svgElement.click();


                        const contentAfterSvgClick = await page.content();
                        finalContent += "\n\n-------- Next Page --------\n\n" + contentAfterSvgClick;
                    }

                    res.setHeader('Content-Type', 'text/plain');
                    return res.send(finalContent);

                }
            }
        }



        if (hrms === 'TRUE') {


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

            const iframeElements = await page.$$('iframe[id$="_20"]');
            if (iframeElements.length > 1) {
                const iframeSrc = await page.evaluate(iframe => iframe.src, iframeElements[1]);
                const iframePage = await browser.newPage();
                
                // Set a standard user agent (optional, but might help)
                await iframePage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.132 Safari/537.36');
                
                await iframePage.goto(iframeSrc, { waitUntil: ['load', 'networkidle0'], timeout: 120000 });
                
                // Now, instead of simply capturing the content immediately,
                // let's wait for a bit to ensure all dynamic content is loaded.
                await iframePage.waitForTimeout(5000);  // wait for 5 seconds (you can adjust this)
                
                const iframeContent = await iframePage.content();
                await iframePage.close();
    
                // Append the iframe content to the final content
                finalContent += "\n\n-------- Iframe Content --------\n\n" + iframeContent;
            } else {
                console.error('Unable to locate the desired iframe.');
                // Handle this case as needed
            }


        }


        const content = await page.content();
        res.setHeader('Content-Type', 'text/plain');
        res.send(content + finalContent);  // include the finalContent which might contain iframe content


    } catch (error) {
        console.error('Error processing the request:', error.message);
        res.status(500).send("Failed to render content");
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
