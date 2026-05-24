import { SourcererEmbed, SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';

const baseUrl = 'https://www.vidking.net';
const embedId = 'vidking';

function buildEmbedUrl(
  path: string,
  metadata: { title: string; year: string; imdbId: string },
): string {
  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set('title', metadata.title);
  url.searchParams.set('year', metadata.year);
  url.searchParams.set('imdbId', metadata.imdbId);
  return url.toString();
}

async function scrapeMovie(ctx: MovieScrapeContext): Promise<SourcererOutput> {
  const embedUrl = buildEmbedUrl(`/embed/movie/${ctx.media.tmdbId}`, {
    title: ctx.media.title,
    year: ctx.media.releaseYear.toString(),
    imdbId: ctx.media.imdbId ?? '',
  });

  const embeds: SourcererEmbed[] = [
    {
      embedId,
      url: JSON.stringify({
        url: embedUrl,
        title: ctx.media.title,
        year: ctx.media.releaseYear.toString(),
        imdbId: ctx.media.imdbId ?? '',
      }),
    },
  ];

  return {
    embeds,
  };
}

async function scrapeShow(ctx: ShowScrapeContext): Promise<SourcererOutput> {
  const embedUrl = buildEmbedUrl(
    `/embed/tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`,
    {
      title: ctx.media.title,
      year: ctx.media.releaseYear.toString(),
      imdbId: ctx.media.imdbId ?? '',
    },
  );

  const embeds: SourcererEmbed[] = [
    {
      embedId,
      url: JSON.stringify({
        url: embedUrl,
        title: ctx.media.title,
        year: ctx.media.releaseYear.toString(),
        imdbId: ctx.media.imdbId ?? '',
      }),
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
