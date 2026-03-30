---
description: React Native 함수형 컴포넌트를 components/ 폴더에 생성합니다
argument-hint: ComponentName
---

아래 조건에 맞게 React Native 함수형 컴포넌트를 생성해줘:

**컴포넌트 이름**: $ARGUMENTS

**작업**:
1. `components/$ARGUMENTS.tsx` 파일 생성
2. 다음 템플릿 사용:

```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface $ARGUMENTSProps {}

export default function $ARGUMENTS({}: $ARGUMENTSProps) {
  return (
    <View style={styles.container}>
      <Text>$ARGUMENTS</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
});
```

3. 완료 후 "components/$ARGUMENTS.tsx 파일이 생성되었습니다" 메시지 출력
