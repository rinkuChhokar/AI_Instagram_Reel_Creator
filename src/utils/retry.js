/**
 * Simple retry utility with exponential backoff for handling 429 Rate Limits.
 */
async function withRetry(fn, options = {}) {
    const {
        maxRetries = 3,
        initialDelay = 5000, // 5 seconds initial delay for 429s
        onRetry = (err, attempt) => console.log(`Rate limit or error hit. Retrying in ${attempt * 5}s...`)
    } = options;

    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            // Check if it's a 429 (Rate Limit)
            const isRateLimit = error.message?.includes('429') || error.status === 429 || error.response?.status === 429;
            
            if (isRateLimit && attempt < maxRetries) {
                const delay = initialDelay * attempt;
                onRetry(error, attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            
            // If not a rate limit or we're at max retries, throw
            throw error;
        }
    }
    throw lastError;
}

module.exports = { withRetry };
