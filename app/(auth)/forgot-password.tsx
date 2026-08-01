import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { useToast } from '@/contexts/ToastContext';
import { authRepository } from '@/repositories/api-repositories';
import { spacing } from '@/theme/tokens';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState(''); const [loading, setLoading] = useState(false); const { showToast } = useToast();
  const submit = async () => { if (!email.includes('@')) return showToast('Introdu o adresă de email validă.', 'error'); setLoading(true); try { await authRepository.forgotPassword(email); showToast('Dacă adresa există, instrucțiunile au fost trimise.', 'success'); } catch (error) { showToast(error instanceof Error ? error.message : 'Cererea a eșuat.', 'error'); } finally { setLoading(false); } };
  return <Screen header={<AppHeader title="Recuperare parolă" showProperty={false} back />} style={styles.content}><Card style={styles.card}><AppText variant="title">Recuperează accesul</AppText><AppText muted>Introdu adresa asociată contului. Administratorul va primi solicitarea și îți poate seta o parolă nouă.</AppText><Input label="Email" icon="mail-outline" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} /><Button label="Trimite solicitarea" icon="send-outline" loading={loading} onPress={() => void submit()} /></Card></Screen>;
}
const styles = StyleSheet.create({ content: { justifyContent: 'center' }, card: { width: '100%', maxWidth: 540, alignSelf: 'center', gap: spacing.lg } });
