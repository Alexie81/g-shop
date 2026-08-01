import { AppHeader } from '@/components/layout/AppHeader';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { API_URL } from '@/services/api';
import { spacing } from '@/theme/tokens';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
export default function SettingsScreen() { const { changePassword } = useAuth(); const { showToast } = useToast(); const [current, setCurrent] = useState(''); const [next, setNext] = useState(''); const [confirm, setConfirm] = useState(''); const [loading, setLoading] = useState(false); const submit = async () => { if (next.length < 8 || next !== confirm) return showToast('Parola nouă trebuie să aibă minimum 8 caractere, iar confirmarea să coincidă.', 'error'); setLoading(true); try { await changePassword(current, next); setCurrent(''); setNext(''); setConfirm(''); showToast('Parola contului a fost schimbată.', 'success'); } catch (error) { showToast(error instanceof Error ? error.message : 'Parola nu a putut fi schimbată.', 'error'); } finally { setLoading(false); } }; return <Screen header={<AppHeader title="Setări" back onBack={() => router.replace('/service/more')} />}><Card style={styles.section}><AppText variant="heading">Temă</AppText><AppText muted>Alege Light, Dark sau tema sistemului. Preferința este păstrată pe dispozitiv.</AppText><ThemeToggle /></Card><Card style={styles.section}><AppText variant="heading">Schimbă parola contului meu</AppText><Input label="Parola curentă" secureTextEntry value={current} onChangeText={setCurrent} /><Input label="Parola nouă" secureTextEntry value={next} onChangeText={setNext} /><Input label="Confirmă parola nouă" secureTextEntry value={confirm} onChangeText={setConfirm} /><Button label="Schimbă parola" icon="key-outline" loading={loading} onPress={() => void submit()} /></Card><Card style={styles.section}><AppText variant="heading">Conexiune online</AppText><AppText variant="caption" muted>API activ</AppText><AppText variant="label">{API_URL}</AppText><AppText variant="caption" muted>Datele operaționale sunt citite și scrise exclusiv prin conexiunea HTTPS la baza MySQL online.</AppText></Card></Screen>; }
const styles = StyleSheet.create({ section: { gap: spacing.lg } });
