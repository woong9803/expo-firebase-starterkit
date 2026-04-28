/**
 * components/NoticeAttachmentPicker.tsx
 *
 * 공지 작성 시 이미지·파일 첨부 UI.
 * - 이미지 첨부 / 파일 첨부 버튼 분리
 * - 최대 5개 / 개당 10MB 제한
 * - 선택된 첨부 미리보기 카드(이미지=썸네일, 파일=아이콘)
 * - 부모는 PendingNoticeAttachment[] 만 관리하면 됨
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import type { PendingNoticeAttachment } from '../lib/notice';

const MAX_COUNT = 5;
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

interface Props {
  attachments: PendingNoticeAttachment[];
  onChange: (next: PendingNoticeAttachment[]) => void;
}

export default function NoticeAttachmentPicker({ attachments, onChange }: Props) {
  // 갯수 초과 검사 — 공통
  const checkSlot = useCallback((addCount: number) => {
    if (attachments.length + addCount > MAX_COUNT) {
      Alert.alert('첨부 제한', `최대 ${MAX_COUNT}개까지 첨부할 수 있어요.`);
      return false;
    }
    return true;
  }, [attachments.length]);

  // 이미지 선택 (앨범)
  const pickImages = useCallback(async () => {
    const remaining = MAX_COUNT - attachments.length;
    if (remaining <= 0) {
      Alert.alert('첨부 제한', `최대 ${MAX_COUNT}개까지 첨부할 수 있어요.`);
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('권한 필요', '사진 라이브러리 접근 권한이 필요해요.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });
    if (result.canceled) return;

    const next: PendingNoticeAttachment[] = [];
    for (const asset of result.assets) {
      const size = asset.fileSize ?? 0;
      if (size > MAX_SIZE_BYTES) {
        Alert.alert('용량 초과', `${asset.fileName ?? '이미지'}는 10MB를 초과해요.`);
        continue;
      }
      next.push({
        uri: asset.uri,
        name: asset.fileName ?? `image_${Date.now()}.jpg`,
        kind: 'image',
        size,
        mime: asset.mimeType ?? 'image/jpeg',
      });
    }
    if (next.length > 0) onChange([...attachments, ...next]);
  }, [attachments, onChange]);

  // 파일 선택 (모든 형식)
  const pickFiles = useCallback(async () => {
    if (!checkSlot(1)) return;

    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;

    const remaining = MAX_COUNT - attachments.length;
    const accepted: PendingNoticeAttachment[] = [];
    for (const asset of result.assets.slice(0, remaining)) {
      const size = asset.size ?? 0;
      if (size > MAX_SIZE_BYTES) {
        Alert.alert('용량 초과', `${asset.name}는 10MB를 초과해요.`);
        continue;
      }
      // 이미지 MIME이면 kind: image로 분류 (썸네일 표시)
      const mime = asset.mimeType ?? 'application/octet-stream';
      const kind = mime.startsWith('image/') ? 'image' : 'file';
      accepted.push({
        uri: asset.uri,
        name: asset.name,
        kind,
        size,
        mime,
      });
    }
    if (accepted.length > 0) onChange([...attachments, ...accepted]);

    if (result.assets.length > remaining) {
      Alert.alert('첨부 제한', `최대 ${MAX_COUNT}개까지 첨부할 수 있어요.`);
    }
  }, [attachments, checkSlot, onChange]);

  // 첨부 제거
  const removeAt = useCallback((idx: number) => {
    onChange(attachments.filter((_, i) => i !== idx));
  }, [attachments, onChange]);

  // 파일 크기 사람이 읽기 쉬운 단위 변환
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  };

  return (
    <View style={styles.container}>
      {/* 첨부 추가 버튼 행 */}
      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.btn} onPress={pickImages} activeOpacity={0.8}>
          <Ionicons name="image-outline" size={18} color="#5B50E8" />
          <Text style={styles.btnText}>이미지 첨부</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={pickFiles} activeOpacity={0.8}>
          <Ionicons name="document-attach-outline" size={18} color="#5B50E8" />
          <Text style={styles.btnText}>파일 첨부</Text>
        </TouchableOpacity>
      </View>

      {/* 안내 텍스트 */}
      <Text style={styles.hint}>
        최대 {MAX_COUNT}개 · 개당 10MB 이하 ({attachments.length}/{MAX_COUNT})
      </Text>

      {/* 선택된 첨부 미리보기 */}
      {attachments.length > 0 && (
        <View style={styles.list}>
          {attachments.map((a, idx) => (
            <View key={`${a.uri}-${idx}`} style={styles.item}>
              {a.kind === 'image' ? (
                <Image source={{ uri: a.uri }} style={styles.thumb} />
              ) : (
                <View style={styles.fileIcon}>
                  <Ionicons name="document-text" size={22} color="#5B50E8" />
                </View>
              )}
              <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={1}>{a.name}</Text>
                <Text style={styles.itemSize}>{formatSize(a.size)}</Text>
              </View>
              <TouchableOpacity
                onPress={() => removeAt(idx)}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                activeOpacity={0.7}
              >
                <Ionicons name="close-circle" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },

  btnRow: { flexDirection: 'row', gap: 8 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
  },
  btnText: { fontSize: 14, fontWeight: '600', color: '#5B50E8' },

  hint: { fontSize: 12, color: '#94A3B8' },

  list: { gap: 8, marginTop: 4 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
  },
  thumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#E2E8F0' },
  fileIcon: {
    width: 44, height: 44, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#EEEDF9',
  },
  itemInfo: { flex: 1, gap: 2 },
  itemName: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  itemSize: { fontSize: 11, color: '#94A3B8' },
});
