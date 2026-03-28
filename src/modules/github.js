const axios = require('axios');

/**
 * Fetches trending GitHub repositories or details for a specific repository.
 */
class GitHubModule {
  constructor(token = null) {
    this.token = token;
    this.apiBase = 'https://api.github.com';
  }

  /**
   * Fetches trending repositories for a given language.
   * Since GitHub doesn't have a direct "trending" API, we use the search API
   * to find highly starred repos created/updated recently.
   */
  async getTrending(language = '', days = 7) {
    try {
      const date = new Date();
      date.setDate(date.getDate() - days);
      const dateString = date.toISOString().split('T')[0];

      let query = `created:>${dateString}`;
      if (language) {
        query += ` language:${language}`;
      }

      console.log(`Fetching trending repos with query: ${query}`);

      const response = await axios.get(`${this.apiBase}/search/repositories`, {
        params: {
          q: query,
          sort: 'stars',
          order: 'desc',
          per_page: 5
        },
        headers: this.token ? { Authorization: `token ${this.token}` } : {}
      });

      return response.data.items.map(repo => ({
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        url: repo.html_url,
        stars: repo.stargazers_count,
        language: repo.language,
        owner: repo.owner.login
      }));
    } catch (error) {
      console.error('Error fetching trending repos:', error.message);
      throw error;
    }
  }

  /**
   * Fetches details for a specific repository URL.
   */
  async getRepoDetails(repoUrl) {
    try {
      const parts = repoUrl.replace('https://github.com/', '').split('/');
      const owner = parts[0];
      const repo = parts[1];

      const response = await axios.get(`${this.apiBase}/repos/${owner}/${repo}`, {
        headers: this.token ? { Authorization: `token ${this.token}` } : {}
      });

      const data = response.data;
      return {
        name: data.name,
        fullName: data.full_name,
        description: data.description,
        url: data.html_url,
        stars: data.stargazers_count,
        language: data.language,
        owner: data.owner.login
      };
    } catch (error) {
      console.error(`Error fetching repo details for ${repoUrl}:`, error.message);
      throw error;
    }
  }
}

module.exports = GitHubModule;
