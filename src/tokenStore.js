import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class TokenStore {
  constructor({ tokenFile, initialRefreshToken, now = () => Date.now() }) {
    this.tokenFile = tokenFile;
    this.initialRefreshToken = initialRefreshToken;
    this.now = now;
    this.tokens = null;
  }

  async load() {
    if (this.tokens) return this.tokens;

    try {
      const body = await readFile(this.tokenFile, 'utf8');
      this.tokens = JSON.parse(body);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.tokens = {
        refresh_token: this.initialRefreshToken || '',
        access_token: '',
        expires_at: 0
      };
    }

    if (!this.tokens.refresh_token && this.initialRefreshToken) {
      this.tokens.refresh_token = this.initialRefreshToken;
    }

    return this.tokens;
  }

  async getRefreshToken() {
    const tokens = await this.load();
    return tokens.refresh_token;
  }

  async getAccessToken() {
    const tokens = await this.load();
    if (tokens.access_token && tokens.expires_at && tokens.expires_at - 60_000 > this.now()) {
      return tokens.access_token;
    }
    return '';
  }

  async save(tokenResponse) {
    const current = await this.load();
    const next = {
      ...current,
      access_token: tokenResponse.access_token || current.access_token || '',
      refresh_token: tokenResponse.refresh_token || current.refresh_token || '',
      token_type: tokenResponse.token_type || current.token_type || 'Bearer',
      scope: tokenResponse.scope || current.scope || '',
      expires_at: this.now() + Number(tokenResponse.expires_in || 0) * 1000
    };

    this.tokens = next;
    await mkdir(dirname(this.tokenFile), { recursive: true });
    await writeFile(this.tokenFile, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    return next;
  }
}

