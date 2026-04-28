/**
 * ErrorBoundary — 앱 전체 UI 크래시 캐치 컴포넌트
 *
 * @react-native-firebase/crashlytics 미사용(Expo Go 미지원) 대체 솔루션.
 * 예상치 못한 에러 발생 시 화이트 스크린 대신 재시작 안내 화면을 표시한다.
 *
 * 사용법:
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  NativeModules,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { strings } from '../constants/strings';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  // 자식 컴포넌트에서 에러 발생 시 state 업데이트
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  // 에러 로깅 — 추후 Crashlytics 연동 시 이 메서드에 추가
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] 앱 크래시 감지:', error);
    console.error('[ErrorBoundary] 컴포넌트 스택:', info.componentStack);
  }

  // 앱 재시작 시도
  // - 개발 환경: DevSettings.reload() 사용
  // - 프로덕션: RCTDevMenu reload 시도, 실패 시 안내 메시지
  handleRestart = () => {
    try {
      // React Native 개발/프로덕션 공통으로 사용 가능한 reload
      if (NativeModules.DevSettings?.reload) {
        NativeModules.DevSettings.reload();
      } else {
        // 재시작 불가 환경 — 에러 상태만 초기화하여 재렌더 시도
        this.setState({ hasError: false, error: null });
      }
    } catch {
      // 재시작 실패 시 에러 상태 초기화 후 재렌더 시도
      this.setState({ hasError: false, error: null });
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* 에러 아이콘 */}
          <View style={styles.iconBox}>
            <Ionicons name="alert-circle-outline" size={56} color="#EF4444" />
          </View>

          {/* 안내 문구 */}
          <Text style={styles.title}>{strings.error.crashTitle}</Text>
          <Text style={styles.message}>{strings.error.crashMessage}</Text>

          {/* 에러 상세 (개발 환경에서만 표시) */}
          {__DEV__ && this.state.error && (
            <View style={styles.devErrorBox}>
              <Text style={styles.devErrorText} numberOfLines={6}>
                {this.state.error.toString()}
              </Text>
            </View>
          )}

          {/* 재시작 버튼 */}
          <TouchableOpacity
            style={styles.restartButton}
            onPress={this.handleRestart}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh-outline" size={18} color="#fff" style={styles.buttonIcon} />
            <Text style={styles.restartButtonText}>{strings.error.restartButton}</Text>
          </TouchableOpacity>

          {/* 프로덕션 환경 추가 안내 */}
          {!__DEV__ && (
            <Text style={styles.hint}>
              버튼이 작동하지 않으면 앱을 완전히 종료 후 다시 실행해주세요.
            </Text>
          )}
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  // 에러 아이콘 박스
  iconBox: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  // 개발 환경 에러 상세 박스
  devErrorBox: {
    width: '100%',
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  devErrorText: {
    fontSize: 12,
    color: '#991B1B',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 18,
  },
  // 재시작 버튼 (Primary 스타일)
  restartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: 32,
    backgroundColor: '#5B50E8',
    borderRadius: 14,
    marginBottom: 16,
  },
  buttonIcon: {
    marginRight: 8,
  },
  restartButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  hint: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
  },
});
