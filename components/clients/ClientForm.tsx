import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/contexts/ToastContext';
import { clientRepository } from '@/repositories/api-repositories';
import { spacing } from '@/theme/tokens';
import { Client, UUID } from '@/types';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

type FormState = Pick<Client, 'firstName' | 'lastName' | 'phone' | 'secondaryPhone' | 'email' | 'address' | 'city' | 'county' | 'postalCode' | 'notes'>;
const empty: FormState = { firstName: '', lastName: '', phone: '', secondaryPhone: '', email: '', address: '', city: 'București', county: 'București', postalCode: '', notes: '' };

export function ClientForm({ propertyId, client }: { propertyId: UUID; client?: Client }) {
  const [form, setForm] = useState<FormState>(client ? { firstName: client.firstName, lastName: client.lastName, phone: client.phone, secondaryPhone: client.secondaryPhone ?? '', email: client.email ?? '', address: client.address ?? '', city: client.city ?? '', county: client.county ?? '', postalCode: client.postalCode ?? '', notes: client.notes ?? '' } : empty);
  const [loading, setLoading] = useState(false); const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({}); const { showToast } = useToast();
  const update = (key: keyof FormState, value: string) => { setForm((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: undefined })); };
  const submit = async () => {
    const nextErrors: typeof errors = {};
    if (form.firstName.trim().length < 2) nextErrors.firstName = 'Introdu prenumele.';
    if (form.lastName.trim().length < 2) nextErrors.lastName = 'Introdu numele.';
    if (form.phone.replace(/\D/g, '').length < 9) nextErrors.phone = 'Numărul de telefon nu este valid.';
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) nextErrors.email = 'Adresa de email nu este validă.';
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); showToast('Verifică datele marcate.', 'error'); return; }
    setLoading(true);
    try {
      const saved = client ? await clientRepository.update(client.id, form) : await clientRepository.create({ ...form, propertyId, status: 'NEW' });
      showToast(client ? 'Clientul a fost actualizat.' : 'Clientul a fost creat.', 'success');
      router.replace(`/service/clients/${saved.id}`);
    } catch (error) { showToast(error instanceof Error ? error.message : 'Salvarea a eșuat.', 'error'); } finally { setLoading(false); }
  };
  return <View style={styles.form}><Card style={styles.section}><AppText variant="heading">Date de contact</AppText><View style={styles.row}><View style={styles.field}><Input label="Prenume *" value={form.firstName} onChangeText={(value) => update('firstName', value)} error={errors.firstName} /></View><View style={styles.field}><Input label="Nume *" value={form.lastName} onChangeText={(value) => update('lastName', value)} error={errors.lastName} /></View></View><View style={styles.row}><View style={styles.field}><Input label="Telefon *" keyboardType="phone-pad" value={form.phone} onChangeText={(value) => update('phone', value)} error={errors.phone} /></View><View style={styles.field}><Input label="Telefon secundar" keyboardType="phone-pad" value={form.secondaryPhone} onChangeText={(value) => update('secondaryPhone', value)} /></View></View><Input label="Email" keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={(value) => update('email', value)} error={errors.email} /></Card><Card style={styles.section}><AppText variant="heading">Adresă</AppText><Input label="Adresă completă" value={form.address} onChangeText={(value) => update('address', value)} /><View style={styles.row}><View style={styles.field}><Input label="Oraș / localitate" value={form.city} onChangeText={(value) => update('city', value)} /></View><View style={styles.field}><Input label="Județ / sector" value={form.county} onChangeText={(value) => update('county', value)} /></View></View><Input label="Cod poștal" keyboardType="number-pad" value={form.postalCode} onChangeText={(value) => update('postalCode', value)} /></Card><Card style={styles.section}><AppText variant="heading">Observații</AppText><Input multiline numberOfLines={4} textAlignVertical="top" placeholder="Informații utile despre client…" value={form.notes} onChangeText={(value) => update('notes', value)} style={{ minHeight: 90 }} /></Card><Button label={client ? 'Salvează modificările' : 'Adaugă clientul'} icon="checkmark-circle-outline" loading={loading} onPress={() => void submit()} /></View>;
}
const styles = StyleSheet.create({ form: { gap: spacing.lg }, section: { gap: spacing.lg }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, field: { minWidth: 230, flex: 1 } });
