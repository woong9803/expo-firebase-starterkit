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

export default function StudentTabLayout() {
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
        name="videos"
        options={{
          title: '영상',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'play-circle' : 'play-circle-outline'} focused={focused} />
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
        name="profile"
        options={{
          title: '내정보',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'person' : 'person-outline'} focused={focused} />
          ),
        }}
      />
      {/* 탭바에 표시하지 않는 화면 */}
      <Tabs.Screen name="homework-submit" options={{ href: null }} />
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
