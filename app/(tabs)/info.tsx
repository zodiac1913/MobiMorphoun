/**
 * Information/Support screen
 * Mirrors the Information section from Metamorphoun's web UI.
 */

import { View, Text, StyleSheet, ScrollView, Linking, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { APP_VERSION } from '../../src/version';

export default function InfoScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Information / Support</Text>

      <View style={styles.card}>
        <Text style={styles.body}>
          MobiMorphoun is a wallpaper changer that can change your wallpaper using
          pre-configured web sites or local pictures from your Camera Roll. It can
          also display quotes from built-in selections, or you can add your own
          using a JSON format like this:
        </Text>

        <View style={styles.codeBlock}>
          <Text style={styles.code}>
            {'[{"statement":"Elections are a good deal like marriages, there\'s no accounting for anyone\'s taste.","author":"Will Rogers"}]'}
          </Text>
        </View>

        <Text style={styles.body}>
          It defaults to a Christian-based wallpaper changer but has enough
          configurations to suit anyone (with some work).
        </Text>

        <Text style={styles.body}>
          It is based on the original work of{' '}
          <Text
            style={styles.link}
            onPress={() => Linking.openURL('https://github.com/peterlevi')}
          >
            Peter Levi
          </Text>
          {' '}who wrote "Variety" in Python for Linux. Now we follow in Go + React
          Native. Thank you Peter for the work and inspiration.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.subheading}>Support the Project</Text>
        <Text style={styles.body}>
          If you like this project and would like to support it, please consider
          donating to help keep it going.
        </Text>

        <TouchableOpacity
          style={styles.donateBtn}
          onPress={() => Linking.openURL('https://paypal.me/zodiac1913')}
          accessibilityLabel="Donate via PayPal"
          accessibilityRole="button"
        >
          <Ionicons name="heart" size={18} color="#fff" />
          <Text style={styles.donateBtnText}>Donate via PayPal</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.subheading}>Version</Text>
        <Text style={styles.body}>MobiMorphoun v{APP_VERSION}</Text>
        <Text style={styles.bodyDim}>
          Filters powered by Go (same engine as desktop Metamorphoun)
        </Text>
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23' },
  content: { padding: 16 },
  heading: {
    color: '#e2e8f0',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
  },
  subheading: {
    color: '#8b5cf6',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
  },
  body: {
    color: '#e2e8f0',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 10,
  },
  bodyDim: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 4,
  },
  link: {
    color: '#8b5cf6',
    textDecorationLine: 'underline',
  },
  codeBlock: {
    backgroundColor: '#0f0f23',
    borderRadius: 8,
    padding: 12,
    marginVertical: 10,
  },
  code: {
    color: '#a5f3fc',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  donateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8b5cf6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 8,
    marginTop: 4,
  },
  donateBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
