/**
 * AI Matching Service
 * Uses HuggingFace's all-MiniLM-L6-v2 model via @xenova/transformers
 * to compute skill similarity scores between gigs and freelancers.
 *
 * The model (~25MB) is downloaded from HuggingFace CDN on first use
 * and cached to disk automatically. No API key required.
 */

let pipeline = null;
let pipelineLoading = false;
let pipelineReady = false;

/**
 * Lazy-load the feature-extraction pipeline (singleton).
 * Safe to call multiple times — only loads once.
 */
async function getPipeline() {
    if (pipelineReady) return pipeline;

    if (pipelineLoading) {
        // Wait until the in-progress load finishes
        await new Promise((resolve) => {
            const interval = setInterval(() => {
                if (pipelineReady) {
                    clearInterval(interval);
                    resolve();
                }
            }, 200);
        });
        return pipeline;
    }

    pipelineLoading = true;
    console.log("🤖 [AI] Loading HuggingFace model (all-MiniLM-L6-v2)…");
    console.log("🤖 [AI] First run: model will download ~25MB from HuggingFace CDN.");

    try {
        // Dynamic import to stay compatible with CommonJS
        const { pipeline: hfPipeline } = await import("@xenova/transformers");
        pipeline = await hfPipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
        pipelineReady = true;
        console.log("🤖 [AI] Model loaded and ready ✅");
    } catch (err) {
        pipelineLoading = false;
        console.error("🤖 [AI] Failed to load model:", err.message);
        throw err;
    }

    return pipeline;
}

/**
 * Embed an array of text strings into float vectors.
 * Returns: float32 matrix [ [vec1...], [vec2...], ... ]
 */
async function embedTexts(texts) {
    if (!texts || texts.length === 0) return [];
    const extractor = await getPipeline();
    const results = [];

    for (const text of texts) {
        const output = await extractor(text, { pooling: "mean", normalize: true });
        results.push(Array.from(output.data));
    }

    return results;
}

/**
 * Compute cosine similarity between two vectors.
 * Both vectors must have the same length.
 * Returns a scalar between 0 (no similarity) and 1 (identical).
 */
function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Compute average embedding for an array of skill strings.
 * e.g. ["React", "Node.js", "MongoDB"] → averaged vector
 */
async function embedSkillSet(skills) {
    if (!skills || skills.length === 0) return null;
    const vecs = await embedTexts(skills);
    if (vecs.length === 0) return null;
    const dim = vecs[0].length;
    const avg = new Array(dim).fill(0);
    for (const v of vecs) {
        for (let i = 0; i < dim; i++) avg[i] += v[i];
    }
    for (let i = 0; i < dim; i++) avg[i] /= vecs.length;
    return avg;
}

/**
 * Score a freelancer against a gig.
 * Returns composite score = 0.6 * skillSim + 0.4 * normalizedRating
 *
 * @param {string[]} gigSkills - skills required by the gig
 * @param {string[]} freelancerSkills - skills the freelancer has
 * @param {number} rating - freelancer's rating (0-5)
 * @returns {Promise<{ score: number, skillSimilarity: number }>}
 */
async function scoreFreelancer(gigSkills, freelancerSkills, rating = 0) {
    const gigVec = await embedSkillSet(gigSkills);
    const freelancerVec = await embedSkillSet(freelancerSkills);

    const skillSim = gigVec && freelancerVec ? cosineSimilarity(gigVec, freelancerVec) : 0;
    const normalizedRating = Math.min(rating, 5) / 5;

    const score = 0.6 * skillSim + 0.4 * normalizedRating;
    return { score, skillSimilarity: skillSim };
}

/**
 * Score a gig against a freelancer.
 * Returns composite score = 0.7 * skillSim + 0.3 * relevance heuristic
 *
 * @param {string[]} freelancerSkills
 * @param {string[]} gigSkills
 * @returns {Promise<{ score: number, skillSimilarity: number }>}
 */
async function scoreGig(freelancerSkills, gigSkills) {
    const freelancerVec = await embedSkillSet(freelancerSkills);
    const gigVec = await embedSkillSet(gigSkills);

    const skillSim = freelancerVec && gigVec ? cosineSimilarity(freelancerVec, gigVec) : 0;
    return { score: skillSim, skillSimilarity: skillSim };
}

/**
 * Pre-warm the model pipeline on server startup (optional).
 * Call this in server.js to ensure the first real request is fast.
 */
async function warmUp() {
    try {
        await getPipeline();
        // Run a quick dummy embedding to ensure the model is fully ready
        await embedTexts(["warmup"]);
        console.log("🤖 [AI] Model warmed up ✅");
    } catch (err) {
        console.warn("🤖 [AI] Warm-up failed (non-critical):", err.message);
    }
}

module.exports = {
    embedTexts,
    embedSkillSet,
    cosineSimilarity,
    scoreFreelancer,
    scoreGig,
    warmUp,
};
