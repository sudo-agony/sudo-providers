import { SourcererEmbed, SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';

const baseUrl = 'https://www.vidking.net';
const embedId = 'vidking';

async function scrapeMovie(ctx: MovieScrapeContext): Promise<SourcererOutput> {
  const embedUrl = `${baseUrl}/embed/movie/${ctx.media.tmdbId}`;

  const embeds: SourcererEmbed[] = [
    {
      embedId,
      url: embedUrl,
    },
  ];

  return {
    embeds,
  };
}

async function scrapeShow(ctx: ShowScrapeContext): Promise<SourcererOutput> {
  const embedUrl = `${baseUrl}/embed/tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`;

  const embeds: SourcererEmbed[] = [
    {
      embedId,
      url: embedUrl,
    },
  ];

  return {
    embeds,
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
