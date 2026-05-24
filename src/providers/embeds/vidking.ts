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
  let hlsUrl = '';
  let mp4Url = '';

  // Try to find in script tags
  $('script').each((_, element) => {
    const scriptContent = $(element).html() || '';

    // Look for m3u8 URLs
    if (!hlsUrl) {
      const m3u8Match = scriptContent.match(/['"]([^'"]*\.m3u8[^'"]*)['"]/i);
      if (m3u8Match?.[1]) {
        hlsUrl = m3u8Match[1];
      }
    }

    // Look for mp4 URLs
    if (!mp4Url) {
      const mp4Match = scriptContent.match(/['"]([^'"]*\.mp4[^'"]*)['"]/i);
      if (mp4Match?.[1]) {
        mp4Url = mp4Match[1];
      }
    }
  });

  // If no streams found in scripts, try looking for video tags
  if (!hlsUrl && !mp4Url) {
    const videoTag = $('video source').attr('src');
    if (videoTag) {
      if (videoTag.includes('.m3u8')) {
        hlsUrl = videoTag;
      } else {
        mp4Url = videoTag;
      }
    }
  }

  // If still no streams, try looking for iframe sources
  if (!hlsUrl && !mp4Url) {
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

  if (mp4Url) {
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
              url: mp4Url,
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
  disabled: false,
  async scrape(ctx) {
    return scrape(ctx);
  },
});
