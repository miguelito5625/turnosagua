const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  try {
    console.log('Starting Puppeteer...');
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    
    console.log('Navigating to http://localhost:4200...');
    await page.goto('http://localhost:4200', { waitUntil: 'networkidle0' });

    console.log('Capturing content...');
    const html = await page.content();
    
    fs.writeFileSync('pruebas/snapshot.html', html);
    console.log('Snapshot saved to pruebas/snapshot.html');

    await browser.close();
  } catch (error) {
    console.error('Error during snapshot:', error);
    process.exit(1);
  }
})();
