/**
 * Plugin Registry
 *
 * Plugins are opt-in integrations enabled via environment variables.
 * Deepline is a required core dependency, not a plugin.
 *
 * To add a plugin:
 * 1. Create the plugin module in lib/integrations/<name>/
 * 2. Register it here with its enablement condition
 */

export interface Plugin {
  name: string;
  enabled: boolean;
  description: string;
}

export function getEnabledPlugins(): Plugin[] {
  return [
    {
      name: 'hubspot',
      enabled: process.env.ENABLE_HUBSPOT === 'true' && !!process.env.HUBSPOT_ACCESS_TOKEN,
      description: 'Sync account scores and signals to HubSpot CRM',
    },
    {
      name: 'notion',
      enabled: process.env.ENABLE_NOTION === 'true' && !!process.env.NOTION_API_KEY,
      description: 'Push account summaries to Notion workspace',
    },
  ];
}

export function isPluginEnabled(name: string): boolean {
  return getEnabledPlugins().some(p => p.name === name && p.enabled);
}
