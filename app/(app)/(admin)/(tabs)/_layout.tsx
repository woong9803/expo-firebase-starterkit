import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// 탭 아이콘 컴포넌트
function TabIcon({
  name,
  focused,
}: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  focused: boolean;
}) {
  return (
    <View style={styles.iconWrapper}>
      <Ionicons
        name={name}
        size={22}
        color={focused ? '#5B50E8' : '#CBD5E1'}
      />
      {/* 활성 탭 아래 3px 닷 */}
      {focused && <View style={styles.activeDot} />}
    </View>
  );
}

export default function AdminTabLayout() {
  // 안드로이드 시스템 네비/아이폰 홈 인디케이터 영역만큼 탭바를 늘려 가림 방지
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: [
          styles.tabBar,
          {
            // ui-screens.md 규칙: 탭바 본체 60 + 안전영역(홈 인디케이터/시스템 네비)
            // paddingBottom 은 안전영역만큼만 — 라벨 아래 여백은 6 으로 압축
            height: 60 + insets.bottom,
            paddingBottom: 6 + insets.bottom,
          },
        ],
        tabBarLabelStyle: styles.tabLabel,
        tabBarActiveTintColor: '#5B50E8',
        tabBarInactiveTintColor: '#CBD5E1',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'home' : 'home-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="homework"
        options={{
          title: '숙제',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'book' : 'book-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: '출결',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'calendar' : 'calendar-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="students"
        options={{
          title: '학생',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'people' : 'people-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="notices"
        options={{
          title: '공지',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'megaphone' : 'megaphone-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '설정',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'settings' : 'settings-outline'} focused={focused} />
          ),
        }}
      />
      {/* 탭바에 표시하지 않는 화면 */}
      <Tabs.Screen name="teachers"           options={{ href: null }} />
      <Tabs.Screen name="homework-create"   options={{ href: null }} />
      <Tabs.Screen name="homework-review"   options={{ href: null }} />
      <Tabs.Screen name="attendance-export" options={{ href: null }} />
      <Tabs.Screen name="notice-create"     options={{ href: null }} />
      <Tabs.Screen name="notice-read-status" options={{ href: null }} />
      <Tabs.Screen name="video-list"        options={{ href: null }} />
      <Tabs.Screen name="video-register"    options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  iconWrapper: {
    alignItems: 'center',
    gap: 2,
  },
  activeDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#5B50E8',
  },
});
