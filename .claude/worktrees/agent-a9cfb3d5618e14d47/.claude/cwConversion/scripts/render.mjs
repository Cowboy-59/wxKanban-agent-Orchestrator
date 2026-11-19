import puppeteer from 'puppeteer';
import { pathToFileURL } from 'url';

const html = process.argv[2];
const out = process.argv[3];
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1016, height: 760, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(html).href, { waitUntil: 'networkidle0' });
await page.screenshot({ path: out });
await browser.close();
console.log('rendered', out);
