import { decryptJson } from '../crypto.js';
import type { CalendarProvider, IcalCredentials } from './base.js';
import { IcalProvider } from './ical.js';
import { PcoProvider } from './pco.js';
import type { CalendarSource } from '../db/schema.js';

/**
 * Build the correct CalendarProvider for a given calendar_sources row.
 * Decrypts credentials and constructs the appropriate provider class.
 */
export function buildProvider(source: CalendarSource): CalendarProvider {
  switch (source.type) {
    case 'ical': {
      const creds = decryptJson<IcalCredentials>(source.credentials_encrypted);
      return new IcalProvider(source.id, source.display_name, creds);
    }
    case 'pco': {
      return new PcoProvider(source.id);
    }
    default: {
      const _exhaustive: never = source.type;
      throw new Error(`Unknown calendar source type: ${String(_exhaustive)}`);
    }
  }
}
