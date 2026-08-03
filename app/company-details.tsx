import { AppHeader } from '@/components/layout/AppHeader';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useAuth } from '@/contexts/AuthContext';
import { useProperty } from '@/contexts/PropertyContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useBackToAdministration } from '@/hooks/useBackToAdministration';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { companyDetailsRepository } from '@/repositories/api-repositories';
import { palette, radius, spacing } from '@/theme/tokens';
import { CompanyDetails } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';

type CompanyForm = Omit<CompanyDetails, 'id' | 'propertyId' | 'isDefault' | 'stampUrl' | 'createdAt' | 'updatedAt'>;
const emptyForm: CompanyForm = { legalName: '', taxId: '', tradeRegisterNumber: '', vatPayer: false, address: '', city: '', county: '', postalCode: '', country: 'România', phone: '', email: '', website: '', bankName: '', iban: '', representativeName: '', representativeRole: '' };

function formFromCompany(company: CompanyDetails): CompanyForm {
  const { id: _id, propertyId: _propertyId, isDefault: _isDefault, stampUrl: _stampUrl, createdAt: _createdAt, updatedAt: _updatedAt, ...form } = company;
  return { ...emptyForm, ...form };
}

export default function CompanyDetailsScreen() {
  useBackToAdministration();
  const { user } = useAuth();
  const { activeProperty } = useProperty();
  const { colors, isDark } = useAppTheme();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const compact = width < 680;
  const propertyId = activeProperty?.id ?? '';
  const state = useAsyncData<CompanyDetails[]>(() => propertyId ? companyDetailsRepository.list(propertyId) : Promise.resolve([]), [propertyId]);
  useRefreshOnFocus(() => state.reload(true), state.loading || state.refreshing);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CompanyForm>(emptyForm);
  const [stampData, setStampData] = useState<string | null>(null);
  const [stampRemoved, setStampRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const selectedCompany = state.data?.find((company) => company.id === selectedId) ?? null;

  useEffect(() => {
    if (!state.data || creating) return;
    const company = state.data.find((item) => item.id === selectedId)
      ?? state.data.find((item) => item.isDefault)
      ?? state.data[0];
    if (!company) {
      setCreating(true);
      setSelectedId(null);
      setForm({ ...emptyForm });
      return;
    }
    setSelectedId(company.id);
    setForm(formFromCompany(company));
    setStampData(null);
    setStampRemoved(false);
  }, [creating, selectedId, state.data]);

  if (!activeProperty) return <Redirect href="/select-property" />;
  if (user?.role !== 'ADMIN') return <Redirect href="/service/more" />;

  const update = (key: keyof CompanyForm, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const selectCompany = (company: CompanyDetails) => {
    setCreating(false);
    setSelectedId(company.id);
    setForm(formFromCompany(company));
    setStampData(null);
    setStampRemoved(false);
  };
  const startCreating = () => {
    setCreating(true);
    setSelectedId(null);
    setForm({ ...emptyForm });
    setStampData(null);
    setStampRemoved(false);
  };

  const pickStamp = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return showToast('Permite accesul la fotografii pentru a selecta ștampila.', 'error');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.8, base64: true });
    if (result.canceled || !result.assets[0]?.base64) return;
    const asset = result.assets[0];
    const mime = asset.mimeType && ['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType) ? asset.mimeType : 'image/jpeg';
    setStampData(`data:${mime};base64,${asset.base64}`);
    setStampRemoved(false);
  };

  const save = async () => {
    if (!propertyId) return showToast('Selectează proprietatea înainte de salvare.', 'error');
    if (form.legalName.trim().length < 2) return showToast('Completează denumirea juridică a firmei.', 'error');
    if (!creating && !selectedCompany) return showToast('Selectează firma pe care vrei să o editezi.', 'error');
    setSaving(true);
    try {
      const payload = { ...form, legalName: form.legalName.trim(), iban: form.iban.replace(/\s/g, '').toUpperCase() };
      let result = creating
        ? await companyDetailsRepository.create(propertyId, payload)
        : await companyDetailsRepository.update(selectedCompany!.id, payload);
      if (stampRemoved && result.stampUrl) result = await companyDetailsRepository.removeStamp(result.id);
      if (stampData) result = await companyDetailsRepository.saveStamp(result.id, stampData);
      setCreating(false);
      setSelectedId(result.id);
      setForm(formFromCompany(result));
      setStampData(null);
      setStampRemoved(false);
      state.setData((current) => {
        const others = (current ?? []).filter((company) => company.id !== result.id).map((company) => result.isDefault ? { ...company, isDefault: false } : company);
        return [result, ...others].sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.legalName.localeCompare(right.legalName, 'ro'));
      });
      showToast(creating ? 'Firma a fost adăugată.' : 'Datele firmei au fost salvate.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Datele firmei nu au putut fi salvate.', 'error');
    } finally { setSaving(false); }
  };

  const setDefault = async (company: CompanyDetails) => {
    if (company.isDefault || activatingId) return;
    setActivatingId(company.id);
    try {
      await companyDetailsRepository.setDefault(company.id);
      await state.reload(true);
      showToast(`${company.legalName} este acum firma folosită pentru documentele noi.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Firma activă nu a putut fi schimbată.', 'error');
    } finally { setActivatingId(null); }
  };

  const stampUri = stampData ?? (!stampRemoved ? selectedCompany?.stampUrl : null);

  return <Screen header={<AppHeader title="Datele firmei" back onBack={() => router.replace('/service/more')} />} refreshing={state.refreshing} onRefresh={() => void state.reload(true)}>
    <View style={styles.stack}>
      <LinearGradient colors={isDark ? ['#102A69', '#075CFF'] : ['#123EA9', '#0878FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View pointerEvents="none" style={styles.heroOrb} />
        <View style={styles.heroIcon}><Ionicons name="business" size={28} color="#FFFFFF" /></View>
        <View style={styles.heroCopy}><AppText variant="title" style={styles.heroTitle}>Firmele tale</AppText><AppText style={styles.heroSubtitle}>Alege firma activă, iar datele ei vor fi folosite automat în toate fișele și PDF-urile create de acum înainte.</AppText></View>
        <View style={styles.heroBadge}><Ionicons name="shield-checkmark" size={15} color="#FFFFFF" /><AppText variant="caption" style={styles.heroBadgeText}>DOAR ADMIN</AppText></View>
      </LinearGradient>

      {state.loading ? <LoadingState rows={5} /> : state.error ? <ErrorState message={state.error.message} onRetry={() => void state.reload()} /> : <>
        <Card style={styles.companies} elevated>
          <View style={[styles.companiesHeader, compact && styles.companiesHeaderCompact]}>
            <View style={styles.sectionCopy}><AppText variant="heading">Firme configurate</AppText><AppText variant="caption" muted>Firma activă este aplicată automat documentelor noi. Fișele existente își păstrează datele inițiale.</AppText></View>
            <Button compact label="Adaugă firmă" icon="add-circle-outline" onPress={startCreating} />
          </View>
          {state.data?.length ? <View style={styles.companyList}>{state.data.map((company) => {
            const selected = !creating && selectedId === company.id;
            return <Pressable key={company.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => selectCompany(company)} style={({ pressed }) => [styles.companyCard, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primarySoft : colors.surfaceMuted, opacity: pressed ? 0.76 : 1 }]}>
              <View style={[styles.companyIcon, { backgroundColor: company.isDefault ? colors.primary : colors.surface }]}><Ionicons name="business-outline" size={21} color={company.isDefault ? '#FFFFFF' : colors.primary} /></View>
              <View style={styles.companyCopy}><View style={styles.companyNameRow}><AppText variant="label" numberOfLines={1} style={styles.companyName}>{company.legalName}</AppText>{company.isDefault ? <View style={[styles.activeBadge, { backgroundColor: palette.success }]}><AppText variant="caption" style={styles.activeBadgeText}>ACTIVĂ</AppText></View> : null}</View><AppText variant="caption" muted numberOfLines={1}>{company.taxId || 'CUI necompletat'}{company.city ? ` · ${company.city}` : ''}</AppText></View>
              {company.isDefault ? <Ionicons name="checkmark-circle" size={23} color={palette.success} /> : <Button compact variant="outline" label={activatingId === company.id ? 'Se activează…' : 'Folosește'} disabled={Boolean(activatingId)} onPress={() => void setDefault(company)} />}
            </Pressable>;
          })}</View> : <View style={[styles.emptyCompanies, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="business-outline" size={26} color={colors.primary} /><AppText variant="label">Nu ai încă nicio firmă configurată.</AppText></View>}
        </Card>

        <View style={styles.editorHeading}><View style={[styles.editorIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name={creating ? 'add-outline' : 'create-outline'} size={22} color={colors.primary} /></View><View style={styles.sectionCopy}><AppText variant="heading">{creating ? 'Firmă nouă' : `Editează ${selectedCompany?.legalName ?? 'firma'}`}</AppText><AppText variant="caption" muted>{creating ? 'Completează denumirea, apoi salvează firma.' : selectedCompany?.isDefault ? 'Aceasta este firma folosită în documentele noi.' : 'Poți edita firma sau o poți selecta ca activă din lista de mai sus.'}</AppText></View></View>

        <FormSection icon="document-text-outline" color={colors.primary} background={colors.primarySoft} title="Date juridice" subtitle="Informațiile de identificare fiscală." compact={compact}>
          <Field><Input label="Denumire juridică" icon="business-outline" value={form.legalName} onChangeText={(value) => update('legalName', value)} placeholder="Ex: G-Shop Service SRL" maxLength={160} /></Field>
          <Field><Input label="CUI / CIF" icon="barcode-outline" value={form.taxId} onChangeText={(value) => update('taxId', value)} placeholder="Ex: RO12345678" maxLength={24} autoCapitalize="characters" /></Field>
          <Field><Input label="Registrul Comerțului" icon="reader-outline" value={form.tradeRegisterNumber} onChangeText={(value) => update('tradeRegisterNumber', value)} placeholder="Ex: J40/1234/2026" maxLength={40} autoCapitalize="characters" /></Field>
          <View style={[styles.switchBox, compact && styles.fieldCompact, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><View style={[styles.switchIcon, { backgroundColor: `${palette.success}16` }]}><Ionicons name="receipt-outline" size={20} color={palette.success} /></View><View style={styles.switchCopy}><AppText variant="label">Plătitor de TVA</AppText><AppText variant="caption" muted>Apare în documentele fiscale.</AppText></View><Switch value={form.vatPayer} onValueChange={(value) => update('vatPayer', value)} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" /></View>
        </FormSection>

        <FormSection icon="location-outline" color={palette.warning} background={`${palette.warning}16`} title="Sediu și contact" subtitle="Datele prin care clienții pot identifica și contacta firma." compact={compact}>
          <Field wide><Input label="Adresă sediu" icon="location-outline" value={form.address} onChangeText={(value) => update('address', value)} placeholder="Stradă, număr, bloc, etaj" maxLength={220} /></Field>
          <Field><Input label="Localitate" icon="map-outline" value={form.city} onChangeText={(value) => update('city', value)} maxLength={80} /></Field>
          <Field><Input label="Județ / Sector" icon="navigate-outline" value={form.county} onChangeText={(value) => update('county', value)} maxLength={80} /></Field>
          <Field><Input label="Cod poștal" icon="mail-unread-outline" value={form.postalCode} onChangeText={(value) => update('postalCode', value)} keyboardType="number-pad" maxLength={16} /></Field>
          <Field><Input label="Țară" icon="earth-outline" value={form.country} onChangeText={(value) => update('country', value)} maxLength={60} /></Field>
          <Field><Input label="Telefon" icon="call-outline" value={form.phone} onChangeText={(value) => update('phone', value)} keyboardType="phone-pad" maxLength={30} /></Field>
          <Field><Input label="Email" icon="mail-outline" value={form.email} onChangeText={(value) => update('email', value)} keyboardType="email-address" autoCapitalize="none" maxLength={140} /></Field>
          <Field wide><Input label="Website" icon="globe-outline" value={form.website} onChangeText={(value) => update('website', value)} autoCapitalize="none" placeholder="https://exemplu.ro" maxLength={160} /></Field>
        </FormSection>

        <FormSection icon="card-outline" color={palette.purple} background={`${palette.purple}16`} title="Bancă și reprezentare" subtitle="Datele de plată și persoana care reprezintă firma." compact={compact}>
          <Field><Input label="Banca" icon="business-outline" value={form.bankName} onChangeText={(value) => update('bankName', value)} maxLength={100} /></Field>
          <Field wide><Input label="IBAN" icon="card-outline" value={form.iban} onChangeText={(value) => update('iban', value)} autoCapitalize="characters" placeholder="RO00 BANK 0000 0000 0000 0000" maxLength={40} /></Field>
          <Field><Input label="Reprezentant legal" icon="person-outline" value={form.representativeName} onChangeText={(value) => update('representativeName', value)} maxLength={120} /></Field>
          <Field><Input label="Funcție" icon="ribbon-outline" value={form.representativeRole} onChangeText={(value) => update('representativeRole', value)} placeholder="Ex: Administrator" maxLength={80} /></Field>
        </FormSection>

        <Card style={styles.section} elevated>
          <SectionHeading icon="finger-print-outline" color={palette.cyan} background={`${palette.cyan}16`} title="Ștampila firmei" subtitle="Ștampila aparține doar firmei selectate." />
          <Pressable accessibilityRole="button" onPress={() => void pickStamp()} style={({ pressed }) => [styles.stampArea, { backgroundColor: colors.surfaceMuted, borderColor: stampUri ? `${colors.primary}70` : colors.border, opacity: pressed ? 0.78 : 1 }]}>
            {stampUri ? <Image source={{ uri: stampUri }} resizeMode="contain" style={styles.stampImage} /> : <View style={styles.stampEmpty}><View style={[styles.stampEmptyIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="image-outline" size={28} color={colors.primary} /></View><AppText variant="label">Adaugă ștampila</AppText><AppText variant="caption" muted style={styles.stampHint}>PNG, JPG sau WEBP · recomandat cu fundal transparent</AppText></View>}
          </Pressable>
          <View style={[styles.stampActions, compact && styles.stampActionsCompact]}><Button variant="outline" compact label={stampUri ? 'Înlocuiește imaginea' : 'Selectează imaginea'} icon="image-outline" onPress={() => void pickStamp()} style={styles.flexButton} />{stampUri ? <Button variant="danger" compact label="Elimină ștampila" icon="trash-outline" onPress={() => { setStampData(null); setStampRemoved(true); }} style={styles.flexButton} /> : null}</View>
        </Card>

        <View style={[styles.saveBar, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}><View style={styles.saveInfo}><Ionicons name="information-circle-outline" size={20} color={colors.primary} /><AppText variant="caption" muted style={styles.saveCopy}>Firma activă va fi salvată automat în următoarea fișă de service și în documentele generate pentru aceasta.</AppText></View><Button label={creating ? 'Adaugă firma' : 'Salvează firma'} icon="checkmark-circle-outline" loading={saving} onPress={() => void save()} style={styles.saveButton} /></View>
      </>}
    </View>
  </Screen>;
}

function SectionHeading({ icon, color, background, title, subtitle }: { icon: keyof typeof Ionicons.glyphMap; color: string; background: string; title: string; subtitle: string }) {
  return <View style={styles.sectionHeading}><View style={[styles.sectionIcon, { backgroundColor: background }]}><Ionicons name={icon} size={22} color={color} /></View><View style={styles.sectionCopy}><AppText variant="heading">{title}</AppText><AppText variant="caption" muted>{subtitle}</AppText></View></View>;
}
function FormSection({ children, compact, ...heading }: { children: React.ReactNode; compact: boolean; icon: keyof typeof Ionicons.glyphMap; color: string; background: string; title: string; subtitle: string }) {
  return <Card style={styles.section} elevated><SectionHeading {...heading} /><View style={[styles.fields, compact && styles.fieldsCompact]}>{children}</View></Card>;
}
function Field({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) { const { width } = useWindowDimensions(); return <View style={[styles.field, wide && styles.fieldWide, width < 680 && styles.fieldCompact]}>{children}</View>; }

const styles = StyleSheet.create({
  stack: { width: '100%', maxWidth: 900, alignSelf: 'center', gap: spacing.lg }, hero: { minHeight: 150, borderRadius: radius.xl, padding: spacing.xl, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: spacing.lg }, heroOrb: { position: 'absolute', width: 220, height: 220, borderRadius: 110, right: -70, top: -105, backgroundColor: 'rgba(255,255,255,0.10)' }, heroIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)' }, heroCopy: { minWidth: 0, flex: 1, gap: spacing.xs }, heroTitle: { color: '#FFFFFF' }, heroSubtitle: { color: '#D7E5FF', maxWidth: 560 }, heroBadge: { position: 'absolute', right: spacing.lg, bottom: spacing.md, minHeight: 28, paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.16)', flexDirection: 'row', alignItems: 'center', gap: 5 }, heroBadgeText: { color: '#FFFFFF', fontWeight: '800' },
  companies: { gap: spacing.md }, companiesHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, companiesHeaderCompact: { alignItems: 'stretch', flexDirection: 'column' }, companyList: { gap: spacing.sm }, companyCard: { minHeight: 72, padding: spacing.sm, borderWidth: 1.5, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, companyIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, companyCopy: { minWidth: 0, flex: 1, gap: 3 }, companyNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, companyName: { minWidth: 0, flexShrink: 1 }, activeBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.pill }, activeBadgeText: { color: '#FFFFFF', fontWeight: '900', fontSize: 9 }, emptyCompanies: { minHeight: 92, padding: spacing.lg, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', gap: spacing.sm }, editorHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xs }, editorIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  section: { gap: spacing.lg }, sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, sectionIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, sectionCopy: { minWidth: 0, flex: 1, gap: 2 }, fields: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, fieldsCompact: { flexDirection: 'column', flexWrap: 'nowrap' }, field: { minWidth: 220, flexGrow: 1, flexBasis: '31%' }, fieldWide: { flexBasis: '64%' }, fieldCompact: { minWidth: 0, width: '100%', flexBasis: 'auto', flexGrow: 0 },
  switchBox: { minWidth: 220, flexGrow: 1, flexBasis: '31%', minHeight: 58, paddingHorizontal: spacing.sm, borderWidth: 1, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, switchIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, switchCopy: { minWidth: 0, flex: 1 },
  stampArea: { minHeight: 190, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, stampImage: { width: '88%', height: 170 }, stampEmpty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl }, stampEmptyIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, stampHint: { textAlign: 'center' }, stampActions: { flexDirection: 'row', gap: spacing.md }, stampActionsCompact: { flexDirection: 'column' }, flexButton: { flex: 1 },
  saveBar: { padding: spacing.md, borderWidth: 1, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md }, saveInfo: { minWidth: 220, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, saveCopy: { minWidth: 0, flex: 1 }, saveButton: { minWidth: 220 },
});
