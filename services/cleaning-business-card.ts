import * as FileSystem from 'expo-file-system/legacy';
import { Platform, TurboModuleRegistry } from 'react-native';
import type { ShareSingleOptions } from 'react-native-share';

const BASE = (process.env.EXPO_PUBLIC_CLEANING_API_URL ?? 'https://curatatorie-canapele.ro/app-api').replace(/\/$/, '');
export const CLEANING_CARD_IMAGE_URL = `${BASE}/assets/cleaning/business-card.png?v=approved-v9`;
export const CLEANING_CARD_PAGE_URL = `${BASE}/cleaning-business-card.php`;
export const CLEANING_CARD_MESSAGE = `✨ Curățare profesională la domiciliu, în București și Ilfov!

Curatatorie Canapele îți împrospătează locuința cu servicii de curățare pentru canapele și colțare, saltele, fotolii și scaune tapițate, covoare și mochete. Oferim și servicii de curățenie și menaj.

✅ Echipamente profesionale și echipă de încredere.
⭐ Peste 480 de recenzii pozitive de la clienți mulțumiți.

Trimite-ne fotografii pe WhatsApp pentru o ofertă și stabilim împreună programarea!
📞 Telefon / WhatsApp: 0726 049 278
🌐 https://curatatorie-canapele.ro
✉️ contact@curatatorie-canapele.ro`;

/** Pin both documents to this order instead of relying on the client's latest order. */
export function cleaningDossierUrl(documentUrl: string, sheetId: string): string | null {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sheetId)) return null;
  try {
    const url = new URL(documentUrl);
    if (url.origin !== new URL(BASE).origin || !/\/public\/client-form\/[0-9a-f-]+\/documents\/(intake|exit)$/i.test(url.pathname)) return null;
    url.pathname = url.pathname.replace(/\/documents\/(intake|exit)$/i, `/dossier/${sheetId}`);
    url.search = ''; url.hash = '';
    return url.toString();
  } catch { return null; }
}

export type PreparedCleaningCard = { uri: string } | { file: File };

/** Prepare before the tap: web sharing requires an active user gesture. */
export async function prepareCleaningCard(): Promise<PreparedCleaningCard> {
  if (Platform.OS === 'web') {
    const response = await fetch(CLEANING_CARD_IMAGE_URL);
    if (!response.ok) throw new Error('Imaginea nu a putut fi descărcată.');
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('Fișierul primit nu este o imagine.');
    return { file: new File([blob], 'Curatatorie-Canapele.png', { type: 'image/png' }) };
  }
  if (!FileSystem.cacheDirectory) throw new Error('Spațiul temporar nu este disponibil.');
  const uri = `${FileSystem.cacheDirectory}curatatorie-canapele-v9.png`;
  const cached = await FileSystem.getInfoAsync(uri);
  if (!cached.exists || !cached.size) {
    const downloaded = await FileSystem.downloadAsync(CLEANING_CARD_IMAGE_URL, uri);
    if (downloaded.status !== 200) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
      throw new Error('Imaginea nu a putut fi descărcată. Încearcă din nou.');
    }
  }
  return { uri };
}

export async function shareCleaningCard(card: PreparedCleaningCard, message: string, recipientPhone?: string): Promise<'opened' | 'cancelled' | 'downloaded'> {
  if (!message.trim()) throw new Error('Completează textul care însoțește fotografia.');
  if ('file' in card) {
    const data = { files: [card.file], text: message, title: 'Curatatorie Canapele' };
    if (navigator.canShare?.(data)) {
      try { await navigator.share(data); return 'opened'; }
      catch (error) { if (error instanceof Error && error.name === 'AbortError') return 'cancelled'; throw error; }
    }
    // Desktop browsers without file sharing receive the actual PNG, never a link.
    const url = URL.createObjectURL(card.file);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = card.file.name;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'downloaded';
  }
  // Keep Expo Go/old APK previews safe: do not evaluate a missing native module.
  if (!TurboModuleRegistry.get('RNShare')) throw new Error('Instalează noul APK G-Shop pentru trimiterea imaginii împreună cu textul.');
  const { default: Share, Social } = await import('react-native-share');
  if (Platform.OS === 'android' && recipientPhone !== undefined) {
    let phone = recipientPhone.replace(/\D/g, '');
    if (phone.startsWith('00')) phone = phone.slice(2);
    if (phone.startsWith('0')) phone = '40' + phone.slice(1);
    if (!/^[1-9]\d{9,14}$/.test(phone)) throw new Error('Clientul nu are un număr WhatsApp valid. Corectează telefonul din profil.');
    const regular = await Share.isPackageInstalled('com.whatsapp');
    const business = regular.isInstalled ? false : (await Share.isPackageInstalled('com.whatsapp.w4b')).isInstalled;
    if (!regular.isInstalled && !business) throw new Error('Instalează WhatsApp sau WhatsApp Business pe telefon.');
    // The documented Android recipient is implemented natively but omitted by 12.x typings.
    const options: ShareSingleOptions & { whatsAppNumber: string } = { social: business ? Social.Whatsappbusiness : Social.Whatsapp, whatsAppNumber: phone, url: card.uri, type: 'image/png', message, title: 'Curatatorie Canapele' };
    await Share.shareSingle(options);
    return 'opened';
  }
  const result = await Share.open({ url: card.uri, type: 'image/png', message, title: 'Trimite cartea de vizită', failOnCancel: false, showAppsToView: false });
  return result.dismissedAction ? 'cancelled' : 'opened';
}
