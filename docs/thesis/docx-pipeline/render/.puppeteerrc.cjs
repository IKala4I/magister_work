// Chrome for the Mermaid renderer lives inside the pipeline (render/.cache, git-ignored), pinned by
// the puppeteer version in package-lock.json — not in ~/.cache and not the machine's own Chrome.
// mmdc launches `headless: 'shell'`, i.e. chrome-headless-shell only; the full Chrome is not needed.
const path = require('path');
module.exports = {
  cacheDirectory: path.join(__dirname, '.cache', 'puppeteer'),
  chrome: { skipDownload: true },
};
