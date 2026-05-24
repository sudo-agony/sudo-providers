import { flags } from '@/entrypoint/utils/targets';
import { makeEmbed } from '@/providers/base';
import { EmbedScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';
import puppeteer from 'puppeteer';

export const vidkingScraper = makeEmbed({
  id: 'vidking',
  name: 'VidKing',
  rank: 206,
  async scrape(ctx: EmbedScrapeContext) {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ],
    });

    let streamUrl: string | null = null;

    try {
      const page = await browser.newPage();

      // Set a realistic user‑agent and referer to avoid being blocked
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );
      await page.setExtraHTTPHeaders({
        Referer: 'https://www.vidking.net/',
      });

      // Intercept network requests to catch the .m3u8 playlist
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const url = request.url();
        if (url.includes('.m3u8')) {
          streamUrl = url;
          // Optionally abort the request to save bandwidth
          // request.abort();
        } else {
          request.continue();
        }
      });

      // Navigate to the embed URL
      await page.goto(ctx.url, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Wait for the video element to start loading (at least 5 seconds of buffering)
      try {
        await page.waitForFunction(
          () => {
            const video = document.querySelector('video');
            return video && video.duration > 0;
          },
          { timeout: 30000 }
        );
      } catch (err) {
        // If waiting for video fails, check if we already caught an .m3u8 request
        if (!streamUrl) {
          // One more attempt: look for any <source> or video.src
          streamUrl = await page.evaluate(() => {
            const video = document.querySelector('video');
            if (video && video.src) return video.src;
            const source = document.querySelector('source');
            if (source && source.src) return source.src;
            return null;
          });
        }
      }

      if (!streamUrl) {
        throw new NotFoundError('Could not find any playable stream (.m3u8)');
      }

      // Return the HLS stream
      return {
        stream: [
          {
            id: 'primary',
            type: 'hls',
            playlist: streamUrl,
            flags: [flags.CORS_ALLOWED],
            captions: [],
            preferredHeaders: {
              Origin: 'https://www.vidking.net',
              Referer: 'https://www.vidking.net/',
            },
          },
        ],
      };
    } catch (err) {
      console.error('VidKing embed error:', err);
      throw err;
    } finally {
      await browser.close();
    }
  },
});
