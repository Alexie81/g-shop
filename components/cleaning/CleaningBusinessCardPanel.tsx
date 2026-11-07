import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { CLEANING_CARD_IMAGE_URL, CLEANING_CARD_MESSAGE, PreparedCleaningCard, prepareCleaningCard, shareCleaningCard } from '@/services/cleaning-business-card';
import { isCleaningProperty } from '@/utils/property';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';

export function CleaningBusinessCardPanel({ compact = false }: { compact?: boolean }) {
  const { activeProperty } = useProperty();
  const cleaning = isCleaningProperty(activeProperty);
  const { colors } = useAppTheme();
  const { showToast } = useToast();
  const [message, setMessage] = useState(CLEANING_CARD_MESSAGE);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const prepared = useRef<PreparedCleaningCard | null>(null);
  useEffect(() => {
    let active = true;
    if (cleaning) void prepareCleaningCard().then((card) => { if (active) { prepared.current = card; setReady(true); } }).catch(() => undefined);
    return () => { active = false; };
  }, [cleaning]);
  if (!cleaning) return null;
  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (!prepared.current) { prepared.current = await prepareCleaningCard(); setReady(true); showToast('Imaginea este pregătită. Apasă din nou pentru trimitere.', 'info'); return; }
      const result = await shareCleaningCard(prepared.current, message);
      if (result === 'downloaded') showToast('Imaginea a fost descărcată. Atașeaz-o în WhatsApp și folosește „Copiază textul” pentru descriere.', 'info');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Trimiterea nu a putut fi deschisă.', 'error'); }
    finally { setBusy(false); }
  };
  return <View style={[styles.card, { backgroundColor: colors.primarySoft, borderColor: colors.border }]}>
    <View style={styles.heading}>
      <Pressable accessibilityLabel="Mărește cartea de vizită" onPress={() => void Linking.openURL(CLEANING_CARD_IMAGE_URL).catch(() => showToast('Imaginea nu a putut fi deschisă.', 'error'))}>
        <Image source={{ uri: CLEANING_CARD_IMAGE_URL }} style={styles.image} resizeMode="contain" />
      </Pressable>
      <View style={styles.copy}><AppText variant="heading">Trimite cartea de vizită</AppText><AppText variant="caption" muted>Imagine + mesaj de prezentare. Alege WhatsApp și destinatarul.</AppText></View>
    </View>
    {expanded ? <TextInput accessibilityLabel="Textul cărții de vizită" multiline value={message} onChangeText={setMessage} style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]} /> : null}
    <View style={styles.actions}><Button compact variant="ghost" label={expanded ? 'Ascunde textul' : 'Vezi / editează textul'} icon="create-outline" onPress={() => setExpanded(!expanded)} /><Button compact variant="ghost" label="Copiază textul" icon="copy-outline" onPress={() => void Clipboard.setStringAsync(message).then(() => showToast('Text copiat.', 'success')).catch(() => showToast('Textul nu a putut fi copiat.', 'error'))} /></View>
    <Button compact={compact} label={ready ? 'Trimite imaginea și textul' : 'Pregătește imaginea'} icon="logo-whatsapp" loading={busy} disabled={!message.trim()} onPress={() => void share()} />
  </View>;
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10, marginVertical: 8 },
  heading: { flexDirection: 'row', gap: 12, alignItems: 'center' }, image: { width: 65, height: 92, borderRadius: 6 }, copy: { flex: 1, minWidth: 0, gap: 5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, input: { borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 200, maxHeight: 300, textAlignVertical: 'top', fontSize: 14, lineHeight: 21 },
});
