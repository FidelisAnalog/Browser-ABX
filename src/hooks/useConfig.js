/**
 * useConfig — loads and resolves test configuration.
 * Handles both embedded (pre-normalized) and standalone (fetch + parse) modes.
 */

import { useState, useEffect } from 'react';
import { parseConfig } from '../utils/config';

/**
 * @param {string} [configUrl] - URL to YAML config (standalone mode)
 * @param {object} [configProp] - Pre-normalized config (embed mode)
 * @returns {{ config: object|null, configError: string|null }}
 */
export function useConfig(configUrl, configProp) {
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState(null);

  useEffect(() => {
    if (configProp) {
      setConfig(configProp);
      return;
    }
    if (!configUrl) return;
    let cancelled = false;
    parseConfig(configUrl)
      .then((cfg) => {
        if (!cancelled) setConfig(cfg);
      })
      .catch((err) => {
        if (!cancelled) setConfigError(err.message);
      });
    return () => { cancelled = true; };
  }, [configUrl, configProp]);

  return { config, configError };
}
