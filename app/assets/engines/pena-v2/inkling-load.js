export function loadSettings({ preset = '12', context = 8192, budget = 1536 } = {}) {
    if(preset !== '12' && preset !== '16') throw new Error('Select a declared 12 GB or 16 GB VRAM preset.');
    if(!Number.isSafeInteger(context) || context < 512 || context > 8192)
        throw new Error('Context must be between 512 and 8192 tokens.');
    if(!Number.isSafeInteger(budget) || budget < 1 || budget > 4096)
        throw new Error('Thinking token budget must be between 1 and 4096.');
    return {
        n_gpu_layers: 99999, token_embd_on_gpu: true,
        n_ctx: context, n_parallel: 1, n_batch: 512,
        n_ubatch: preset === '12' ? 256 : 512, n_threads: 4,
        cache_type_k: 'f16', cache_type_v: 'f16', ctx_shift: false,
        reasoning_budget_tokens: budget, reasoning_format: 'deepseek', jinja: true
    };
}
