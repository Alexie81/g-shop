import { Client } from '@/types';
import { fullName } from '@/utils/format';

const tokens: Array<[string, (client: Client, propertyName: string) => string]> = [
  ['{prenume}', (client) => client.firstName],
  ['{nume}', (client) => client.lastName],
  ['{client}', (client) => fullName(client)],
  ['{telefon}', (client) => client.phone],
  ['{proprietate}', (_client, propertyName) => propertyName],
  ['{link_status}', (client) => client.qr?.publicUrl ?? ''],
];

export const WHATSAPP_MESSAGE_TOKENS = tokens.map(([token]) => token);

export function renderWhatsAppMessage(template: string, client: Client, propertyName: string) {
  return tokens.reduce((message, [token, resolve]) => message.split(token).join(resolve(client, propertyName)), template).trim();
}
