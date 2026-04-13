import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

function TabIcon({
  name,
  focused,
}: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  focused: boolean;
}) {
  return (
    <View style={styles.iconWrapper}>
      <Ionicons name={name} size={22} color={focused ? '#5B50E8' : '#CBD5E1'} />
      {focused && <View style={styles.activeDot} />}
    </View>
  );
}

export default function TeacherTabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
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
      <Tabs.Screen name="create-student"    options={{ href: null }} />
      <Tabs.Screen name="homework-create"   options={{ href: null }} />
      <Tabs.Screen name="homework-review"   options={{ href: null }} />
      <Tabs.Screen name="class-select"      options={{ href: null }} />
      <Tabs.Screen name="attendance-export" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 72,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingBottom: 12,
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
