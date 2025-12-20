const { chromium } = require('playwright');
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');

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

  // afficher la liste et demander le choix
  console.log('Épisodes disponibles :');
  episodes.forEach((ep, i) => console.log(`${i + 1}. ${ep.text}`));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (q) => new Promise(resolve => rl.question(q, resolve));
  const choice = await question('Choisis le numéro de l’épisode : ');
  rl.close();

  const selected = episodes[parseInt(choice) - 1];
  if (!selected) {
    console.error('Numéro invalide.');
    await browser.close();
    process.exit(1);
  }

  console.log(`[+] Épisode choisi : ${selected.text}`);

  // sélectionner l’épisode
  await page.selectOption('#selectEpisodes', selected.value);

  const seriesName = pageUrl
    .split('/')
    .filter(Boolean)
    .pop()
    .replace(/[^a-zA-Z0-9]/g, '-');

  const episodeNumber = selected.text.match(/\d+/)?.[0] || selected.value;
  const output = `${seriesName}-episode${episodeNumber}.mp4`;

  // attendre la vidéo
  let videoUrl = null;
  let started = false;

  const urlPromise = new Promise(resolve => {
    const listener = request => {
      const url = request.url();
      // priorité master.m3u8
      if (!started && url.includes('master.m3u8')) {
        started = true;
        page.off('request', listener);
        resolve(url);
      }
      // sinon récupérer un mp4 direct
      else if (!started && /\.mp4\?/.test(url)) {
        started = true;
        page.off('request', listener);
        resolve(url);
      }
    };

    page.on('request', listener);

    setTimeout(async () => {
      if (!started) {
        // tenter de cliquer sur le bouton play ou download
        try {
          const playButton = await page.$('button.play, .vjs-big-play-button, a#download'); 
          if (playButton) {
            console.log('[i] Clic sur le bouton pour déclencher la vidéo...');
            await playButton.click();
          }
        } catch (err) {
          console.warn('[!] Impossible de cliquer sur le bouton pour la vidéo', err);
        }
        // attendre encore un peu après le clic
        setTimeout(() => {
          if (!started) {
            page.off('request', listener);
            resolve(null);
          }
        }, 5000); // 5s supplémentaires
      }
    }, timeoutMs);
  });

  videoUrl = await urlPromise;

  if (!videoUrl) {
    console.error(`[!] Timeout : aucune vidéo trouvée pour l'épisode ${episodeNumber}`);
    await browser.close();
    process.exit(1);
  }

  console.log('[+] URL vidéo capturée :', videoUrl);

  const ffmpeg = spawn('ffmpeg', [
    '-headers', 'Referer: https://anime-sama.eu',
    '-i', videoUrl,
    '-c', 'copy',
    output
  ], { stdio: 'inherit' });

  ffmpeg.on('close', async () => {
    console.log(`[+] Épisode téléchargé : ${output}`);
    await browser.close();
    process.exit(0);
  });

})();

