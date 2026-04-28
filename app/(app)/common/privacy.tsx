/**
 * app/(app)/common/privacy.tsx — 개인정보처리방침 화면
 *
 * 앱스토어 심사 필수 항목 (6개 섹션):
 *   1. 수집 항목
 *   2. 수집 목적
 *   3. 보유 기간
 *   4. 제3자 제공
 *   5. 파기 절차
 *   6. 문의처
 *
 * 접근 경로:
 *   - 온보딩 시작 화면 하단 약관 링크
 *   - 각 역할 프로필/설정 화면 메뉴
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { strings } from '../../../constants/strings';

export default function PrivacyScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      {/* ── 헤더 ── */}
      <View style={[styles.header, { paddingTop: 16 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{strings.privacy.title}</Text>
        {/* 우측 여백 균형용 빈 박스 */}
        <View style={styles.backBtn} />
      </View>

      {/* ── 본문 ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* 최종 수정일 */}
        <Text style={styles.lastUpdated}>{strings.privacy.lastUpdated}</Text>

        {/* 서문 */}
        <Text style={styles.intro}>{strings.privacy.intro}</Text>

        {/* 섹션 1 — 수집 항목 */}
        <Section title={strings.privacy.section1Title} body={strings.privacy.section1Body} />

        {/* 섹션 2 — 수집 목적 */}
        <Section title={strings.privacy.section2Title} body={strings.privacy.section2Body} />

        {/* 섹션 3 — 보유 기간 */}
        <Section title={strings.privacy.section3Title} body={strings.privacy.section3Body} />

        {/* 섹션 4 — 제3자 제공 */}
        <Section title={strings.privacy.section4Title} body={strings.privacy.section4Body} />

        {/* 섹션 5 — 파기 절차 */}
        <Section title={strings.privacy.section5Title} body={strings.privacy.section5Body} />

        {/* 섹션 6 — 문의처 */}
        <Section title={strings.privacy.section6Title} body={strings.privacy.section6Body} />

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// 섹션 서브컴포넌트 — 제목 + 본문 쌍
interface SectionProps {
  title: string;
  body: string;
}

function Section({ title, body }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  // ── 헤더 ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  // ── 본문 ──
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
  },
  lastUpdated: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 16,
  },
  intro: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 22,
    marginBottom: 24,
  },
  // ── 섹션 ──
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
  },
  sectionBody: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 22,
  },
});
