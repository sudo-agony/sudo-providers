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

      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );
      await page.setExtraHTTPHeaders({
        Referer: 'https://www.vidking.net/',
      });

      // Intercept responses (not just requests) to capture the actual m3u8 URL
      await page.setRequestInterception(true);
      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('.m3u8')) {
          streamUrl = url;
          console.log('Captured m3u8 URL:', streamUrl);
        }
      });

      // Navigate and wait for network to be mostly idle
      await page.goto(ctx.url, {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });

      // Give some time for any delayed requests
      await new Promise(resolve => setTimeout(resolve, 5000));

      // If we didn't capture via network, try to extract from page
      if (!streamUrl) {
        streamUrl = await page.evaluate(() => {
          // Check video element
          const video = document.querySelector('video');
          if (video && video.src) return video.src;
          
          // Check source elements
          const source = document.querySelector('source');
          if (source && source.src) return source.src;
          
          // Search all scripts for m3u8
          const scripts = Array.from(document.querySelectorAll('script'));
          for (const script of scripts) {
            const content = script.textContent || script.innerText;
            if (content) {
              const match = content.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/i);
              if (match) return match[1];
            }
          }
          
          // Check for any iframe that might contain the player
          const iframe = document.querySelector('iframe');
          if (iframe && iframe.src) return iframe.src;
          
          return null;
        });
      }

      if (!streamUrl) {
        // As a last resort, get the page HTML and use regex
        const html = await page.content();
        const regex = /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i;
        const match = html.match(regex);
        if (match) streamUrl = match[1];
      }

      if (!streamUrl) {
        throw new NotFoundError('Could not find any playable stream (.m3u8)');
      }

      // Ensure URL is absolute
      if (streamUrl.startsWith('//')) {
        streamUrl = `https:${streamUrl}`;
      }

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
