import crypto from 'crypto-js';

import { flags } from '@/entrypoint/utils/targets';
import { EmbedOutput, makeEmbed } from '@/providers/base';
import { EmbedScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const baseUrl = 'https://www.vidking.net';
const apiBaseUrl = 'https://api.videasy.net';
const wasmUrl = `${baseUrl}/assets/wasm/module1.wasm`;
const hashidsUrl = 'https://cdnjs.cloudflare.com/ajax/libs/hashids/2.2.10/hashids.min.js';

const serverList = [
  { name: 'Oxygen', endpoint: 'mb-flix/sources-with-title' },
  { name: 'Hydrogen', endpoint: 'cdn/sources-with-title' },
  { name: 'Lithium', endpoint: 'downloader2/sources-with-title' },
  { name: 'Helium', endpoint: '1movies/sources-with-title' },
];

type VidKingMediaType = 'movie' | 'tv';

type VidKingSource = {
  url: string;
  quality: string;
};

type VidKingPayload = {
  sources?: VidKingSource[];
};

function stripRunnerSuffix(url: string): string {
  const markerIndex = url.indexOf(btoa('MEDIA='));
  if (markerIndex === -1) return url;
  return url.slice(0, markerIndex);
}

type VidKingWasm = {
  serve(): string;
  verify(hash: string): boolean;
  decrypt(message: string, key: number): string;
};

let hashidsPromise: Promise<any> | null = null;
let wasmPromise: Promise<VidKingWasm> | null = null;

function parseEmbedUrl(url: string): { mediaType: VidKingMediaType; tmdbId: string; seasonId: string; episodeId: string } {
  const parsedUrl = new URL(stripRunnerSuffix(url));
  const parts = parsedUrl.pathname.split('/').filter(Boolean);

  if (parts[0] !== 'embed' || (parts[1] !== 'movie' && parts[1] !== 'tv')) {
    throw new NotFoundError('Invalid VidKing embed url');
  }

  if (parts[1] === 'movie') {
    if (!parts[2]) throw new NotFoundError('Missing VidKing movie id');
    return {
      mediaType: 'movie',
      tmdbId: parts[2],
      seasonId: '1',
      episodeId: '1',
    };
  }

  if (!parts[2] || !parts[3] || !parts[4]) throw new NotFoundError('Missing VidKing tv episode data');

  return {
    mediaType: 'tv',
    tmdbId: parts[2],
    seasonId: parts[3],
    episodeId: parts[4],
  };
}

async function loadHashids(): Promise<any> {
  if (!hashidsPromise) {
    hashidsPromise = (async () => {
      const globalScope = globalThis as any;
      if (globalScope.Hashids) return globalScope.Hashids;

      const response = await fetch(hashidsUrl);
      if (!response.ok) throw new Error(`Failed to load Hashids: ${response.status}`);

      const script = await response.text();
      const previousWindow = globalScope.window;
      try {
        globalScope.window = globalScope;
        new Function(script)();
        if (!globalScope.Hashids) throw new Error('Hashids constructor unavailable');
        return globalScope.Hashids;
      } finally {
        if (previousWindow === undefined) delete globalScope.window;
        else globalScope.window = previousWindow;
      }
    })();
  }

  return hashidsPromise;
}

async function loadWasm(): Promise<VidKingWasm> {
  if (!wasmPromise) {
    wasmPromise = (async () => {
      const response = await fetch(wasmUrl);
      if (!response.ok) throw new Error(`Failed to load VidKing wasm: ${response.status}`);

      const bytes = await response.arrayBuffer();
      const imports = {
        env: {
          seed() {
            return Date.now() * Math.random();
          },
          abort(m: number, f: number, p: number, u: number) {
            throw new Error(`${m} in ${f}:${p}:${u}`);
          },
        },
      };

      const { instance } = await WebAssembly.instantiate(bytes, imports);
      const wasmExports = instance.exports as WebAssembly.Exports & {
        __new: (size: number, align: number) => number;
        serve: () => number;
        verify: (hashPtr: number) => number;
        decrypt: (messagePtr: number, key: number) => number;
        memory?: WebAssembly.Memory;
      };

      const memory = wasmExports.memory ?? (imports.env as { memory?: WebAssembly.Memory }).memory;
      if (!memory) throw new Error('VidKing wasm memory unavailable');
      const wasmMemory = memory;

      function decode(ptr: number | null): string | null {
        if (!ptr) return null;

        const end = ptr + (new Uint32Array(wasmMemory.buffer)[(ptr - 4) >>> 2] >>> 1);
        const view = new Uint16Array(wasmMemory.buffer);
        let start = ptr >>> 1;
        let output = '';

        for (; end - start > 1024; ) {
          output += String.fromCharCode(...view.subarray(start, (start += 1024)));
        }

        return output + String.fromCharCode(...view.subarray(start, end));
      }

      function encode(value: string): number {
        const ptr = wasmExports.__new(value.length << 1, 2) >>> 0;
        const view = new Uint16Array(wasmMemory.buffer);
        for (let i = 0; i < value.length; i += 1) {
          view[(ptr >>> 1) + i] = value.charCodeAt(i);
        }

        return ptr;
      }

      return {
        serve() {
          return decode(wasmExports.serve() >>> 0) ?? '';
        },
        verify(hash: string) {
          return wasmExports.verify(encode(hash)) !== 0;
        },
        decrypt(message: string, key: number) {
          return decode(wasmExports.decrypt(encode(message), key) >>> 0) ?? '';
        },
      };
    })();
  }

  return wasmPromise;
}

async function buildAesKey(seed: number): Promise<string> {
  const Hashids = await loadHashids();
  const hashids = new Hashids();
  const salt = '8c465aa8af6cbfd4c1f91bf0c8d678ba';
  const xorBytes = String(seed)
    .split('')
    .map((char, index) => char.charCodeAt(0) ^ salt.charCodeAt(index % salt.length));

  const encodedInput = xorBytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return hashids.encode(encodedInput);
}

async function decryptPayload(payload: string, tmdbId: string): Promise<VidKingPayload> {
  const globalScope = globalThis as any;
  const previousWindow = globalScope.window;
  const runtimeWindow = globalScope.window ?? globalScope;

  try {
    globalScope.window = runtimeWindow;

    const wasm = await loadWasm();
    new Function(wasm.serve())();

    if (typeof runtimeWindow.hash !== 'string' || runtimeWindow.hash.length === 0) {
      throw new Error('VidKing hash bootstrap failed');
    }

    if (!wasm.verify(runtimeWindow.hash)) {
      throw new Error('VidKing hash verification failed');
    }

    const seed = Number.parseInt(tmdbId, 10);
    const decrypted = wasm.decrypt(payload, seed);
    const key = await buildAesKey(seed);
    const plainText = crypto.AES.decrypt(decrypted, key).toString(crypto.enc.Utf8);

    return JSON.parse(plainText) as VidKingPayload;
  } finally {
    if (previousWindow === undefined) delete globalScope.window;
    else globalScope.window = previousWindow;
  }
}

function toStreams(payload: VidKingPayload): EmbedOutput['stream'] {
  return (payload.sources ?? [])
    .filter((source) => source.url && source.quality)
    .map((source, index) => ({
      id: `${source.quality.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-${index + 1}`,
      type: 'hls' as const,
      playlist: source.url,
      flags: [flags.CORS_ALLOWED],
      captions: [],
      preferredHeaders: {
        Origin: baseUrl,
        Referer: `${baseUrl}/`,
      },
    }));
}

async function scrape(ctx: EmbedScrapeContext): Promise<EmbedOutput> {
  const parsedUrl = new URL(stripRunnerSuffix(ctx.url));
  const { mediaType, tmdbId, seasonId, episodeId } = parseEmbedUrl(parsedUrl.toString());
  const metadata = {
    title: parsedUrl.searchParams.get('title') ?? '',
    year: parsedUrl.searchParams.get('year') ?? '',
    imdbId: parsedUrl.searchParams.get('imdbId') ?? '',
  };

  for (const server of serverList) {
    try {
      const response = await ctx.proxiedFetcher.full<string>(`${apiBaseUrl}/${server.endpoint}`, {
        query: {
          title: metadata.title,
          mediaType,
          year: metadata.year,
          episodeId,
          seasonId,
          tmdbId,
          imdbId: metadata.imdbId,
          _t: Date.now().toString(),
        },
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      });

      if (response.statusCode < 200 || response.statusCode >= 300) {
        continue;
      }

      const decryptedPayload = await decryptPayload(response.body, tmdbId);
      const streams = toStreams(decryptedPayload);
      if (streams.length === 0) continue;

      return {
        stream: streams,
      };
    } catch {
      continue;
    }
  }

  throw new NotFoundError('No playable VidKing streams found');
}

export const vidkingScraper = makeEmbed({
  id: 'vidking',
  name: 'VidKing',
  rank: 206,
  disabled: false,
  async scrape(ctx) {
    return scrape(ctx);
  },
});
