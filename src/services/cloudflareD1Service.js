class CloudflareD1Client {
  constructor({
    accountId,
    databaseId,
    apiToken,
    fetchImpl = globalThis.fetch
  } = {}) {
    this.accountId = String(accountId || '').trim();
    this.databaseId = String(databaseId || '').trim();
    this.apiToken = String(apiToken || '').trim();
    this.fetchImpl = fetchImpl;
  }

  static fromEnv(options = {}) {
    return new CloudflareD1Client({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      ...options
    });
  }

  static hasAnyEnvironmentConfig(env = process.env) {
    return Boolean(
      String(env.CLOUDFLARE_ACCOUNT_ID || '').trim() ||
      String(env.CLOUDFLARE_D1_DATABASE_ID || '').trim() ||
      String(env.CLOUDFLARE_API_TOKEN || '').trim()
    );
  }

  isConfigured() {
    return Boolean(this.accountId && this.databaseId && this.apiToken);
  }

  validateConfig() {
    const missing = [];
    if (!this.accountId) missing.push('CLOUDFLARE_ACCOUNT_ID');
    if (!this.databaseId) missing.push('CLOUDFLARE_D1_DATABASE_ID');
    if (!this.apiToken) missing.push('CLOUDFLARE_API_TOKEN');
    if (missing.length) {
      throw new Error('Thiếu cấu hình Cloudflare D1: ' + missing.join(', '));
    }
    if (!/^[a-f0-9]{32}$/i.test(this.accountId)) {
      throw new Error('CLOUDFLARE_ACCOUNT_ID phải gồm 32 ký tự hex.');
    }
    if (!/^[a-f0-9-]{36}$/i.test(this.databaseId)) {
      throw new Error('CLOUDFLARE_D1_DATABASE_ID không đúng định dạng UUID.');
    }
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('Runtime không hỗ trợ fetch để kết nối Cloudflare D1.');
    }
  }

  async request(body) {
    this.validateConfig();
    const endpoint = 'https://api.cloudflare.com/client/v4/accounts/' +
      encodeURIComponent(this.accountId) +
      '/d1/database/' + encodeURIComponent(this.databaseId) + '/query';

    const response = await this.fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + this.apiToken,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000)
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.success !== true) {
      const cloudflareMessage = Array.isArray(payload?.errors)
        ? payload.errors.map(item => item.message).filter(Boolean).join('; ')
        : '';
      throw new Error(
        'Cloudflare D1 request thất bại (HTTP ' + response.status + ')' +
        (cloudflareMessage ? ': ' + cloudflareMessage : '.')
      );
    }

    const results = Array.isArray(payload.result) ? payload.result : [];
    const failed = results.find(result => result?.success === false);
    if (failed) {
      throw new Error('Cloudflare D1 query lỗi: ' + JSON.stringify(failed.errors || []));
    }
    return results;
  }

  async query(sql, params = []) {
    if (typeof sql !== 'string' || !sql.trim()) {
      throw new Error('D1 SQL query không được để trống.');
    }
    if (!Array.isArray(params)) throw new TypeError('D1 params phải là array.');
    const results = await this.request({
      sql,
      params: params.map(value => value === null || value === undefined ? null : String(value))
    });
    return results[0] || { success: true, results: [], meta: {} };
  }

  async batch(queries) {
    if (!Array.isArray(queries) || queries.length === 0) return [];
    if (queries.length > 50) {
      throw new Error('Mỗi lần gửi D1 batch tối đa 50 câu lệnh.');
    }
    const batch = queries.map(item => {
      if (!item || typeof item.sql !== 'string' || !item.sql.trim()) {
        throw new Error('D1 batch chứa SQL không hợp lệ.');
      }
      const params = Array.isArray(item.params) ? item.params : [];
      return {
        sql: item.sql,
        params: params.map(value => value === null || value === undefined ? null : String(value))
      };
    });
    return this.request({ batch });
  }

  async ping() {
    const result = await this.query('SELECT 1 AS connected');
    return result.results?.[0]?.connected === 1 ||
      result.results?.[0]?.connected === '1';
  }
}

module.exports = { CloudflareD1Client };
