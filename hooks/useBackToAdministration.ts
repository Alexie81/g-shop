import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler, Platform } from 'react-native';

export function useBackToAdministration() {
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/service/more');
      return true;
    });
    return () => subscription.remove();
  }, []));
}
