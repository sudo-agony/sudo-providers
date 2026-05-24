import { load } from 'cheerio';

import { SourcererEmbed, makeSourcerer } from '@/providers/base';
import { closeLoadScraper } from '@/providers/embeds/closeload';
import { ridooScraper } from '@/providers/embeds/ridoo';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

import { IframeSourceResult, SearchResult } from './types';

const ridoMoviesBase = `https://ridomovies.tv`;
const ridoMoviesApiBase = `${ridoMoviesBase}/core/api`;

const universalScraper = async (ctx: MovieScrapeContext | ShowScrapeContext) => {
  try {
    // Search for the media
    const searchResult = await ctx.proxiedFetcher<SearchResult>('/search', {
      baseUrl: ridoMoviesApiBase,
      query: {
        q: ctx.media.title,
      },
    });

    // Validate search result structure
    if (!searchResult?.data?.items || !Array.isArray(searchResult.data.items)) {
      throw new NotFoundError('Invalid search response structure');
    }

    if (searchResult.data.items.length === 0) {
      throw new NotFoundError('No search results found');
    }

    // Parse media data from search results
    const mediaData = searchResult.data.items
      .filter((movieEl) => movieEl?.contentable?.releaseYear && movieEl?.fullSlug)
      .map((movieEl) => ({
        name: movieEl.title || '',
        year: movieEl.contentable.releaseYear,
        fullSlug: movieEl.fullSlug,
      }));

    if (mediaData.length === 0) {
      throw new NotFoundError('No valid media items found in search results');
    }

    // Find matching media
    const targetMedia = mediaData.find(
      (m) => m.name.toLowerCase() === ctx.media.title.toLowerCase() && 
             m.year === ctx.media.releaseYear?.toString()
    );

    if (!targetMedia?.fullSlug) {
      throw new NotFoundError('No watchable item found for the specified title/year');
    }

    let iframeSourceUrl = `/${targetMedia.fullSlug}/videos`;

    // Handle TV shows
    if (ctx.media.type === 'show') {
      try {
        const showPageResult = await ctx.proxiedFetcher<string>(`/${targetMedia.fullSlug}`, {
          baseUrl: ridoMoviesBase,
        });

        const fullEpisodeSlug = `season-${ctx.media.season.number}/episode-${ctx.media.episode.number}`;
        // Fixed regex pattern to be more reliable
        const regexPattern = new RegExp(
          `"id":"(\\d+)"[^}]*"fullSlug":"[^"]*${fullEpisodeSlug.replace(/\//g, '\\/')}[^"]*"`,
          'i'
        );
        
        const match = showPageResult.match(regexPattern);
        if (!match || !match[1]) {
          throw new NotFoundError(`No episode found for ${fullEpisodeSlug}`);
        }
        
        const episodeId = match[1];
        iframeSourceUrl = `/episodes/${episodeId}/videos`;
      } catch (error) {
        console.error('Error fetching show details:', error);
        throw new NotFoundError('Failed to fetch episode information');
      }
    }

    // Get iframe source
    let iframeSource: IframeSourceResult;
    try {
      iframeSource = await ctx.proxiedFetcher<IframeSourceResult>(iframeSourceUrl, {
        baseUrl: ridoMoviesApiBase,
      });
    } catch (error) {
      console.error('Error fetching iframe source:', error);
      throw new NotFoundError('Failed to fetch video source');
    }

    // Validate iframe source structure
    if (!iframeSource?.data || !Array.isArray(iframeSource.data) || iframeSource.data.length === 0) {
      throw new NotFoundError('No video sources found');
    }

    const firstVideo = iframeSource.data[0];
    if (!firstVideo?.url) {
      throw new NotFoundError('Invalid video source URL');
    }

    // Parse iframe URL from the HTML content
    let iframeUrl: string | null = null;
    try {
      const iframeSource$ = load(firstVideo.url);
      iframeUrl = iframeSource$('iframe').attr('data-src') || iframeSource$('iframe').attr('src');
    } catch (error) {
      console.error('Error parsing iframe HTML:', error);
      throw new NotFoundError('Failed to parse video embed code');
    }

    if (!iframeUrl) {
      throw new NotFoundError('No iframe URL found in video source');
    }

    // Build embeds array
    const embeds: SourcererEmbed[] = [];
    
    if (iframeUrl.includes('closeload')) {
      embeds.push({
        embedId: closeLoadScraper.id,
        url: iframeUrl,
      });
    } else if (iframeUrl.includes('ridoo')) {
      embeds.push({
        embedId: ridooScraper.id,
        url: iframeUrl,
      });
    } else {
      // If it's a direct video URL, add it as a fallback
      embeds.push({
        embedId: 'direct',
        url: iframeUrl,
      });
    }

    if (embeds.length === 0) {
      throw new NotFoundError('No compatible embeds found for the video');
    }

    return {
      embeds,
    };
  } catch (error) {
    console.error('RidoMovies scraper error:', error);
    throw error;
  }
};

export const ridooMoviesScraper = makeSourcerer({
  id: 'ridomovies',
  name: 'RidoMovies',
  rank: 120,
  flags: [],
  scrapeMovie: universalScraper,
  scrapeShow: universalScraper,
});
