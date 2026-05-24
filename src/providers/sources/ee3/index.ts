import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { Caption } from '@/providers/captions';
import { compareMedia } from '@/utils/compare';
import { MovieScrapeContext } from '@/utils/context';
import { makeCookieHeader } from '@/utils/cookie';
import { NotFoundError } from '@/utils/errors';

import { baseUrl, password, username } from './common';
import { itemDetails, renewResponse } from './types';
import { login, parseSearch } from './utils';

async function comboScraper(ctx: MovieScrapeContext): Promise<SourcererOutput> {
  try {
    const sessionId = await login(username, password, ctx);
    if (!sessionId) throw new Error('Login failed - no session ID');

    // Search for the movie
    const searchBody = await ctx.proxiedFetcher<string>('/get', {
      baseUrl,
      method: 'POST',
      body: new URLSearchParams({ query: ctx.media.title, action: 'search' }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        cookie: makeCookieHeader({ PHPSESSID: sessionId }),
      },
    });

    const searchResults = parseSearch(searchBody);
    const match = searchResults.find((v) => v && compareMedia(ctx.media, v.title, v.year));
    
    if (!match?.id) throw new NotFoundError('No watchable item found');

    // Get movie details
    const detailsResponse = await ctx.proxiedFetcher<string>('/get', {
      baseUrl,
      method: 'POST',
      body: new URLSearchParams({ id: match.id, action: 'get_movie_info' }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        cookie: makeCookieHeader({ PHPSESSID: sessionId }),
      },
    });

    let details: itemDetails;
    try {
      details = JSON.parse(detailsResponse);
    } catch (e) {
      console.error('Failed to parse movie details:', detailsResponse);
      throw new Error('Invalid movie details response');
    }

    if (!details.message?.video) throw new Error('Failed to get the stream');

    // Get renewal key
    const renewResponse_raw = await ctx.proxiedFetcher<string>('/renew', {
      baseUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        cookie: makeCookieHeader({ PHPSESSID: sessionId }),
      },
    });

    let keyParams: renewResponse;
    try {
      keyParams = JSON.parse(renewResponse_raw);
    } catch (e) {
      console.error('Failed to parse renew response:', renewResponse_raw);
      throw new Error('Invalid renew response');
    }

    if (!keyParams.k) throw new Error('Failed to get the key');

    // Build stream URL
    const server = details.message.server === '1' ? 'https://vid.ee3.me/vid/' : 'https://vault.rips.cc/video/';
    const url = `${server}${details.message.video}?k=${encodeURIComponent(keyParams.k)}`;
    
    const captions: Caption[] = [];

    // Add subtitles if available
    if (details.message.subs?.toLowerCase() === 'yes' && details.message.imdbID) {
      captions.push({
        id: `https://rips.cc/subs/${details.message.imdbID}.vtt`,
        url: `https://rips.cc/subs/${details.message.imdbID}.vtt`,
        type: 'vtt',
        hasCorsRestrictions: false,
        language: 'en',
      });
    }

    return {
      embeds: [],
      stream: [
        {
          id: 'primary',
          type: 'file',
          flags: [flags.CORS_ALLOWED],
          captions,
          qualities: {
            720: {
              type: 'mp4',
              url,
            },
          },
        },
      ],
    };
  } catch (error) {
    console.error('EE3 scraper error:', error);
    throw error;
  }
}

export const ee3Scraper = makeSourcerer({
  id: 'ee3',
  name: 'EE3',
  rank: 150,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
});
