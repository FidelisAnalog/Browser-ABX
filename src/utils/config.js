/**
 * YAML configuration parser — loads and normalizes test configuration.
 * Backwards compatible with existing JP_ABX YAML configs.
 */

import yaml from 'js-yaml';

/**
 * Convert Dropbox share links to direct download links.
 * @param {string} urlStr
 * @returns {string}
 */
function rawLink(urlStr) {
  try {
    const url = new URL(urlStr);
    if (url.hostname === 'www.dropbox.com') {
      url.hostname = 'dl.dropboxusercontent.com';
      url.searchParams.set('dl', '1');
      return url.toString();
    }
    return urlStr;
  } catch {
    return urlStr;
  }
}

/**
 * Fetch and parse a YAML config file.
 * @param {string} configUrl - URL to YAML config file
 * @returns {Promise<object>} Parsed and normalized config
 */
export async function parseConfig(configUrl) {
  const url = rawLink(configUrl);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch config: ${configUrl} (${response.status})`);
  }
  const text = await response.text();
  const raw = yaml.load(text);

  return normalizeConfig(raw);
}

/**
 * Normalize raw YAML config into standard structure.
 * @param {object} raw - Raw parsed YAML
 * @returns {object} Normalized config
 */
function normalizeConfig(raw) {
  if (!raw.name) throw new Error('Config must have a "name" field');
  if (!raw.options || raw.options.length === 0) throw new Error('Config must have "options"');
  if (!raw.tests || raw.tests.length === 0) throw new Error('Config must have "tests"');

  // Normalize options
  const optionMap = {};
  const options = raw.options.map((opt) => {
    const normalized = {
      name: opt.name,
      audioUrl: rawLink(opt.audioUrl),
      tag: opt.tag || null,
    };
    optionMap[opt.name] = normalized;
    return normalized;
  });

  // Normalize tests
  const tests = raw.tests.map((test) => {
    if (!test.testType) throw new Error(`Test "${test.name}" must have a "testType" (AB or ABX)`);
    if (!test.options || test.options.length === 0) {
      throw new Error(`Test "${test.name}" must have "options"`);
    }

    // Resolve option names to option objects
    const testOptions = test.options.map((optName) => {
      const opt = optionMap[optName];
      if (!opt) throw new Error(`Test "${test.name}" references unknown option "${optName}"`);
      return { ...opt };
    });

    return {
      name: test.name,
      testType: test.testType,
      description: test.description || null,
      options: testOptions,
      repeat: test.repeat || 10,
      ducking: test.ducking ?? false,
      duckDuration: test.duckDuration ?? null,
    };
  });

  return {
    name: raw.name,
    welcome: raw.welcome || { description: '' },
    results: raw.results || null,
    options,
    tests,
    email: raw.email || null,
  };
}
