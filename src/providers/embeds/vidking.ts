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
    console.log('[VidKing] Starting embed scrape for URL:', ctx.url);

    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
    });

    let streamUrl: string | null = null;

    try {
      const page = await browser.newPage();

      // Set user agent and headers
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );
      await page.setExtraHTTPHeaders({
        Referer: 'https://www.vidking.net/',
      });

      // Log all network responses to see what's happening
      page.on('response', (response) => {
        const url = response.url();
        if (url.includes('.m3u8') || url.includes('master.m3u8') || url.includes('playlist.m3u8')) {
          console.log('[VidKing] Found .m3u8 response:', url);
          streamUrl = url;
        }
      });

      // Also intercept requests
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const url = request.url();
        if (url.includes('.m3u8')) {
          console.log('[VidKing] Intercepted .m3u8 request:', url);
          streamUrl = url;
        }
        request.continue();
      });

      // Navigate to the page
      console.log('[VidKing] Navigating to:', ctx.url);
      await page.goto(ctx.url, {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });

      // Wait for video element to appear
      try {
        await page.waitForSelector('video', { timeout: 30000 });
        console.log('[VidKing] Video element found');
      } catch (err) {
        console.log('[VidKing] Video element not found within timeout');
      }

      // Try to extract stream URL from the page
      const extractedUrl = await page.evaluate(() => {
        // Method 1: video.src
        const video = document.querySelector('video');
        if (video && video.src && video.src.includes('.m3u8')) {
          return video.src;
        }
        // Method 2: source elements
        const source = document.querySelector('source');
        if (source && source.src && source.src.includes('.m3u8')) {
          return source.src;
        }
        // Method 3: look for any element with data-video or data-src
        const videoContainer = document.querySelector('[data-video], [data-src]');
        if (videoContainer) {
          const attr = videoContainer.getAttribute('data-video') || videoContainer.getAttribute('data-src');
          if (attr && attr.includes('.m3u8')) return attr;
        }
        // Method 4: search all scripts for .m3u8 URLs
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const script of scripts) {
          const content = script.textContent || script.innerText;
          if (content) {
            const match = content.match(/(https?:)?\/\/[^\s'"]+\.m3u8[^\s'"]*/);
            if (match) return match[0];
          }
        }
        return null;
      });

      if (extractedUrl) {
        console.log('[VidKing] Extracted URL via evaluate:', extractedUrl);
        streamUrl = extractedUrl;
      }

      // If still no streamUrl, take a screenshot for debugging
      if (!streamUrl) {
        console.log('[VidKing] No stream URL found, saving screenshot');
        await page.screenshot({ path: '/tmp/vidking-error.png' });
        // Also dump page content
        const html = await page.content();
        console.log('[VidKing] Page HTML length:', html.length);
        // Optionally write to file
        // require('fs').writeFileSync('/tmp/vidking.html', html);
      }

      if (!streamUrl) {
        throw new NotFoundError('Could not find any .m3u8 stream URL');
      }

      console.log('[VidKing] Final stream URL:', streamUrl);

      // Ensure the URL is absolute
      let finalUrl = streamUrl;
      if (finalUrl.startsWith('//')) {
        finalUrl = 'https:' + finalUrl;
      } else if (finalUrl.startsWith('/')) {
        finalUrl = 'https://www.vidking.net' + finalUrl;
      }

      // Return the stream
      return {
        stream: [
          {
            id: 'primary',
            type: 'hls',
            playlist: finalUrl,
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
      console.error('[VidKing] Fatal error:', err);
      throw err;
    } finally {
      await browser.close();
    }
  },
});
