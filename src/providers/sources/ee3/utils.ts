import { load } from 'cheerio';

import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { parseSetCookie } from '@/utils/cookie';

import { baseUrl } from './common';
import { loginResponse } from './types';

export async function login(
  user: string,
  pass: string,
  ctx: ShowScrapeContext | MovieScrapeContext,
): Promise<string | null> {
  try {
    const req = await ctx.proxiedFetcher.full<string>('/login', {
      baseUrl,
      method: 'POST',
      body: new URLSearchParams({ user, pass, action: 'login' }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      readHeaders: ['Set-Cookie'],
    });
    
    // Check if response is valid JSON
    let res: loginResponse;
    try {
      res = JSON.parse(req.body);
    } catch (e) {
      console.error('Failed to parse login response:', req.body);
      return null;
    }

    // Only proceed if login was successful
    if (res.status !== 1) {
      return null;
    }

    const setCookieHeader = req.headers.get('Set-Cookie');
    if (!setCookieHeader) {
      return null;
    }

    const cookie = parseSetCookie(setCookieHeader);
    return cookie.PHPSESSID?.value || null;
  } catch (error) {
    console.error('Login error:', error);
    return null;
  }
}

export function parseSearch(body: string): { title: string; year: number; id: string }[] {
  const result: { title: string; year: number; id: string }[] = [];

  try {
    const $ = load(body);
    $('div.movie-item, div[data-id]').each((_, element) => {
      // Try different selectors as the structure might vary
      const title = $(element).find('.title').text().trim() || 
                    $(element).find('h3').text().trim() ||
                    $(element).attr('data-title');
      
      let year = parseInt($(element).find('.details span').first().text().trim(), 10);
      if (isNaN(year)) {
        const yearMatch = $(element).text().match(/(19|20)\d{2}/);
        year = yearMatch ? parseInt(yearMatch[0], 10) : 0;
      }
      
      const id = $(element).find('.control-buttons').attr('data-id') ||
                 $(element).attr('data-id');

      if (title && id) {
        result.push({ title, year: year || 0, id });
      }
    });
  } catch (error) {
    console.error('Parse search error:', error);
  }

  return result;
}
