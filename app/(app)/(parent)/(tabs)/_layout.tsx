import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function TabIcon({
  name,
  focused,
}: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  focused: boolean;
}) {
  return (
    <View style={styles.iconWrapper}>
      <Ionicons name={name} size={22} color={focused ? '#B45309' : '#CBD5E1'} />
      {focused && <View style={styles.activeDot} />}
    </View>
  );
}

export default function ParentTabLayout() {
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
        tabBarActiveTintColor: '#B45309',
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
        name="notices"
        options={{
          title: '공지',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'megaphone' : 'megaphone-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '내정보',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'person' : 'person-outline'} focused={focused} />
          ),
        }}
      />
      {/* 탭바에 표시하지 않는 화면 */}
      <Tabs.Screen name="children-switch" options={{ href: null }} />
      <Tabs.Screen name="child-homework"  options={{ href: null }} />
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
    backgroundColor: '#B45309',
  },
});
