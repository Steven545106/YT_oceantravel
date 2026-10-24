// Test mode (?test or ?unlock=all in the address): every country open and the jet's Turbo has no cooldown,
// switching on and off with each press of E. Nothing it allows is saved as progress.
const params = new URLSearchParams(globalThis.location?.search ?? '');
export const TEST_MODE = params.has('test') || params.get('unlock') === 'all';
