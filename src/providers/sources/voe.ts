import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';

const embedId = 'voe';
const baseEmbedUrl = 'https://voe.sx/embed';

function buildEmbedUrl(path: string): string {
  return `${baseEmbedUrl}${path}`;
}

async function scrapeMovie(ctx: MovieScrapeContext): Promise<SourcererOutput> {
  // Construct URL like: https://voe.sx/embed/tmdb/{tmdbId}
  const embedUrl = buildEmbedUrl(`/tmdb/${ctx.media.tmdbId}`);
  
  return {
    embeds: [{ embedId, url: embedUrl }],
  };
}

async function scrapeShow(ctx: ShowScrapeContext): Promise<SourcererOutput> {
  // Construct URL like: https://voe.sx/embed/tmdb/{tmdbId}/{season}/{episode}
  const embedUrl = buildEmbedUrl(
    `/tmdb/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`
  );
  
  return {
    embeds: [{ embedId, url: embedUrl }],
  };
}

export const voeSourceScraper = makeSourcerer({
  id: 'voe',
  name: 'VOE.sx',
  rank: 130, // Adjust rank as needed
  flags: [],
  scrapeMovie,
  scrapeShow,
});
