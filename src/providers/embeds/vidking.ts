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

  // Look for HLS and MP4 streams in the page
  let hlsStreamUrl = '';
  let mp4StreamUrl = '';

  // Try to find in script tags
  $('script').each((_, element) => {
    const scriptContent = $(element).html() || '';

    // Look for m3u8 URLs (HLS streams) - use restrictive pattern to avoid matching whitespace
    if (!hlsStreamUrl) {
      const m3u8Match = scriptContent.match(/['"]([^\s'"]+\.m3u8[^\s'"]*)['"]/i);
      if (m3u8Match?.[1]) {
        hlsStreamUrl = m3u8Match[1];
      }
    }

    // Look for mp4 URLs - use restrictive pattern to avoid matching whitespace
    if (!mp4StreamUrl) {
      const mp4Match = scriptContent.match(/['"]([^\s'"]+\.mp4[^\s'"]*)['"]/i);
      if (mp4Match?.[1]) {
        mp4StreamUrl = mp4Match[1];
      }
    }
  });

  // If no streams found in scripts, try looking for video tags
  if (!hlsStreamUrl && !mp4StreamUrl) {
    const videoTag = $('video source').attr('src');
    if (videoTag) {
      if (videoTag.includes('.m3u8')) {
        hlsStreamUrl = videoTag;
      } else {
        mp4StreamUrl = videoTag;
      }
    }
  }

  // Return the extracted stream or throw an error
  if (hlsStreamUrl) {
    return {
      stream: [
        {
          id: 'primary',
          type: 'hls',
          playlist: hlsStreamUrl,
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

  if (mp4StreamUrl) {
    return {
      stream: [
        {
          id: 'primary',
          type: 'file',
          flags: [flags.CORS_ALLOWED],
          captions: [],
          qualities: {
            unknown: {
              type: 'mp4',
              url: mp4StreamUrl,
            },
          },
          preferredHeaders: {
            Origin: 'https://www.vidking.net',
            Referer: 'https://www.vidking.net/',
          },
        },
      ],
    };
  }

  // If no streams found, this could be because:
  // 1. The page structure has changed
  // 2. The streams are loaded dynamically with JavaScript
  throw new Error('Failed to extract streams from VidKing embed page');
}

export const vidkingScraper = makeEmbed({
  id: 'vidking',
  name: 'VidKing',
  rank: 206,
  disabled: true, // Disable until I have the time to fix this API
  async scrape(ctx) {
    return scrape(ctx);
  },
});
