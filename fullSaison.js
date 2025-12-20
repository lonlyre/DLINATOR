const { chromium } = require('playwright');
const { spawn } = require('child_process');

(async () => {
  const pageUrl = process.argv[2];
  const timeoutMs = parseInt(process.argv[3]) || 30000; // timeout par défaut 30s

  if (!pageUrl) {
    console.error('Usage: node capture.js <page_url> [timeout_ms]');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });

  // récupérer la liste des épisodes
  const episodes = await page.$$eval('#selectEpisodes option', opts =>
    opts.map(o => ({ value: o.value, text: o.textContent.trim() }))
  );

  if (episodes.length === 0) {
    console.error('Aucun épisode trouvé.');
    await browser.close();
    process.exit(1);
  }

  console.log(`[+] ${episodes.length} épisodes trouvés. Téléchargement en cours...`);

  const seriesName = pageUrl
    .split('/')
    .filter(Boolean)
    .pop()
    .replace(/[^a-zA-Z0-9]/g, '-');

  for (let i = 0; i < episodes.length; i++) {
    const ep = episodes[i];
    console.log(`[+] Épisode : ${ep.text}`);

    // sélectionner l’épisode dans le select
    await page.selectOption('#selectEpisodes', ep.value);

    let started = false;
    let videoUrl = null;

    const urlPromise = new Promise(resolve => {
      const listener = request => {
        const url = request.url();
        if (!started && url.includes('master.m3u8')) {
          started = true;
          page.off('request', listener);
          resolve(url);
        } else if (!started && /\.mp4\?/.test(url)) {
          started = true;
          page.off('request', listener);
          resolve(url);
        }
      };
      page.on('request', listener);

      setTimeout(() => {
        if (!started) {
          page.off('request', listener);
          resolve(null);
        }
      }, timeoutMs);
    });

    // si master n'apparait pas immédiatement, clique sur le lecteur
    videoUrl = await urlPromise;
    if (!videoUrl) {
      console.log('[i] master.m3u8 non trouvé, tentative de clic sur le lecteur...');
      try {
        // adapter le sélecteur selon ton site
        await page.click('.video-js'); 
        videoUrl = await urlPromise;
      } catch (e) {
        console.warn('[!] Impossible de cliquer sur le lecteur.');
      }
    }

    if (!videoUrl) {
      console.warn(`[!] Timeout pour l'épisode ${ep.text}, passage au suivant.`);
      continue;
    }

    console.log('[+] URL capturée :', videoUrl);

    const episodeNumber = ep.text.match(/\d+/)?.[0] || ep.value;
    const output = `${seriesName}-episode${episodeNumber}.mp4`;

    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-headers', 'Referer: https://anime-sama.eu',
        '-i', videoUrl,
        '-c', 'copy',
        output
      ], { stdio: 'inherit' });

      ffmpeg.on('close', () => resolve());
      ffmpeg.on('error', reject);
    });

    console.log(`[+] Épisode téléchargé : ${output}`);
  }

  console.log('[+] Tous les épisodes disponibles ont été traités !');
  await browser.close();
})();

