import { flags } from '@/entrypoint/utils/targets';
import { makeEmbed, EmbedOutput } from '@/providers/base';
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
    async scrape(ctx): Promise<EmbedOutput> {
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
        
        // Check if it's a valid stream URL
        const isHls = playlistUrl.match(/\.m3u8(\?|$)/i);
        const isMp4 = playlistUrl.match(/\.mp4(\?|$)/i);
        
        if (isHls) {
          // Return HLS stream – only include properties that exist on HlsBasedStream
          return {
            stream: [
              {
                type: 'hls' as const,
                playlist: playlistUrl,
              },
            ],
          };
        } else if (isMp4) {
          // Return MP4 file stream with qualities
          return {
            stream: [
              {
                type: 'file' as const,
                qualities: {
                  unknown: {
                    type: 'mp4',
                    url: playlistUrl,
                  },
                },
              },
            ],
          };
        } else {
          throw new NotFoundError('No valid stream URL found (needs .m3u8 or .mp4)');
        }
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
