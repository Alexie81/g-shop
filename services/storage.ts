import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SESSION_KEY = 'gshop.session';

export const preferenceStorage = {
  get: (key: string) => AsyncStorage.getItem(`gshop.${key}`),
  set: (key: string, value: string) => AsyncStorage.setItem(`gshop.${key}`, value),
  remove: (key: string) => AsyncStorage.removeItem(`gshop.${key}`),
};

export const secureSessionStorage = {
  async get() {
    return Platform.OS === 'web' ? AsyncStorage.getItem(SESSION_KEY) : SecureStore.getItemAsync(SESSION_KEY);
  },
  async set(value: string) {
    if (Platform.OS === 'web') return AsyncStorage.setItem(SESSION_KEY, value);
    return SecureStore.setItemAsync(SESSION_KEY, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  },
  async remove() {
    if (Platform.OS === 'web') return AsyncStorage.removeItem(SESSION_KEY);
    return SecureStore.deleteItemAsync(SESSION_KEY);
  },
};
