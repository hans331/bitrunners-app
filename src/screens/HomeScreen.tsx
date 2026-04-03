import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { requestPermissions } from '../lib/health';
import {
  performSync,
  registerBackgroundSync,
  startForegroundAutoSync,
  stopForegroundAutoSync,
} from '../lib/backgroundSync';

interface Member {
  id: string;
  name: string;
}

interface RunLog {
  id: string;
  run_date: string;
  distance_km: number;
  duration_minutes: number | null;
  memo: string | null;
}

interface Props {
  member: Member;
  onLogout: () => void;
}

export default function HomeScreen({ member, onLogout }: Props) {
  const [runs, setRuns] = useState<RunLog[]>([]);
  const [monthlyKm, setMonthlyKm] = useState(0);
  const [monthlyCount, setMonthlyCount] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const loadData = useCallback(async () => {
    try {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate =
        month === 12
          ? `${year + 1}-01-01`
          : `${year}-${String(month + 1).padStart(2, '0')}-01`;

      const { data, error } = await supabase
        .from('running_logs')
        .select('id, run_date, distance_km, duration_minutes, memo')
        .eq('member_id', member.id)
        .gte('run_date', startDate)
        .lt('run_date', endDate)
        .order('run_date', { ascending: false });

      if (error) throw error;

      const logs = (data || []) as RunLog[];
      setRuns(logs);
      setMonthlyCount(logs.length);
      setMonthlyKm(
        Math.round(
          logs.reduce((sum, r) => sum + Number(r.distance_km), 0) * 100,
        ) / 100,
      );

      const stored = await AsyncStorage.getItem('lastSync');
      if (stored) setLastSync(stored);
    } catch (e) {
      console.warn('데이터 로드 실패', e);
    } finally {
      setLoading(false);
    }
  }, [member.id, year, month]);

  // Initial load + register background sync + foreground auto-sync
  useEffect(() => {
    loadData();

    // Register background sync task
    registerBackgroundSync();

    // Auto-sync when app comes to foreground
    startForegroundAutoSync((count) => {
      // Refresh UI after background/foreground sync
      loadData();
    });

    return () => {
      stopForegroundAutoSync();
    };
  }, [loadData]);

  // Manual sync (button)
  async function handleSync() {
    setSyncing(true);
    try {
      const granted = await requestPermissions();
      if (!granted) {
        Alert.alert('권한 필요', '건강 데이터 접근 권한을 허용해주세요.');
        setSyncing(false);
        return;
      }

      const count = await performSync();
      const stored = await AsyncStorage.getItem('lastSync');
      if (stored) setLastSync(stored);

      await loadData();

      Alert.alert(
        '동기화 완료',
        count > 0
          ? `${count}건의 새 러닝 기록을 동기화했습니다.`
          : '새로운 러닝 기록이 없습니다.',
      );
    } catch (e: any) {
      Alert.alert('동기화 실패', e?.message || '오류가 발생했습니다.');
    } finally {
      setSyncing(false);
    }
  }

  async function handleLogout() {
    await AsyncStorage.removeItem('selectedMember');
    onLogout();
  }

  function onRefresh() {
    setRefreshing(true);
    loadData().finally(() => setRefreshing(false));
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const header = (
    <>
      {/* Profile header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.emoji}>🏃🏻</Text>
          <TouchableOpacity onPress={handleLogout}>
            <Text style={styles.logoutText}>로그아웃</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.greeting}>안녕하세요, {member.name}님!</Text>
        <Text style={styles.headerSub}>BIT Runners</Text>
      </View>

      {/* Monthly stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{monthlyKm}</Text>
          <Text style={styles.statLabel}>km 이번 달</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{monthlyCount}</Text>
          <Text style={styles.statLabel}>회 러닝</Text>
        </View>
      </View>

      {/* Sync button */}
      <TouchableOpacity
        style={[styles.syncButton, syncing && styles.syncButtonDisabled]}
        onPress={handleSync}
        disabled={syncing}
        activeOpacity={0.8}
      >
        {syncing ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.syncButtonText}>동기화</Text>
        )}
      </TouchableOpacity>

      {lastSync && (
        <Text style={styles.lastSyncText}>마지막 동기화: {lastSync}</Text>
      )}
      <Text style={styles.autoSyncText}>자동 동기화 활성화됨</Text>

      {/* Recent runs heading */}
      <Text style={styles.sectionTitle}>최근 러닝 기록</Text>
    </>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={runs}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#2563eb"
          />
        }
        renderItem={({ item }) => (
          <View style={styles.runCard}>
            <View style={styles.runLeft}>
              <Text style={styles.runDate}>{formatDate(item.run_date)}</Text>
              {item.memo ? (
                <Text style={styles.runMemo} numberOfLines={1}>
                  {item.memo}
                </Text>
              ) : null}
            </View>
            <View style={styles.runRight}>
              <Text style={styles.runDistance}>{item.distance_km} km</Text>
              {item.duration_minutes ? (
                <Text style={styles.runDuration}>
                  {item.duration_minutes}분
                </Text>
              ) : null}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>이번 달 러닝 기록이 없습니다.</Text>
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
  listContent: {
    paddingBottom: 40,
  },
  header: {
    backgroundColor: '#2563eb',
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  emoji: {
    fontSize: 32,
  },
  logoutText: {
    color: '#bfdbfe',
    fontSize: 14,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
  },
  headerSub: {
    fontSize: 14,
    color: '#bfdbfe',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: -12,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#2563eb',
  },
  statLabel: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  syncButton: {
    backgroundColor: '#2563eb',
    marginHorizontal: 16,
    marginTop: 20,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  syncButtonDisabled: {
    opacity: 0.7,
  },
  syncButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  lastSyncText: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
    marginTop: 24,
    marginBottom: 12,
    marginLeft: 20,
  },
  runCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  runLeft: {
    flex: 1,
  },
  runDate: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },
  runMemo: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  runRight: {
    alignItems: 'flex-end',
  },
  runDistance: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2563eb',
  },
  runDuration: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  autoSyncText: {
    textAlign: 'center',
    color: '#22c55e',
    fontSize: 11,
    marginTop: 4,
  },
  empty: {
    textAlign: 'center',
    color: '#94a3b8',
    marginTop: 24,
    fontSize: 14,
  },
});
