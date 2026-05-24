import { flags } from '@/entrypoint/utils/targets';
import { SourcererEmbed, SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const baseUrl = 'https://autoembed.net/';

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  try {
    // Build query parameters
    const query: Record<string, string> = {
      id: ctx.media.tmdbId?.toString() || '',
    };
    
    if (ctx.media.type === 'show') {
      query.s = ctx.media.season.number.toString();
      query.e = ctx.media.episode.number.toString();
    }
    
    // Validate we have an ID
    if (!query.id) {
      throw new NotFoundError('No TMDB ID provided');
    }

    // Fetch the player page
    const playerPage = await ctx.proxiedFetcher<string>('/embed/player.php', {
      baseUrl,
      query,
    });

    if (!playerPage) {
      throw new NotFoundError('Failed to fetch player page');
    }

    // Try multiple regex patterns to find the file data
    let fileDataMatch: RegExpMatchArray | null = null;
    let fileData: { title: string; file: string }[] = [];
    
    // Pattern 1: Standard JSON array with "file" property
    const pattern1 = /"file":\s*(\[.*?\])/s;
    fileDataMatch = playerPage.match(pattern1);
    
    if (fileDataMatch && fileDataMatch[1]) {
      try {
        let jsonStr = fileDataMatch[1];
        // Clean up the JSON string
        jsonStr = jsonStr.replace(/,\s*\]$/, ']'); // Remove trailing commas
        jsonStr = jsonStr.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":'); // Ensure property names are quoted
        fileData = JSON.parse(jsonStr);
      } catch (e) {
        console.error('Failed to parse file data with pattern 1:', e);
      }
    }
    
    // Pattern 2: Try to find sources array
    if (fileData.length === 0) {
      const pattern2 = /sources:\s*(\[.*?\])/s;
      fileDataMatch = playerPage.match(pattern2);
      if (fileDataMatch && fileDataMatch[1]) {
        try {
          fileData = JSON.parse(fileDataMatch[1]);
        } catch (e) {
          console.error('Failed to parse file data with pattern 2:', e);
        }
      }
    }
    
    // Pattern 3: Look for any array of objects with file/title properties
    if (fileData.length === 0) {
      const pattern3 = /\[\s*\{\s*"title":\s*"[^"]+",\s*"file":\s*"[^"]+"\s*\},\s*\{\s*"title":\s*"[^"]+",\s*"file":\s*"[^"]+"\s*\}\]/gs;
      fileDataMatch = playerPage.match(pattern3);
      if (fileDataMatch) {
        try {
          // Take the first match that looks like a proper array
          const possibleArray = fileDataMatch.find(match => match.includes('title') && match.includes('file'));
          if (possibleArray) {
            fileData = JSON.parse(possibleArray);
          }
        } catch (e) {
          console.error('Failed to parse file data with pattern 3:', e);
        }
      }
    }
    
    // Pattern 4: Look for individual stream objects (more aggressive)
    if (fileData.length === 0) {
      const titleMatches = playerPage.matchAll(/"title":\s*"([^"]+)"/g);
      const fileMatches = playerPage.matchAll(/"file":\s*"([^"]+)"/g);
      
      const titles = [...titleMatches].map(m => m[1]);
      const files = [...fileMatches].map(m => m[1]);
      
      // Pair them up if we have matching counts
      const minLength = Math.min(titles.length, files.length);
      for (let i = 0; i < minLength; i++) {
        fileData.push({
          title: titles[i],
          file: files[i],
        });
      }
    }

    if (fileData.length === 0) {
      throw new NotFoundError('No stream data found in player page');
    }

    // Build embeds array
    const embeds: SourcererEmbed[] = [];
    
    for (const stream of fileData) {
      const url = stream.file;
      const title = stream.title;
      
      if (!url || !title) continue;
      
      // Create a clean embed ID from the title
      const embedId = `autoembed-${title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-')}`;
      
      embeds.push({ 
        embedId, 
        url 
      });
    }

    if (embeds.length === 0) {
      throw new NotFoundError('No valid embeds found');
    }

    return {
      embeds,
    };
  } catch (error) {
    console.error('Autoembed scraper error:', error);
    throw error;
  }
}

export const autoembedScraper = makeSourcerer({
  id: 'autoembed',
  name: 'Autoembed',
  rank: 90,
  disabled: false,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
