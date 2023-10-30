const express = require('express');
const puppeteer = require('puppeteer');



// Express setup
const app = express();
const PORT = process.env.PORT || 3000;


// function: start a new browser session

async function startBrowser(disableWebSecurity = false, disableHttp2 = false) {
    const launchOptions = {
        // for visual testing
        //headless: false,
        defaultViewport: null,
        args: []
    };

    // set disableHttp2 to TRUE only when there is protocol issues
    if (disableHttp2) {
        launchOptions.args.push('--disable-http2');
    }

    // set disableWebSecurity to TRUE only when scraper is blocked
    if (disableWebSecurity) {
        launchOptions.args.push('--disable-web-security');
    }

    const localBrowser = await puppeteer.launch(launchOptions);
    const localPage = await localBrowser.newPage();

    // standard User-Agent set
    await localPage.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0',

    });
    return { browser: localBrowser, page: localPage };
}

// function (helper): scroll to the bottom of the page with lazy loading
async function scrollLazyLoadedContent(page) {
    let previousHeight = 0;

    // Loop to scroll through lazy-loaded content
    while (true) {
        const currentHeight = await page.evaluate(() => {
            return document.body.scrollHeight;
        });

        if (currentHeight === previousHeight) break;

        // Scroll to the bottom of the page
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });

        previousHeight = currentHeight;
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}



// Trigger browser initialization for testing
//startBrowser();

app.get('/', async (req, res) => {
    const url = req.query.url;
    const disableWebSecurity = req.query.DISABLE_WS;
    const disableHttp2 = req.query.DISABLE_HTTP2 === 'TRUE';
    const { browser, page } = await startBrowser(disableWebSecurity, disableHttp2 === 'TRUE');

    // URL flags for specific ATS
    const hrms = req.query.HRMS;
    const vip = req.query.VIP;
    const rona = req.query.RONA;

    // URL flags for specific functions
    const displayID = req.query.DISPLAY_ID;
    const initialClickSelector = req.query.INITIALCLICK;
    const scrollToBottom = req.query.SCROLL === 'BOTTOM';
    const acceptAllCookies = req.query.COOKIE === 'ALL';
    const noScriptFlag = req.query.NOSCRIPT;




    if (!url) {
        return res.status(400).send("URL parameter is required.");
    }


    try {
        await page.goto(url, { waitUntil: ['load', 'networkidle0'], timeout: 60000 });

        // Click "ACCEPT ALL" if cookie is requried / popup overlay is blocking page
        if (acceptAllCookies) {
            try {
                await page.waitForSelector("#btnCookieAcceptALL", { timeout: 5000 });
                await page.click("#btnCookieAcceptALL");
            } catch (err) {
                console.warn("Cookie acceptance button not found or failed to click.");
            }
        }

        // perform click on selector and wait if INITIALCLICK is present
        if (initialClickSelector) {

            await page.evaluate((selector) => {
                const element = document.querySelector(selector);
                if (element) element.click();
            }, initialClickSelector);

            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        let finalContent = '';

        // Specifically for employer RONA
        // ** May need to adjust this function when it has less then 250 jobs or doesn't have dropbox
        if (rona === 'TRUE') {

            // click dropbox to display 250 results per page
            const divElement = await page.$('div[role="combobox"][aria-haspopup="listbox"][id="mui-7"]');
            if (divElement) {
                await divElement.click();
                await new Promise(resolve => setTimeout(resolve, 1000));


                const listItemElement = await page.$('li[data-value="250"]');
                if (listItemElement) {
                    await listItemElement.click();
                    await new Promise(resolve => setTimeout(resolve, 1000));


                    const contentAfterLiClick = await page.content();
                    finalContent += contentAfterLiClick;

                    // click next page and add on content
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


        // HRMS ATS
        // ** This only works for one style of HRMS, may need to adjust
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

            await new Promise(resolve => setTimeout(resolve, 3000));

            let previousHeight = 0;

            // Loop to scroll through lazy-loaded content
            while (true) {
                const currentHeight = await page.evaluate(() => {
                    const scrollable = document.getElementById('win0divHRS_AGNT_RSLT_I$grid$0');
                    return scrollable.scrollHeight;
                });

                if (currentHeight === previousHeight) break;
                // Scroll until no more content loads
                await page.evaluate(() => {
                    const scrollable = document.getElementById('win0divHRS_AGNT_RSLT_I$grid$0');
                    if (scrollable) {
                        scrollable.scrollTop = scrollable.scrollHeight;
                    }
                });

                previousHeight = currentHeight;
                await new Promise(resolve => setTimeout(resolve, 2000));
            }


        }

        // VIP ATS
        if (vip === 'TRUE') {
            // Wait for the text "Loading site" to disappear within a div with class "processing"
            await page.waitForFunction(() => {
                const processingDiv = document.querySelector('.processing');
                if (processingDiv) {
                    return !processingDiv.textContent.includes('Loading site');
                }
                return true;
            });

            // actual index appears in second iframe
            const iframeElements = await page.$$('iframe[id$="_20"]');
            if (iframeElements.length > 1) {
                const iframeSrc = await page.evaluate(iframe => iframe.src, iframeElements[1]);
                const iframePage = await browser.newPage();

                // Set a standard user agent (iframe uses post request)
                await iframePage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.132 Safari/537.36');

                await iframePage.goto(iframeSrc, { waitUntil: ['load', 'networkidle0'], timeout: 120000 });

                await new Promise(resolve => setTimeout(resolve, 5000));

                const iframeContent = await iframePage.content();
                await iframePage.close();

                // Append the iframe content to the final content
                finalContent += "\n\n-------- Iframe Content --------\n\n" + iframeContent;
            } else {
                console.error('Unable to locate the desired iframe.');
            }


        }

        if (scrollToBottom) {
            await scrollLazyLoadedContent(page);
        }

        let content = await page.content();
        res.setHeader('Content-Type', 'text/plain');

        // replace all script elements with noscript so that it can appear on harvester testing
        if (noScriptFlag === 'TRUE') {
            finalContent = finalContent.replace(/<script/g, "<noscript");
            finalContent = finalContent.replace(/<\/script/g, "</noscript");
            content = content.replace(/<script/g, "<noscript");
            content = content.replace(/<\/script/g, "</noscript");
        }

        
        res.send(content + finalContent);  // include the finalContent which might contain iframe content


    } catch (error) {
        if (error instanceof puppeteer.errors.TimeoutError) {
            console.error('Puppeteer Timeout Error with URL:', url, '\nError Message:', error.message);
            res.status(500).send(`Timeout error while processing URL: ${url}`);
        } else {
            console.error('Error processing the URL:', url, '\nError Message:', error.message);
            res.status(500).send(`Failed to render content for URL: ${url}`);
        }
    } finally {
        await browser.close();
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
