import { flags } from '@/entrypoint/utils/targets';
import { makeEmbed } from '@/providers/base';
import { NotFoundError } from '@/utils/errors';

const providers = [
  {
    id: 'autoembed-english',
    rank: 10,
    name: 'English',
  },
  {
    id: 'autoembed-hindi',
    rank: 9,
    disabled: true,
    name: 'Hindi',
  },
  {
    id: 'autoembed-tamil',
    rank: 8,
    disabled: true,
    name: 'Tamil',
  },
  {
    id: 'autoembed-telugu',
    rank: 7,
    disabled: true,
    name: 'Telugu',
  },
  {
    id: 'autoembed-bengali',
    rank: 6,
    disabled: true,
    name: 'Bengali',
  },
];

function embed(provider: { id: string; rank: number; disabled?: boolean; name: string }) {
  return makeEmbed({
    id: provider.id,
    name: provider.name,
    disabled: provider.disabled,
    rank: provider.rank,
    async scrape(ctx) {
      try {
        if (!ctx.url) {
          throw new NotFoundError('No URL provided for embed');
        }
        
        let playlistUrl = ctx.url;
        
        // Normalize URL
        if (playlistUrl.startsWith('//')) {
          playlistUrl = `https:${playlistUrl}`;
        } else if (playlistUrl.startsWith('/')) {
          playlistUrl = `https://autoembed.net${playlistUrl}`;
        }
        
        // Check if it's a valid stream URL (m3u8 or mp4)
        const isValidStream = playlistUrl.match(/\.(m3u8|mp4|mkv|webm)(\?|$)/i);
        
        if (!isValidStream) {
          throw new NotFoundError('No direct stream URL found in autoembed response');
        }
        
        return {
          stream: [
            {
              id: 'primary',
              type: playlistUrl.includes('.m3u8') ? 'hls' : 'file',
              playlist: playlistUrl,
              flags: [flags.CORS_ALLOWED],
              captions: [],
            },
          ],
        };
      } catch (error) {
        console.error(`Error in ${provider.id} embed:`, error);
        throw error;
      }
    },
  });
}

export const [
  autoembedEnglishScraper,
  autoembedHindiScraper,
  autoembedBengaliScraper,
  autoembedTamilScraper,
  autoembedTeluguScraper,
] = providers.map(embed);
