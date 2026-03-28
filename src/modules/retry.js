const retry = async (fn, retries = 3, delay = 5000) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (e) {
            console.warn(`Attempt ${i + 1} failed: ${e.message}. Retrying in ${delay / 1000}s...`);
            if (i === retries - 1) throw e;
            await new Promise(r => setTimeout(r, delay));
        }
    }
};

module.exports = retry;
