import { Stack } from 'expo-router';

import { colors } from '@/lib/theme';

export const unstable_settings = { initialRouteName: 'login' };

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }} />;
}
