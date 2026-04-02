import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

interface Member {
  id: string;
  name: string;
}

interface Props {
  onLogin: (member: Member) => void;
}

export default function LoginScreen({ onLogin }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMembers();
  }, []);

  async function loadMembers() {
    try {
      const { data, error } = await supabase
        .from('members')
        .select('id, name')
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      setMembers(data || []);
    } catch (e) {
      console.warn('멤버 로드 실패', e);
    } finally {
      setLoading(false);
    }
  }

  async function selectMember(member: Member) {
    await AsyncStorage.setItem('selectedMember', JSON.stringify(member));
    onLogin(member);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.emoji}>🏃🏻</Text>
        <Text style={styles.title}>BIT Runners</Text>
        <Text style={styles.subtitle}>러닝 동기화 앱</Text>
      </View>

      <Text style={styles.prompt}>멤버를 선택하세요</Text>

      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.memberButton}
            onPress={() => selectMember(item)}
            activeOpacity={0.7}
          >
            <Text style={styles.memberName}>{item.name}</Text>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>등록된 멤버가 없습니다.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  header: {
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 32,
    backgroundColor: '#2563eb',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 14,
    color: '#bfdbfe',
    marginTop: 4,
  },
  prompt: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
    marginTop: 24,
    marginBottom: 12,
    marginLeft: 20,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  memberButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  memberName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1e293b',
  },
  arrow: {
    fontSize: 22,
    color: '#94a3b8',
    fontWeight: '300',
  },
  empty: {
    textAlign: 'center',
    color: '#94a3b8',
    marginTop: 32,
    fontSize: 14,
  },
});
