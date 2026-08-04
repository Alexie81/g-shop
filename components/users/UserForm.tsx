import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ROLE_LABELS, ROLE_PERMISSIONS } from '@/constants/permissions';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { userRepository } from '@/repositories/api-repositories';
import { spacing } from '@/theme/tokens';
import { UserRole, UUID } from '@/types';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
const roles = Object.keys(ROLE_LABELS) as UserRole[];
export function UserForm({ propertyId }: { propertyId: UUID }) {
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('OPERATOR');
  const [loading, setLoading] = useState(false);
  const { hasPermission } = useAuth();
  const { showToast } = useToast();
  const canManageRoles = hasPermission('roles.manage');

  const submit = async () => {
    if (username.trim().length < 3 || firstName.trim().length < 2 || lastName.trim().length < 2 || password.length < 8) return showToast('Completează datele. Parola trebuie să aibă minimum 8 caractere.', 'error');
    setLoading(true);
    try {
      const selectedRole: UserRole = canManageRoles ? role : 'OPERATOR';
      const user = await userRepository.create({ username, firstName, lastName, email, phone, password, role: selectedRole, propertyIds: [propertyId], permissions: canManageRoles ? ROLE_PERMISSIONS[selectedRole] : [] });
      showToast('Utilizatorul a fost creat.', 'success');
      router.replace(canManageRoles ? `/service/users/${user.id}` : '/service/users');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Utilizatorul nu a putut fi creat.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return <View style={styles.form}>
    <Card style={styles.section}>
      <AppText variant="heading">Identitate și acces</AppText>
      <View style={styles.row}><View style={styles.field}><Input label="Prenume *" value={firstName} onChangeText={setFirstName} /></View><View style={styles.field}><Input label="Nume *" value={lastName} onChangeText={setLastName} /></View></View>
      <View style={styles.row}><View style={styles.field}><Input label="Utilizator *" autoCapitalize="none" value={username} onChangeText={setUsername} /></View><View style={styles.field}><Input label="Parolă inițială *" secureTextEntry value={password} onChangeText={setPassword} /></View></View>
      <View style={styles.row}><View style={styles.field}><Input label="Email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} /></View><View style={styles.field}><Input label="Telefon" keyboardType="phone-pad" value={phone} onChangeText={setPhone} /></View></View>
    </Card>
    {canManageRoles ? <Card style={styles.section}>
      <AppText variant="heading">Rol și permisiuni implicite</AppText>
      <View style={styles.roles}>{roles.map((item) => <Button key={item} compact variant={role === item ? 'primary' : 'outline'} label={ROLE_LABELS[item]} onPress={() => setRole(item)} />)}</View>
      <AppText variant="caption" muted>{ROLE_PERMISSIONS[role].length} permisiuni vor fi activate. Le poți personaliza după salvare.</AppText>
    </Card> : <Card style={styles.section}>
      <AppText variant="heading">Acces configurat separat</AppText>
      <AppText variant="caption" muted>Utilizatorul va fi creat fără permisiuni. Un administrator cu dreptul „Configurează roluri” îi poate acorda ulterior accesul necesar.</AppText>
    </Card>}
    <Button label="Creează utilizatorul" icon="person-add-outline" loading={loading} onPress={() => void submit()} />
  </View>;
}
const styles = StyleSheet.create({ form: { gap: spacing.lg }, section: { gap: spacing.lg }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, field: { minWidth: 220, flex: 1 }, roles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm } });
