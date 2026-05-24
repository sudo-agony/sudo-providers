// Updated source-file

import { SourcererEmbed, SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';

const baseUrl = 'https://www.vidking.net';
const embedId = 'vidking';

function buildEmbedUrl(path: string): string {
  const url = new URL(`${baseUrl}${path}`);
  // You can keep URL parameters for customization, like autoPlay
  url.searchParams.set('autoPlay', 'true');
  return url.toString();
}

async function scrapeMovie(ctx: MovieScrapeContext): Promise<SourcererOutput> {
  // Only pass the TMDB ID in the URL path
  const embedUrl = buildEmbedUrl(`/embed/movie/${ctx.media.tmdbId}`);

  return {
    embeds: [{ embedId, url: embedUrl }],
  };
}

async function scrapeShow(ctx: ShowScrapeContext): Promise<SourcererOutput> {
  // Only pass the TMDB ID, season, and episode in the URL path
  const embedUrl = buildEmbedUrl(`/embed/tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`);

  return {
    embeds: [{ embedId, url: embedUrl }],
  };
}

export const vidkingScraper = makeSourcerer({
  id: 'vidking',
  name: 'VidKing',
  rank: 100,
  flags: [],
  scrapeMovie,
  scrapeShow,
});
