import { load } from 'cheerio';

import { flags } from '@/entrypoint/utils/targets';
import { EmbedOutput, makeEmbed } from '@/providers/base';
import { EmbedScrapeContext } from '@/utils/context';

async function scrape(ctx: EmbedScrapeContext): Promise<EmbedOutput> {
  // Fetch the vidking embed page
  const html = await ctx.proxiedFetcher<string>(ctx.url, {
    headers: {
      Referer: 'https://www.vidking.net/',
      Origin: 'https://www.vidking.net',
    },
  });

  // Try to extract sources from the page
  const $ = load(html);

  // Look for HLS streams in the page
  // VidKing typically embeds M3U8 URLs in script tags or data attributes
  let hlsUrl = '';

  // Try to find in script tags
  $('script').each((_, element) => {
    const scriptContent = $(element).html() || '';

    // Look for m3u8 or .mp4 URLs
    const m3u8Match = scriptContent.match(/['"]([^'"]*\.m3u8[^'"]*)['"]/i);
    if (m3u8Match?.[1]) {
      hlsUrl = m3u8Match[1];
      return false; // break
    }

    const mp4Match = scriptContent.match(/['"]([^'"]*\.mp4[^'"]*)['"]/i);
    if (mp4Match?.[1]) {
      hlsUrl = mp4Match[1];
      return false; // break
    }
  });

  // If no streams found in scripts, try looking for video tags or other common patterns
  if (!hlsUrl) {
    const videoTag = $('video source').attr('src');
    if (videoTag) {
      hlsUrl = videoTag;
    }
  }

  // If still no streams, try looking for iframe sources
  if (!hlsUrl) {
    const iframeTag = $('iframe').attr('src');
    if (iframeTag) {
      hlsUrl = iframeTag;
    }
  }

  // Return the extracted stream or throw an error
  if (hlsUrl) {
    return {
      stream: [
        {
          id: 'primary',
          type: 'hls',
          playlist: hlsUrl,
          flags: [flags.CORS_ALLOWED],
          captions: [],
          preferredHeaders: {
            Origin: 'https://www.vidking.net',
            Referer: 'https://www.vidking.net/',
          },
        },
      ],
    };
  }

  // If no HLS URL found, this could be because:
  // 1. The page structure has changed
  // 2. The API is blocking the request
  // 3. The streams are loaded dynamically with JavaScript
  throw new Error('Failed to extract streams from VidKing embed page');
}

export const vidkingScraper = makeEmbed({
  id: 'vidking',
  name: 'VidKing',
  rank: 206,
  disabled: false,
  async scrape(ctx) {
    return scrape(ctx);
  },
});
