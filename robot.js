const puppeteer = require('puppeteer');

const options = {
  width: 2560,
  height: 1600,
};

const initBrowser = settings => {
  return puppeteer.launch({
    headless: false,
    args: [
      `--window-size=${settings.width},${settings.height}`,
    ],
    executablePath: '/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome',
  });
};

(async () => {
  const browser = await initBrowser(options);
  const page = await browser.newPage();
  const link = 'http://localhost:3000/demo?symbol=ENJUSDTPERP&interval=5m';

  await page.goto(link, {
    timeout: 0,
    waitUntil: 'domcontentloaded',
  });


})();

const sleep = async ms => new Promise(resolve => setTimeout(resolve, ms));
